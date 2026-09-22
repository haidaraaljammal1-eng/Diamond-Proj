# STRIPE-4 Payment Foundation

Production-hardening for Diamond Stripe rental payments. Off-session Road Liability charging is **not** implemented in this phase.

## Customer identity before payment

- New contracts resolve/create `Customer` at **signing** using strong identifiers (`identityNumber`, `passportNumber`, `drivingLicenseNumber`).
- Phone/email alone never merge customers.
- Ambiguous strong matches fail closed (`CUSTOMER_IDENTITY_AMBIGUOUS`).
- Legacy `SIGNED` contracts with `customerId = null` use the same resolver at payment time (`ensureContractCustomerForPayment`).

## Stripe profile (TEST/LIVE)

- `CustomerPaymentProfile`: one row per Diamond Customer × provider × `providerAccountKey` × `livemode`.
- Legacy `Customer.stripeCustomerId` is adopted only when validated for the active account/mode.
- Stripe Customer and Checkout creation use deterministic Stripe idempotency keys.

## Saved method vs authorization

- `CustomerPaymentMethod`: customer-owned card reference (safe metadata only).
- `ContractPaymentAuthorization`: per-contract future-use consent audit (version, locale, text hash, IP, User-Agent).
- `ContractCardPaymentMethod` remains a historical A4 snapshot only.

## Webhook

- HTTP: verify signature → durable `StripeWebhookEvent` inbox → **200 immediately**.
- Worker (`background-runner`): `FOR UPDATE SKIP LOCKED` claim → provider reads outside DB tx → short apply tx.
- Valid ignored Stripe events return 200.

## Callback polling

- `GET /contracts/payments/status/:statusToken` reads Diamond DB only (no per-poll Stripe calls).
- Provider reconciliation is recovery-only (`reconcilePaymentWithProvider`).

## Consent

- Backend catalog: `payment-consent.catalog.ts` (`payment_method_authorization_v1`, EN/AR).
- Public rental DTO exposes `payment.futureUseConsent` for frontend rendering.

## Legacy card-link

- `LEGACY_CARD_LINK_ENABLED=false` by default. Normal Public Rental never calls `/card-link`.
- Historical `ContractCardPaymentMethod` remains for A4 display only.

## Verified (2026-09-22)

- Migration `20260922120000_stripe4_payment_foundation` applied to development (`haidara`) and integration (`haidara_test`).
- `contracts-payment-security.test.ts` integration suite: 11/11.
- `customer-identity-resolver.test.ts` + `stripe-payment-consent.test.ts` unit suites green.
- Backend `typecheck` + `build` green; frontend `typecheck` + `build` green.
- Webhook worker inbox claim uses quoted Prisma column names (`processingStatus`, `availableAt`, …).
- `prisma migrate reset` not used.
