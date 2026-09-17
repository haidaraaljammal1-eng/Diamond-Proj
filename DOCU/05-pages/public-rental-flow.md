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

**License:** JPEG/PNG upload (one file). Loading copy: verifying. Panels: VALID (number + expiry, Continue only after server step is CONTRACT+), EXPIRED (red blocker, no Continue), UNREADABLE / REVIEW_REQUIRED (retry upload), PROVIDER_UNAVAILABLE (customer-safe unavailable; development note `OCR provider not configured`). No fake OCR.

**Contract:** official white web sheet (not PDF). Auto-filled read-only: office, `contractNumber`, vehicle, duration, amount, verified license number/expiry. Customer FormBuilder fields only: name, mobile, email, nationality, identity and/or passport, address. Pickup/return are display placeholders (`actualPickupAt` / `actualReturnAt` stay null). After FORM: required Checkbox acceptance, then Accept (`FORM → SIGNED`). No signature pad (Backend has no public signature upload).

**Payment:** Demo-like summary and Card method. `providerAvailable=false` disables Card Pay; no fake Stripe, no fake success, contract stays SIGNED. Development may preview the Card UI with Pay still disabled. States: PROCESSING, PENDING (no retry), FAILED (retry new attempt), CONFIRMED, READY_FOR_HANDOVER (no customer Car-Out). If the rental link expires while PROCESSING/PENDING, show payment status recovery instead of wiping the attempt. `statusToken` is memory only.

Link errors `CONTRACT_LINK_INVALID` / `EXPIRED` / `USED` show a branded page and hide the journey. Mobile-first (375 / 390 / 430), Arabic RTL, English LTR. Shared Button / FormBuilder / Checkbox / Card. Staff Open Link remains Development / QA preview.

Frontend unit tests live under `src/modules/public-rental/**/*.test.ts`.

## Demo Simulation Mode

Frontend-only presentation overlay for customer demos when Azure OCR or Stripe is not configured. Gate: `NEXT_PUBLIC_DEMO_SIMULATION_ENABLED=true` (never `NODE_ENV` alone). Local `npm run dev` reads `APP/frontend/.env.development`, so teammates get Simulate without copying `.env.local`. Production builds stay off unless the host sets the flag. Module: `APP/frontend/src/modules/public-rental` stays the source UI; overlay lives in `APP/frontend/src/modules/demo-simulation/`.

- In-memory Zustand only. No `localStorage`, `sessionStorage`, cookies, persisted store, Backend write, or database mutation.
- Real Contract / Vehicle / office / duration / agreed amount / currency remain the display authority.
- Simulated license results, customer autofill, acceptance, and payment states never POST OCR, form, accept, or payment endpoints.
- Visible champagne badge: Simulation Mode / وضع المحاكاة, plus Reset Simulation / إعادة ضبط المحاكاة.
- **Driver License and Passport can both be simulated** so the full identity flow can be built and visually tested before a real OCR provider is selected:
  - A simulated VALID license verifies the license and unlocks the passport step. EXPIRED and UNREADABLE stay blocked.
  - In simulation, the passport photo (or Simulate → Passport ready / Not recognized) produces a normalized passport result: `DEMO CUSTOMER`, `P1234567`, `United Arab Emirates`. Retake replaces it.
  - The overlay derives `identity` and `identityReady` with the Backend rule (VALID license AND READY passport). Continue opens the contract step only then; there is no simulation bypass.
  - Official Contract Review gets the simulated identity through the same normalized shape (`withNormalizedIdentity`). The Backend contract service has no simulation code.
  - Nothing is uploaded or persisted, and no OCR provider is reported as configured. Real mode keeps `DOCUMENT_OCR_PROVIDER=UNCONFIGURED` → `PROVIDER_UNAVAILABLE`. Simulated card payment can show PROCESSING → PENDING → CONFIRMED → READY_FOR_HANDOVER, or FAILED / PENDING, with demo reference `DEMO-PAY-00001` (never a Stripe PaymentIntent). Refresh restores Backend-derived state.
