# TARS Integration Foundation (Official)

Backend foundation aligned with **official RTA/TARS documentation**. Diamond does **not** call live TARS APIs in production today: credentials and some staging semantics remain unverified. No endpoint, field name or success assumption is invented beyond what the official docs establish.

Module: `APP/backend/src/modules/integrations/tars/`. Prisma: `APP/backend/prisma/schema/tars.prisma`.

## 1. Diamond remains Source of Truth

`Contract`, `Customer`, `Vehicle`, payments, Car-Out/Car-In, reconciliation and attachments stay authoritative. TARS tables store only:

- external identifiers (`externalRentalDid`, legacy `externalContractId`, Vehicle DID)
- async `providerRequestId`
- operation attempt history
- OTP challenge metadata (never the OTP value)
- safe provider error codes and timestamps

Never stored: raw TARS request/response bodies, credentials, OTP plaintext, attachment bytes.

## 2. Operating companies — separate integrations

| Routing source | Provider selection |
| -------------- | ------------------ |
| `Contract.companyId` | Contract rental lifecycle + OTP |
| `Vehicle.companyId` | Vehicle DID sync |

UNIQUE and ELITE are **independent** TARS integrations. No fallback, no default company, no crossover. `createTarsProvider(companyCode)` is the only selection point.

Per-company configuration namespaces: `TARS_UNIQUE_*` and `TARS_ELITE_*` (base URL, auth, agency DID, client credentials shell, timeouts). See [tars-api-scope-matrix.md](./tars-api-scope-matrix.md).

Central orchestration: `TarsWorkflowOrchestrator` (`tars-workflow.orchestrator.ts`) — domain code must not scatter TARS calls.

## 3. Official capabilities (current writes)

| Capability | `TarsOperationType` | Notes |
| ---------- | ------------------- | ----- |
| Create rental | `CREATE_RENTAL` | Async — HTTP 202 is **not** success |
| Update rental | `UPDATE_RENTAL` | Repeatable per `correlationSubject` (renewal id, revision, …) |
| Return rental | `RETURN_RENTAL` | Async |
| Settle rental | `SETTLE_RENTAL` | Async |

Legacy enum values (`REGISTER_CONTRACT`, `CONTRACT_ACCEPTANCE`, `HANDOVER`, `RETURN_DOCUMENTATION`, `COMPLETE_CONTRACT`) remain in the database for migration-safe history. New writes use official types only.

## 4. Async operation model

Statuses for new rows:

| Status | Meaning |
| ------ | ------- |
| `SUBMITTING` | Diamond claimed the attempt; provider call in flight |
| `PENDING_PROVIDER` | TARS accepted the request (e.g. HTTP 202) — `providerRequestId` stored |
| `SUCCEEDED` | Authoritative success from TARS status poll / immediate confirmed response |
| `FAILED` | Terminal failure |

Legacy `PENDING` / `PROCESSING` rows map to `SUBMITTING` in staff projections.

Pattern: **claim → provider call outside transaction → persist outcome**. `refreshPendingOperation()` polls `getAsyncRequestStatus(providerRequestId)` when a real provider exists.

## 5. Vehicle TARS DID

`TarsVehicleIntegration` — scoped by `(vehicleId, companyId)`:

- `externalVehicleDid`
- `syncStatus` (`NOT_STARTED` … `SYNCED` / `FAILED`)
- `lastSuccessfulSyncAt`, `lastErrorCode`

Future logic: reuse DID when present; otherwise lookup → store → create only when officially required. Not wired to Finance or Maintenance.

## 6. Attachments

`TarsAttachmentUpload` maps Diamond `Attachment` → TARS upload result per company (`externalUrl`, `externalHash`). No staff-authenticated Diamond stream URL assumption. Upload network calls are **not** implemented until multipart contract is confirmed in staging.

## 7. OTP / digital contract approval foundation

Separate from Diamond-generated OTP.

Provider boundary:

- `requestContractOtp(...)`
- `verifyContractOtp(...)`

`TarsContractOtpChallenge` stores challenge reference, masked destination, expiry, verification status, attempt count — **never** the OTP code.

### Public rental API (token-scoped)

| Route | Purpose |
| ----- | ------- |
| `POST /contracts/rental/:token/tars-otp/request` | Request OTP (rate-limited) |
| `POST /contracts/rental/:token/tars-otp/verify` | Verify OTP (rate-limited) |

Rules: token-only auth; contract/company/mobile derived server-side; fail closed when provider unconfigured; generic safe errors; signing blocked server-side when OTP required and not `VERIFIED`.

Public rental context includes `tarsOtp` state for UX. Frontend **Verify identity** step is decoupled from CREATE_RENTAL timing.

Diamond OTP UI statuses (not official TARS names): `NOT_REQUIRED`, `NOT_STARTED`, `CODE_SENT`, `VERIFIED`, `FAILED`, `EXPIRED`, `RATE_LIMITED`, `UNAVAILABLE`. Frontend adds local `REQUESTING` / `VERIFYING` during API calls. Provider may supply `otpLength`, `expiresAt`, `resendAvailableAt`, `attemptsRemaining`.

## 8. CREATE_RENTAL timing — unresolved

**Decision gate:** `TARS_CREATE_RENTAL_CHECKPOINT_PENDING_STAGING_VERIFICATION`

> Does TARS require an existing Rental DID before contract OTP / digital approval?

Architecture supports both answers (OTP before or after CREATE_RENTAL). **Do not wire** CREATE_RENTAL to Car-Out or OTP until staging confirms.

## 9. Road liabilities

Official TARS docs confirm charges, Salik and fines capabilities. `tarsTrafficCapabilityVerified` is no longer conceptually unknown, but **no ingest adapter** is built in this phase. Road Liabilities remains independent of Contract TARS lifecycle.

## 10. Staff API

`GET /contracts/:id/tars` — read-only projection (official + legacy operation keys, `externalRentalDid`). No execute/retry from the frontend.

## 11. Contract lifecycle

TARS state does **not** extend `Contract.status`. Existing Public Rental, FORM, signatures, Stripe, PAID, Car-Out/Car-In, Renewal, Reconciliation, Close and Finance behaviour is unchanged.

## 12. Tests

Unit: `tests/unit/tars-official-foundation.test.ts`, `tests/unit/tars-integration.test.ts`. Integration (disposable DB): `tests/integration/tars-integration.test.ts` with `RUN_INTEGRATION=true`.

## 13. Staging questions (open)

1. Rental DID required before OTP?
2. Exact async status poll endpoint and terminal payloads
3. Vehicle lookup/create API shapes and mandatory fields
4. TARS Upload multipart contract (fields, hash algorithm)
5. Per-company credential storage (`agencyDid`, client id/secret, rental counter)
6. OTP delivery channel semantics and authoritative expiry
