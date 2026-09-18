# Payments backend (Stripe V1)

Diamond V1 customer payments use **Stripe Checkout only**. Money is collected only after a verified provider confirmation (webhook primary, status poll fallback). There is no manual staff confirmation and no fake runtime success.

Customers may first link a card through Stripe Checkout setup mode. The browser returns only a Checkout Session id; the backend retrieves the Stripe Session/SetupIntent, verifies the Contract metadata, and stores safe card metadata (`stripeCustomerId`, `stripePaymentMethodId`, brand, last4). Later rental Checkout prefers the saved Stripe customer when available, while Stripe still owns any 3DS/SCA customer action.

Rental payment requires that saved Customer and PaymentMethod reference. The backend derives amount/currency from the Contract and starts a separate card-only Checkout payment session. A completed Checkout event confirms money only when Stripe reports `payment_status=paid`; a return URL alone never settles the Contract. An open Checkout remains in flight through a card decline or customer authentication request. Before another attempt, the backend reconciles any prior active session with Stripe and blocks an unresolved attempt, including one whose Checkout URL has expired locally. The public return page polls the status token and offers the existing Checkout URL while the attempt remains in flight.

Public rental payment POST requires `Idempotency-Key`; missing keys are rejected before creating an attempt. The browser generates one key per user action and never retries this POST automatically.

## Model

`ContractPayment` rows are provider attempts tied to an obligation:

| Field | Purpose |
|-------|---------|
| `purpose` | `RENTAL`, `RENEWAL`, `RECONCILIATION`, `POST_CLOSE_RECEIVABLE` |
| `targetId` | Obligation id (contract, renewal, reconciliation, receivable) |
| `amount` / `currency` | Immutable snapshot from the domain record |
| `checkoutUrl` / `checkoutExpiresAt` | Stripe Checkout session |
| `providerReference` | Stripe session id |

Settlement linkage:

- `ContractReconciliation.settledAt` / `settledPaymentId`
- `ContractPostCloseReceivable.settledAt` / `settledPaymentId` + `status = SETTLED`
- `ContractRenewal.appliedAt` / `settledPaymentId`

`StripeWebhookEvent` stores processed Stripe event ids for idempotency.

## Routes

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /contracts/rental/:token/payment` | Public token | Start rental checkout |
| `POST /contracts/rental/:token/card-link` | Public token | Start card setup checkout |
| `GET /contracts/rental/:token/card-link/return` | Public token | Validate setup return and persist safe card metadata |
| `GET /contracts/payments/status/:statusToken` | Public token | Poll attempt status |
| `POST /contracts/renew/:token/payment` | Public token | Start renewal checkout |
| `POST /contracts/:id/reconciliation/payment` | `contracts.reconcile` | Reconciliation checkout |
| `POST /contracts/:id/post-close-receivables/:receivableId/payment` | `violations.charge` | Post-close checkout |
| `POST /payments/webhooks/stripe` | Stripe signature | Authoritative confirmation |
| `POST /contracts/:id/payment/confirm` | **Disabled** (`MANUAL_PAYMENT_DISABLED`) | Legacy route retained |

## Configuration

```env
PAYMENT_PROVIDER=stripe   # or none
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

When unconfigured: `PAYMENT_PROVIDER_NOT_CONFIGURED` — no checkout URL, no domain mutation.

## Development payment provider substitution

Diamond does not have a general workflow simulation anymore. With `NODE_ENV !== production` and `DIAMOND_SIMULATION_ENABLED=true`, a valid real Rental Link may invoke the DEV successful-payment action on a real SIGNED Contract. The backend resolves the current obligation amount/currency, uses an `Idempotency-Key` and advisory lock, rejects an active real attempt, creates a `ContractPayment` with `provider=dev_simulation`, and calls the same domain settlement service as verified Stripe success. `SIGNED -> PAID` and vehicle reservation are persisted. No Stripe call, webhook, provider id, or fake card metadata is created. A duplicate call returns the settled state.

The DEV payment capability skips Stripe Card Setup before signing; real legal signatures remain mandatory. When DEV mode is off, normal Stripe Card Setup, Checkout and webhook/status verification return. Production never registers DEV mutation routes.
## Events

Confirmed payments emit `payment.confirmed` on the contract outbox with `paymentId`, `purpose`, `contractId`, `targetId`, `amount`, `currency`.

## Finance integration

On trusted Stripe confirmation, `recordStripePaymentLedger` appends one `FinancialLedgerEntry` (`dedupeKey = payment:<id>`) inside the same transaction as domain settlement. Historical `MANUAL` / `BANK_TRANSFER` rows never produce Finance Collected. See [finance-backend.md](./finance-backend.md).

## Legacy backfill

Existing `contract_payments` rows default to `purpose = RENTAL` and `targetId = contractId`. Historical `MANUAL` / `BANK_TRANSFER` rows are preserved and never converted to Stripe. Finance V1 Collected excludes them even when `status = CONFIRMED`.

## Verification (automated)

Integration coverage (requires `RUN_INTEGRATION=true` + `TEST_DATABASE_URL`):

- `contracts-reconciliation-payment.test.ts` — 570 AED scenario, close blocked until settled, webhook idempotency
- `contracts-post-close-payment.test.ts` — 120 AED post-close receivable, CLOSED contract unchanged
- `contracts-payment-security.test.ts` — duplicate checkout/webhook, poll/webhook race, invalid signature, amount/currency/reference mismatch, manual confirm disabled
- `contracts-renewal.test.ts` — renewal applies only after payment
- `tars-integration.test.ts` — uses `fake-payment-provider` test double (not manual confirm)

Frontend: `public-rental` payment-view tests, `public-renewal` payment-view + i18n tests, `contracts-payment-ui` policy tests. Playwright covers public rental, reconciliation-required close, post-close, renewal payment, AR/RTL, EN/LTR, and Stripe-unconfigured UX via route mocks/test doubles only.
