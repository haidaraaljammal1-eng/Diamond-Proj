# Public Rental Flow V2

Backend support and customer frontend for the three public rental pages: driving-license verification, official contract, secure payment. There is no parallel `Rental` model. The existing Contract aggregate and lifecycle stay:

`AWAITING → FORM → SIGNED → PAID → ACTIVE → RETOUT → REVIEW → CLOSED`

Staff JWT is never used on public customer routes. The opaque Rental token (and, after a real card attempt, a payment-status token) is the scoped credential. Related staff APIs remain in `DOCU/05-pages/contracts-backend.md`. Staff Contracts UI remains in `DOCU/05-pages/contracts.md`.

## 1. Three-step customer flow

| Later UI | Server-derived `flow.step` | Contract status (typical) |
| -------- | -------------------------- | ------------------------- |
| License photo, then passport photo | `LICENSE_VERIFICATION` | `AWAITING`, identity not ready |
| Official contract | `CONTRACT` | `AWAITING` + `identity.identityReady` (VALID license **and** READY passport), or `FORM` |
| Secure payment | `PAYMENT` | `SIGNED` (or active PENDING/PROCESSING payment) |
| After paid | `READY_FOR_HANDOVER` | `PAID` and later operational statuses |

The customer never submits `contractId`, `vehicleId`, `agreedAmount`, `rentalDays`, `currency`, or `contractNumber` as authority. Those resolve from the Contract bound to the token.

## 2. Public Rental Context

`GET /contracts/rental/:token` returns a safe projection:

- `office.displayName` from `OFFICE_DISPLAY_NAME` (default `Diamond Rent Car`)
- `contract`: `contractNumber`, `status`, `termsVersion`
- `vehicle`: display name, type label, plate, year, color, VIN
- `rental`: days, agreed amount, currency, agreed start/end, `actualPickupAt` / `actualReturnAt` (null until Car-Out / Car-In)
- `licenseVerification`: status, masked number, expiry date, confidence
- `identity`: `licenseStatus`, `passport.status`, normalized `passport.fields` (only when READY), `identityReady`
- `payment`: current attempt status if any, `providerAvailable`
- `flow.step`: derived, never stored as `Contract.status`

Not exposed: internal staff users, permissions, `tokenHash`, provider secrets, legal snapshot, audit rows, raw tokens.

## 3. Server-derived flow step

`derivePublicRentalFlowStep` combines Contract status + the derived identity gate (`identityReady`) + latest payment. It is not an independent status column. `FORM` contracts stay on `CONTRACT`.

## 4. Driving-license upload

`POST /contracts/rental/:token/driving-license` (multipart). Token selects the Contract. JPEG/PNG only (no SVG). Reuses Attachment: MIME allow-list, magic bytes, size limit, generated `storageKey`, checksum. Upload is rejected if the token is invalid/expired/revoked or the Contract is past `FORM`.

Customer may not exist yet, so the file is **not** forced into `CustomerDocument` at upload time.

## 5–7. OCR provider (no fake OCR)

License and passport OCR share one provider-agnostic boundary. See `DOCU/05-pages/official-contract-identity-ocr.md`.

`uploadDrivingLicense` → `analyzeDrivingLicenseDocument` (adapter) → `analyzeDocument("DRIVER_LICENSE")` → `DocumentOcrProvider`

Runtime:

- `DOCUMENT_OCR_PROVIDER=UNCONFIGURED` (only value; legacy `none`/`azure` are read as `UNCONFIGURED`)
- No OCR vendor is selected; no vendor credentials are configured
- Unconfigured provider fails closed → license `PROVIDER_UNAVAILABLE`, passport `PROVIDER_UNAVAILABLE`
- Tests inject a deterministic provider via `setDocumentOcrProviderForTests` (refused in production)

No filename-as-license, no auto-VALID, no invented numbers or dates.

## 8–10. Verification model, expiry, confidence

`DrivingLicenseVerification` stores normalized fields only (no raw provider blobs, no image bytes). Statuses:

`PENDING | VALID | EXPIRED | UNREADABLE | REVIEW_REQUIRED | PROVIDER_UNAVAILABLE`

Expiry is a calendar **date** stored at UTC noon. Comparison uses `BUSINESS_TIMEZONE_OFFSET_MINUTES` (default 240 = Asia/Dubai UTC+4). Rule:

- expiry **yesterday** → `EXPIRED`
- expiry **today or future** → eligible as `VALID` (if number + confidence pass)

Expired license blocks form and acceptance (`409`, `DRIVING_LICENSE_EXPIRED`, `expiryDate` in context). Unreadable number or expiry → `UNREADABLE` (re-upload). Low confidence → `REVIEW_REQUIRED`.

Confidence policy is centralized (`DOCUMENT_OCR_MIN_CONFIDENCE`, default `0.8`). If field confidences exist, **both** license number and expiry must meet the threshold. Missing overall confidence is not treated as VALID.

Replacement: previous `ContractDocument` gets `supersededAt`; a new verification is the authority. One active driving-license document per contract.

## 11–13. Official contract fields

Customer-editable (existing `PublicFormSchema`): name, mobile, email, nationality, identity and/or passport, address.

Server-owned: `contractNumber` (`DE-{year}-{nnnnnn}`), vehicle facts, `rentalDays`, `agreedAmount`, currency, agreed period, verified license number/expiry. Extra body fields such as `drivingLicenseNumber` are ignored. Diamond V1 does not use rental deposits.

When the Customer is created/updated, verified license values are copied onto Customer and the same Attachment is linked as `CustomerDocument` (no second file bytes). `actualPickupAt` / `actualReturnAt` stay null until Car-Out / Car-In. Placeholder copy such as «يُعبّأ عند استلام السيارة» is frontend i18n, never stored.

`AWAITING → FORM` only after a valid Rental link, VALID license, READY passport (`CONTRACT_IDENTITY_NOT_READY` otherwise), and required personal fields. Service performs the transition.

`FORM → SIGNED` via `ContractAcceptance` only when license is still VALID. Legal snapshot freezes customer, verified license, vehicle, commercial terms, `contractNumber`, `termsVersion`. Later master-data edits do not rewrite it.

## 14–16. Rental token lifecycle

TTL remains 72h (`CONTRACT_LINK_TTL_SECONDS.RENTAL`). Raw token is returned once; DB stores SHA-256 only.

**Before V2:** RENTAL `usedAt` was set on first completing accept (single-use).

**After V2:** RENTAL stays reusable for GET, license upload, form, accept, and payment while not expired, not revoked, and not completed. `usedAt` is set when the contract reaches **PAID** (`completeRentalLinks`). Reloads are not reuse attacks. RETURN / RENEWAL `usedAt` is unchanged.

Expired token → `CONTRACT_LINK_EXPIRED` on GET and all mutating customer actions. Revoked → `CONTRACT_LINK_INVALID`. Completed (`usedAt`) blocks new form/upload/payment (`CONTRACT_LINK_USED`). GET after PAID may still load `READY_FOR_HANDOVER` (`allowCompleted`).

## 17–24. Payment foundation

`ContractPayment` is reused (no parallel attempt model). Statuses: `PENDING | PROCESSING | CONFIRMED | FAILED | CANCELLED`.

`PaymentProvider`: creates Stripe Checkout sessions, checks provider status, validates Stripe-hosted card setup returns, and verifies webhooks. `PAYMENT_PROVIDER=none|stripe`. Keys optional; boot succeeds. Unconfigured POST → `PAYMENT_PROVIDER_NOT_CONFIGURED`; Contract stays `SIGNED`; no payment row.

Amount and currency are re-read from Contract. The public POST body does not accept amount or duration.

Eligibility: valid link, `SIGNED`, VALID license, no active PENDING/PROCESSING attempt, amount > 0, provider configured. One active attempt is enforced with `withTransaction` + advisory lock `contract_payment`. `runIdempotent` on `Idempotency-Key` (same key replays; different fingerprint → `IDEMPOTENCY_KEY_CONFLICT`). PROCESSING/PENDING block a new attempt (`PAYMENT_ALREADY_PROCESSING`). FAILED or CANCELLED allow a new attempt with a new key. UNKNOWN provider status stays PROCESSING/PENDING (never auto-FAILED).

A success URL / redirect is **not** payment proof. Public clients cannot set `CONFIRMED` or `PAID`. Stripe webhook (primary) and `GET /contracts/payments/status/:statusToken` (poll fallback) may confirm; then `SIGNED → PAID`. Staff manual `POST /contracts/:id/payment/confirm` is disabled in V1 (`MANUAL_PAYMENT_DISABLED`). See `DOCU/05-pages/payments-backend.md`.

Card linking uses Stripe Checkout setup mode before payment. `POST /contracts/rental/:token/card-link` returns a hosted setup URL. Stripe returns to `/rental/:token?card=linked&setup_session_id={CHECKOUT_SESSION_ID}`; the frontend then calls `GET /contracts/rental/:token/card-link/return?setupSessionId=...`. The backend resolves the public token, retrieves the Checkout Session/SetupIntent from Stripe, verifies it belongs to the same Contract, and persists only `stripeCustomerId`, `stripePaymentMethodId`, `cardBrand`, and `cardLast4`. Refreshing the return is idempotent. The browser never supplies a PaymentMethod id directly.

If the Rental link expires while an attempt is PROCESSING/PENDING, `GET /contracts/payments/status/:statusToken` still resolves it. The status token is random, returned once, stored hashed, read-only, scoped to one `ContractPayment`, TTL 7 days, and cannot create payments or expose PII beyond `{ status, contractStatus }`.

## 25. Security / privacy

Do not log raw Rental or payment-status tokens, license images, full license numbers, identity/passport, or card PAN/CVC. Diamond never stores raw card data. Future Stripe must use Stripe-hosted / Elements tokenization. Outbox payloads are ids/status only.

## 26. Public API routes

Prefix `/contracts`. `public: true` (no staff JWT).

| Method | Path |
| ------ | ---- |
| GET | `/contracts/rental/:token` |
| POST | `/contracts/rental/:token/driving-license` |
| GET | `/contracts/rental/:token/driving-license` |
| POST | `/contracts/rental/:token/passport` |
| GET | `/contracts/rental/:token/identity` |
| GET | `/contracts/rental/:token/official-contract` |
| PATCH | `/contracts/rental/:token/official-contract` |
| POST | `/contracts/rental/:token/form` |
| POST | `/contracts/rental/:token/accept` |
| GET | `/contracts/rental/:token/payment` |
| POST | `/contracts/rental/:token/card-link` |
| GET | `/contracts/rental/:token/card-link/return?setupSessionId=...` |
| POST | `/contracts/rental/:token/payment` |
| GET | `/contracts/payments/status/:statusToken` |

## 27. Error reasons

| reason | Typical HTTP |
| ------ | ------------ |
| `DRIVING_LICENSE_REQUIRED` | 409 |
| `DRIVING_LICENSE_OCR_NOT_CONFIGURED` | 409 |
| `DRIVING_LICENSE_UNREADABLE` / `REVIEW_REQUIRED` | 422 |
| `DRIVING_LICENSE_EXPIRED` | 409 |
| `PASSPORT_LICENSE_REQUIRED` | 409 |
| `CONTRACT_IDENTITY_NOT_READY` | 409 |
| `OFFICIAL_CONTRACT_REVIEW_LOCKED` | 409 |
| `PUBLIC_RENTAL_FORM_INCOMPLETE` | 422 |
| `PUBLIC_RENTAL_NOT_READY_FOR_ACCEPTANCE` | 409 |
| `PAYMENT_PROVIDER_NOT_CONFIGURED` | 409 |
| `PAYMENT_NOT_ALLOWED` / `PAYMENT_ALREADY_PROCESSING` | 409 |
| `PAYMENT_IDEMPOTENCY_REQUIRED` | 400 |
| `PAYMENT_ATTEMPT_NOT_FOUND` | 404 |
| `PAYMENT_STATUS_TOKEN_INVALID` / `EXPIRED` | 401 |
| `CONTRACT_LINK_INVALID` / `USED` | 401 |
| `CONTRACT_LINK_EXPIRED` | 401 |
| `CONTRACT_INVALID_TRANSITION` | 409 |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 |

## Outbox

`contract.license_uploaded`, `contract.license_verified`, `contract.passport_uploaded`, `contract.passport_processed` (ids/status only), `contract.form_completed`, `contract.signed`, `payment.started`, `payment.pending`, `payment.confirmed`, `payment.failed`, plus existing `contract.paid`.

## Tests

Unit: `tests/unit/public-rental-flow.test.ts` (expiry boundary, OCR policy, flow derivation).

Integration: `tests/integration/public-rental-flow.test.ts` + updated `contracts.test.ts`. Requires `RUN_INTEGRATION=true` and `DATABASE_URL` / `TEST_DATABASE_URL` pointing at disposable `haidara_test`. Never against Development `haidara`.

## Frontend — customer public journey

Routes (no login, no AppShell, no staff nav): `/ar/rental/[token]`, `/en/rental/[token]`. Token is the route param only — never `localStorage`, `sessionStorage`, cookies, or persisted Zustand.

Module: `APP/frontend/src/modules/public-rental/` (`api` / `hooks` / `stores` / `types` / `schemas` / `components` / `utils`). Screen → `usePublicRental` → in-memory store → public rental API → `apiRequest` (license upload uses `FormData` `fetch`). Staff `contracts.store` is not used.

`GET /contracts/rental/:token` is the source of truth. `flow.step` selects the stage: `LICENSE_VERIFICATION` → license, `CONTRACT` → official white contract, `PAYMENT` → payment, `READY_FOR_HANDOVER` → handover copy. The customer cannot jump ahead. Browser Back may show a previous stage read-only; it cannot rewind Backend lifecycle.

`RentalSummary` appears on every stage with office, vehicle, duration, amount, and currency from the Backend. The customer cannot edit them. Amounts display as `AED 3,500`; duration as `7 أيام` / `7 Days` without frontend recalculation. Contract number, plate, VIN, license number, and amounts use LTR isolation.

**License and passport:** Real uploads use the configured OCR provider. In DEV provider mode, the two labelled OCR success actions run against the same real Rental Link and persist normalized results through the same Contract identity flow. Customer master data is not created or updated.

**Official Contract:** The existing A4 view uses persisted OCR identity and the assigned Vehicle. Review and legal signatures are manual and saved through the normal backend. DEV payment provider mode skips only external Stripe Card Setup before signing; it creates no card metadata. Production still requires linked Stripe card setup.

**Payment:** The page displays the server-owned amount, currency, Contract and Vehicle. Real mode uses Stripe Checkout and backend verification. DEV provider mode offers only successful payment substitution; the shared backend settlement writes the real PAID Contract. Browser redirects or local UI state never prove payment.

Real Card Pay is enabled after Stripe-hosted setup has linked a saved card; the payment return page polls backend status until the attempt resolves and never treats a browser redirect or a temporary status-check failure as paid or declined. Stripe Checkout owns any customer authentication. Verified rental confirmation changes only `SIGNED → PAID`; Vehicle status and Car-Out remain unchanged.

Reopening a valid rental link reconciles an active rental payment with Stripe before rendering its step. The Payment page can refresh that backend result even when the browser no longer has the short-lived in-memory status token. A temporary Stripe lookup failure leaves the attempt in flight.

Link errors `CONTRACT_LINK_INVALID` / `EXPIRED` / `USED` show a branded page and hide the journey. Mobile-first (375 / 390 / 430), Arabic RTL, English LTR. Shared Button / FormBuilder / Checkbox / Card. Staff Open Link remains Development / QA preview.

Frontend unit tests live under `src/modules/public-rental/**/*.test.ts`.

## Development provider substitution

Diamond does not have a general workflow simulation anymore. The only visible DEV actions are successful Driver License OCR, successful Passport OCR, and successful Payment. They require a real Rental Link and Contract. Backend routes are registered only with `NODE_ENV !== production` and `DIAMOND_SIMULATION_ENABLED=true`; frontend controls additionally require `NEXT_PUBLIC_DIAMOND_SIMULATION=true`. The frontend flag is never authorization.

DEV OCR uses the normal OCR normalization and persisted Contract identity flow. DEV payment derives the real obligation server-side, records `provider=dev_simulation`, and invokes the same locked settlement transition used by verified Stripe payment. It is idempotent and creates no Stripe ids or fake card. Review, signatures, PAID reservation, and Car-Out are real. No SIM panel, reset, session journey, or Car-Out helper remains.

DEV payment mode omits the Stripe Card Setup requirement before signing because credentials are unavailable. Disabling it restores the normal Stripe setup and Checkout path without changing Contract or Vehicle logic. Stripe Test Mode still requires credentials/webhook verification.

Development-only routes (absent in production): `POST /contracts/rental/:token/simulation/license`, `/passport`, and `/payment`; payment requires `Idempotency-Key`.
