# TARS Integration Foundation

Backend foundation only. Diamond does **not** call any TARS API today: official TARS API documentation does not exist yet, so no endpoint, authentication scheme, request field or response field is assumed anywhere in the code. This document describes the boundary that lets the real adapter be dropped in later without rebuilding Contracts, Car-Out, Car-In, Payment or the Public Rental Flow.

Module: `APP/backend/src/modules/integrations/tars/`. Prisma: `APP/backend/prisma/schema/tars.prisma`. Contracts backend: `DOCU/05-pages/contracts-backend.md`.

## 1. Purpose and strategy

TARS integration is **mandatory-procedures-only**. Diamond integrates the TARS procedures required by the employee workflow and nothing else. Anything that is convenient, exploratory or "might be useful" is out of scope until an official requirement exists.

## 2. The five supported business operations

| Diamond capability | `TarsOperationType` | Sourced from |
| ------------------ | ------------------- | ------------ |
| Register contract | `REGISTER_CONTRACT` | `Contract` + `Customer` + `Vehicle` + rental terms + verified driving license |
| Contract acceptance | `CONTRACT_ACCEPTANCE` | `ContractAcceptance` |
| Handover | `HANDOVER` | `ContractCarOut` + `ContractCarOutPhoto` → `Attachment` |
| Return documentation | `RETURN_DOCUMENTATION` | `ContractCarIn` + `ContractCarInPhoto` → `Attachment` |
| Complete contract | `COMPLETE_CONTRACT` | `ContractReconciliation` (approved) + `Contract.closedAt` |

Customer, vehicle and rental data are **part of** `REGISTER_CONTRACT`. There is no `CUSTOMER_SYNC`, `VEHICLE_SYNC` or `RENTAL_SYNC`.

`CONTRACT_ACCEPTANCE` is one high-level capability on purpose. It is unknown whether TARS exposes send-OTP, verify-OTP, a digital signature call, several APIs or one. There are deliberately no `sendOtp()` / `verifyOtp()` provider methods; the future adapter implements the real sequence behind this single boundary.

## 3. Out of scope

No TARS integration exists or may be added for: GPS, Payments, Stripe, Maintenance, Finance, Invoices, Salik, Violations, CRM, Fleet management, Vehicle creation/editing, Pricing, WhatsApp, Marketing, Reports.

## 4. Diamond remains the Source of Truth

`Contract`, `Customer`, `Vehicle`, `ContractCarOut`, `ContractCarIn`, `ContractAcceptance`, `ContractPayment`, `Attachment`, `ContractLink`, `ContractReconciliation` and `ContractRenewal` stay authoritative. There is no `TarsCustomer`, `TarsVehicle` or `TarsRental` model. TARS tables store external references, synchronization state and operation history only — never business data and never Attachment bytes.

## 4b. UNIQUE TARS is not ELITE TARS

**Permanent rule.** TARS is not shared between the two operating companies. There
are conceptually two separate integrations:

| `Contract.company` | Provider | Configuration | Credentials | API |
| ------------------ | -------- | ------------- | ----------- | --- |
| UNIQUE | UNIQUE TARS | UNIQUE | UNIQUE | UNIQUE |
| ELITE | ELITE TARS | ELITE | ELITE | ELITE |

An ELITE contract must never reach UNIQUE TARS, and a UNIQUE contract must never
reach ELITE TARS.

**The routing source is `Contract.companyId`** — resolved to the company `code`
and passed to `createTarsProvider(companyCode)` / `getTarsConfig(companyCode)`.
It is never taken from:

- the Vehicle's current company,
- a frontend selection,
- a request query parameter,
- a global default company,
- a hardcoded `UNIQUE` or `ELITE`.

`Contract.companyId` is frozen history, so routing from it keeps an old contract
pointed at the integration it was written under, whatever happens to the fleet
later. That is what prevents provider crossover.

**Neither company is configured.** No real UNIQUE or ELITE TARS API exists yet, so
both resolve to `TarsUnconfiguredProvider`, report `configured: false`, and fail
closed with `TARS_NOT_CONFIGURED` without writing an operation row. No endpoint,
credential, token, authentication scheme, request/response schema, fake provider
or environment secret has been invented for either company.

## 5. Architecture

```
Diamond domain (Contracts, Car-Out, Car-In, Close)
      ↓  (read-only today; no automatic call)
TarsIntegrationService      tars.service.ts
      ↓
TarsMapper                  tars.mapper.ts       Diamond models → normalized DTO
      ↓
TarsProvider                tars.types.ts        five business capabilities
      ↓
TarsUnconfiguredProvider    providers/           the only provider today
      ↓
(future) TarsApiProvider  →  actual TARS API
```

| File | Role |
| ---- | ---- |
| `tars.constants.ts` | Operation types/statuses, projection keys, advisory-lock namespace, idempotency scope |
| `tars.types.ts` | Normalized Diamond DTOs, `TarsProvider`, `TarsProviderResult` |
| `tars.config.ts` | `TARS_ENABLED` only |
| `tars.errors.ts` | Stable `AppError` factories |
| `tars.mapper.ts` | The single Diamond → normalized-DTO mapping point |
| `tars.provider.ts` | Provider factory + `setTarsProviderForTests` |
| `providers/tars-unconfigured.provider.ts` | Fail-closed provider |
| `tars.service.ts` | `TarsIntegrationService` |
| `tars.projection.ts` | Safe staff read projection |
| `tars.schema.ts` | Zod response contract |

HTTP calls to TARS must never live in `contracts.service.ts`, `vehicles.service.ts`, Car-Out or Car-In.

## 6. Normalized DTOs

`TarsRegisterContractInput`, `TarsContractAcceptanceInput`, `TarsHandoverInput`, `TarsReturnInput` and `TarsCompleteContractInput` are Diamond-owned. Field names are Diamond concepts, not guessed TARS names. Values come only from persisted state, so a client cannot supply an alternative vehicle, customer, amount, duration or contract number as TARS authority — the mapper's only input is the Contract aggregate.

Driving license uses the backend-verified value: the latest `VALID` `DrivingLicenseVerification`, falling back to `Customer.drivingLicenseNumber` (itself written from that verification). Expiry is a backend calendar date `YYYY-MM-DD`.

Inspection photos are passed as `TarsAttachmentRef` (`attachmentId`, `angle`, `mimeType`, staff-authenticated `streamPath`). No Base64, no multipart, no public URL, no byte copy — TARS upload format is unknown and belongs to the future adapter.

## 7. Persistence

`TarsContractIntegration` — one row per Contract: `contractId` (unique), `externalContractId`, `lastSuccessfulSyncAt`. Created lazily on the first execution attempt; a read never creates it.

`TarsOperation` — attempt history: `integrationId`, `contractId`, `operationType`, `status`, `idempotencyKey`, `requestFingerprint`, `attemptNumber`, `externalReference`, `providerOperationId`, `lastErrorCode`, `startedAt`, `completedAt`.

There is deliberately **no** `UNIQUE(contractId, operationType)`: a failed mandatory procedure must be retryable and every attempt stays auditable.

Migration: `20260909130000_tars_integration_foundation` (additive only).

## 8. Operation statuses

`PENDING` → `PROCESSING` → `SUCCEEDED` | `FAILED`. `PENDING` is reserved for a future queued execution; `execute` claims straight to `PROCESSING`.

"Not configured" is a **provider capability state**, not an operation status. An unconfigured run writes no row at all, so the projection stays `NOT_STARTED`. A missing operation always means `NOT_STARTED`.

## 9. Idempotency, concurrency and retries

- Each attempt is claimed inside a short transaction guarded by `acquireAdvisoryLock(tx, "tars_operation", "<contractId>:<operationType>")`, so two callers can never both hold `PROCESSING`. The loser gets `TARS_OPERATION_IN_PROGRESS`.
- Once an operation is authoritatively `SUCCEEDED`, a normal execution does not send it again — it raises `TARS_OPERATION_ALREADY_COMPLETED`. Any future explicit resync must be a separate, intentional and documented capability.
- An optional `idempotencyKey` uses the shared `runIdempotent` helper with scope `tars:operation:<contractId>:<operationType>` and a SHA-256 fingerprint of the normalized input. Replaying the key returns the stored outcome without re-sending. Use a **fresh** key when deliberately retrying a `FAILED` attempt.
- Retry history is preserved: attempt 1 `FAILED` and attempt 2 `SUCCEEDED` both remain, and the projection reports `SUCCEEDED`.

## 10. External reference storage

`externalContractId` lives on `TarsContractIntegration` and is written only from an authoritative provider success. The first value wins; a later operation never silently rewrites it. `Contract.contractNumber` is never modified by TARS.

Per-attempt `externalReference` and `providerOperationId` live on `TarsOperation`.

## 11. Network-call safety

A future TARS HTTP call must never run while a long Prisma transaction is open. `execute` is already shaped for this:

1. validate Diamond state and build the normalized input (no transaction),
2. claim the attempt (short transaction + advisory lock),
3. call the provider with **no** transaction open,
4. persist the outcome (short transaction).

If asynchronous retry processing is ever needed, reuse the existing `DomainOutboxEvent` outbox (`src/lib/db/outbox.ts`) and its consumer pattern. **Do not build a second outbox.** No TARS background job runs today.

## 12. Privacy

Never logged and never stored in TARS tables: passport/identity values, full driving license values beyond the normalized DTO, document or signature bytes, rental tokens, OTP values and provider credentials. `TarsOperation` stores no request or response payload; `lastErrorCode` is normalized to `[A-Z0-9_]` and truncated, so a raw HTTP body can never land in the database. A thrown provider error object is discarded rather than logged.

## 13. No fake TARS

No fake success, no simulated response, no invented `externalContractId`, `externalReference` or sync timestamp. `TarsUnconfiguredProvider` fabricates nothing.

## 14. `TARS_NOT_CONFIGURED`

`TARS_ENABLED=false` (default) and the application boots normally. Because no real adapter exists, `createTarsProvider()` always returns `TarsUnconfiguredProvider` and `execute` throws `TARS_NOT_CONFIGURED` **before** touching the database — regardless of `TARS_ENABLED`. Diamond Contract state is untouched and no operation row is written.

Configuration is intentionally minimal: only `TARS_ENABLED`. Client id/secret, API keys, OAuth URLs, certificates and signature keys arrive with the official authentication contract.

## 15. Error codes

| Reason | Meaning |
| ------ | ------- |
| `TARS_NOT_CONFIGURED` | No real TARS provider exists |
| `TARS_OPERATION_IN_PROGRESS` | Another attempt of the same type is `PROCESSING` |
| `TARS_OPERATION_ALREADY_COMPLETED` | The operation already succeeded |
| `TARS_MAPPING_INCOMPLETE` | Required Diamond data is missing (`context.missing` lists field paths, never values) |
| `TARS_PROVIDER_ERROR` | Generic future-provider failure |

No TARS vendor error codes are invented.

## 16. Staff read projection

`GET /contracts/:id/tars` — permission `contracts.read`. No new permission was invented for a read-only projection.

```json
{ "data": { "tars": {
  "configured": false,
  "company": { "id": 2, "code": "ELITE", "displayName": "ELITE", "accentColor": "#3E5C76" },
  "externalContractId": null,
  "lastSuccessfulSyncAt": null,
  "operations": {
    "registerContract": "NOT_STARTED",
    "contractAcceptance": "NOT_STARTED",
    "handover": "NOT_STARTED",
    "returnDocumentation": "NOT_STARTED",
    "completeContract": "NOT_STARTED"
  }
} } }
```

Statuses are `NOT_STARTED | PENDING | PROCESSING | SUCCEEDED | FAILED`. An authoritative `SUCCEEDED` is never downgraded by a later attempt. No placeholder rows are created to render `NOT_STARTED`.

`company` is the routing company from `Contract.companyId`, so the UI can say
which of the two integrations this contract belongs to. It is a compact ref
(`id`, `code`, `displayName`, `accentColor`) — legal names stay on the official
contract. `company` and `configured` are independent: a contract always has a
company, and today neither company is connected.

There is no execute/retry endpoint.

## 17. Staff frontend: status display only

Frontend module: `APP/frontend/src/modules/contracts`. Page documentation: `DOCU/05-pages/contracts.md`.

**Product decision.** There are deliberately **no** five TARS buttons. A Diamond action will drive TARS automatically once the official API exists, so the employee never has a second thing to remember: *Diamond action → automatic TARS integration → employee sees TARS status*. Today the frontend only reads.

| Concern | Where |
| ------- | ----- |
| HTTP | `api/tars.api.ts` — `getContractTarsState(id)` → `GET /contracts/:id/tars` |
| State | `stores/contract-tars.store.ts` — separate from `contracts.store` |
| Hook | `hooks/use-contract-tars.ts` — the only thing components use |
| Drawer section | `components/contract-tars/contract-tars-status.tsx` |
| Inline indicator | `components/contract-tars/contract-tars-inline-status.tsx` |
| Presentation policy | `utils/tars-status.ts` (pure, unit-tested) |
| Reusable row | `src/shared/components/integration-status-row/` |
| Routing company | shared `CompanyIdentity` in the section heading |

**Company display.** The section heading reads `TARS Integration Status · UNIQUE`
or `· ELITE`, rendered with the shared `CompanyIdentity` (backend `displayName`
and `accentColor`). There is no TARS-specific company badge, and the company is
read from `tars.company` — never from the Vehicle. It is identity, not status:
the connection chip beside it still answers *connected / not connected*
separately.

Showing the company added **no** action. There is still no execute, retry,
resync, test-connection or provider-configuration control anywhere in the TARS
UI, and no customer-facing TARS state. A Demo Simulation TARS preset may fake
integration state but never the company — the real `Contract.company` is merged
back over the preset.

No component calls the endpoint directly. The store is intentionally separate from `contracts.store` so a failing integration read cannot touch Contract detail state and a Contract mutation cannot force an integration refetch.

**Placement.** One section inside the existing Contract Detail Drawer, after the lifecycle timeline and before the staff action area. There is no TARS page and no TARS navigation entry. The Contract timeline is unchanged.

**Permission.** The existing `contracts.read` request. No frontend permission logic and no role-name checks were added.

**Fetching.** Once when the drawer opens or the contract id changes; the store caches per contract, so the section and the inline indicators share one request. No polling.

**Connection state.** `configured: false` renders "Not Connected" / "غير متصل حالياً" on the neutral champagne chip plus the supporting line "Synchronization will be enabled once the official TARS API is configured." This is a development state, **not** an error, so it is never red. `configured: true` renders "Connected" on the positive tone, plus `TARS Reference` (`externalContractId`, LTR-isolated so it stays readable in Arabic) and `Last Sync` (`lastSuccessfulSyncAt`, localized date/time) when present.

**Operation status mapping.** The five approved procedures, in workflow order:

| Projection key | EN | AR |
| -------------- | -- | -- |
| `registerContract` | Contract Registration | تسجيل العقد |
| `contractAcceptance` | Contract Acceptance | اعتماد العقد / التوقيع |
| `handover` | Vehicle Handover | تسليم المركبة |
| `returnDocumentation` | Vehicle Return | توثيق إعادة المركبة |
| `completeContract` | Contract Completion | إكمال العقد |

| Status | EN | AR | Visual |
| ------ | -- | -- | ------ |
| `NOT_STARTED` | Not Started | لم يبدأ | neutral chip |
| `PENDING` | Pending | بانتظار المعالجة | warm amber chip |
| `PROCESSING` | Syncing | جارٍ المزامنة | gold chip, slow opacity pulse — never a spinner |
| `SUCCEEDED` | Synced | تمت المزامنة | positive chip |
| `FAILED` | Sync Failed | فشل الربط | soft red chip, no Retry |

An unknown or missing status falls back to `NOT_STARTED`, matching the Backend projection rule.

**No execution surface.** No Register in TARS, Send to TARS, Submit Handover, Submit Return, Complete in TARS, Retry, Test TARS or Sync Now control exists. A unit test asserts the TARS components render no button, bind no click handler, and that the API module issues no non-GET request. Retry arrives only with real TARS execution routes.

**Loading and read failure.** The section owns its own surface: skeleton placeholders while loading, and on failure only "Unable to load TARS integration status." / "تعذر تحميل حالة الربط مع TARS." inside the section. The rest of the drawer keeps working.

**Workflow indicators.** Compact read-only lines were added at existing operational points — the Car-Out dialog (`TARS Handover`), the Car-In dialog and drawer Car-In record (`TARS Return`) and the Close-contract dialog (`TARS Completion`). Each renders nothing while loading or on error. They add no action, block nothing and change no validation or lifecycle.

**No customer-facing TARS state.** The public rental pages (`/[locale]/rental/[token]`) were not touched. Registration and acceptance status are staff-only. Future OTP behaviour waits for official TARS documentation.

**Demo Simulation (UI only).** When `NEXT_PUBLIC_DEMO_SIMULATION_ENABLED=true`, the existing TARS section may show a secondary Simulate control that overlays in-memory status presets (Not Started, Syncing, Synced, Partial Failure). Real TARS architecture is unchanged: no POST, no `TarsIntegrationService` call, no `TarsOperation` row, no Retry, and no simulated state persists after refresh. Inline Car-Out / Car-In / Close indicators follow the same in-memory overlay while it is active.

## 18. Current behaviour: non-blocking, not wired

Contract signing, payment, Car-Out, Car-In and Close behave exactly as before and never call TARS. The Contract lifecycle (`AWAITING → FORM → SIGNED → PAID → ACTIVE → RETOUT → REVIEW → CLOSED`) is unchanged, and no TARS state was added to `Contract.status`. A TARS failure never changes `Contract.status`, `Vehicle.operationalStatus` or payment status.

Blocking/ordering policy is **undecided**. Diamond does not assume that registration must precede payment, that acceptance must precede `SIGNED`, that handover must succeed before `ACTIVE`, that return must succeed before `REVIEW`, or that completion must succeed before `CLOSED`.

## 19. Future integration checkpoints

Documented intent only — nothing is wired:

| Diamond stage | Future operation |
| ------------- | ---------------- |
| Contract stage | `REGISTER_CONTRACT` |
| Acceptance / signing | `CONTRACT_ACCEPTANCE` |
| Car-Out | `HANDOVER` |
| Car-In | `RETURN_DOCUMENTATION` |
| Contract Close | `COMPLETE_CONTRACT` |

## 20. Installing the future adapter

1. Read the official TARS API documentation.
2. Identify the authentication scheme.
3. Map the official endpoints onto the five existing provider capabilities.
4. Implement `TarsApiProvider` under `providers/`.
5. Translate the normalized DTOs into real TARS payloads inside that adapter.
6. Translate real responses and errors into `TarsProviderResult`.
7. Add the real configuration/secrets to `src/config/env.ts` and select the adapter in `createTarsProvider()`.
8. Add integration tests using the injected provider.
9. Decide the exact lifecycle blocking/order rules from the official requirements.
10. Wire only the mandatory checkpoints.
11. Update the frontend only where employee action is genuinely required.

Rebuilding Contract, Customer, Vehicle, Car-Out, Car-In, the Public Rental Flow or Payment must not be necessary.

## 21. Waiting on official TARS documentation

- Base URLs, endpoint paths and HTTP verbs.
- Authentication (OAuth / API key / mTLS / signing) and credential configuration.
- Request and response payload schemas, casing and envelopes.
- Whether contract acceptance is one API or an OTP/signature sequence.
- Attachment transport (multipart, Base64, pre-signed upload, URL fetch) and accepted formats.
- Vendor error codes and their retryability.
- Whether TARS is authoritative for any identifier Diamond also owns.
- Idempotency support on the TARS side, and any resync/amend procedure.
- Rate limits, timeouts and SLA.
- Whether webhooks/callbacks exist.
- Which procedures are blocking for the employee workflow and in what order.

## 22. Tests

Backend unit: `tests/unit/tars-integration.test.ts` (provider fail-closed, projection rules, all five mappers). Backend integration: `tests/integration/tars-integration.test.ts` — requires `RUN_INTEGRATION=true` and a disposable `TEST_DATABASE_URL` (`haidara_test`), never the development fleet DB. A `FakeTarsProvider` is injected via `setTarsProviderForTests` in tests only.

Frontend unit: `src/modules/contracts/utils/tars-status.test.ts` — operation order, every status tone, unknown-status fallback, connection presentation, `configured` true/false summaries, external reference and last-sync passthrough, the section's own loading/error view, AR + EN label coverage, and the "no execution surface" guard. Demo Simulation overlays are covered by `src/modules/demo-simulation/simulation.test.ts`.

Frontend browser verification: `e2e/tars-status.visual.spec.ts` — AR and EN drawers against the live unconfigured backend, mobile 390px overflow, and `SUCCEEDED` / `PROCESSING` / `PENDING` / `FAILED` / connected states plus the three workflow indicators from an intercepted projection response. Interception is a **UI fixture only**; it never produces runtime TARS success.
