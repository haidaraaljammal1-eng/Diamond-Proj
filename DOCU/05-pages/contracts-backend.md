# Contracts Backend V1

Contract is the single rental aggregate. There is no parallel `Rental` model. Frontend public rental pages, White Contract PDF, live Stripe/Tamara/Tabby, Salik/Violations/Finance/Invoice engines, GPS, WhatsApp, AI damage, and Maintenance are out of scope of this backend document. Public Rental Flow V2: `DOCU/05-pages/public-rental-flow.md`.

Money is whole AED integers (same pattern as Vehicle rates). Default currency is `AED`. Contract has no `branchId` — Vehicle/Customer do not carry a clear rental-branch owner in the current schema.

## Models

Prisma: `APP/backend/prisma/schema/contracts.prisma` (Customer rental fields live on existing `Customer` in `operational.prisma`).

| Model | Role |
| ----- | ---- |
| `Contract` | Aggregate: number, status, commercial terms, legal `snapshot` JSON |
| `ContractNumberSequence` | Year-scoped allocator `DE-{year}-{nnnnnn}` |
| `ContractLink` | Public RENTAL / RETURN / RENEWAL tokens (hash only) |
| `ContractAcceptance` | Signature/acceptance metadata (optional Attachment) |
| `ContractPayment` | Payment attempts (`PENDING` / `PROCESSING` / `CONFIRMED` / `FAILED` / `CANCELLED`) |
| `ContractDocument` | Contract-scoped files (driving license before Customer exists) |
| `DrivingLicenseVerification` | Normalized OCR result; not a Contract status |
| `ContractCarOut` / `ContractCarOutPhoto` | Staff delivery inspection (8 angles → Attachment) |
| `ContractCarIn` / `ContractCarInPhoto` | Customer return inspection (8 angles → Attachment) |
| `ContractReconciliation` / `Line` | Settlement summary; amounts/refs only |
| `ContractRenewal` | Same-contract extension history |
| `CustomerDocument` | IDENTITY / PASSPORT / DRIVING_LICENSE → Attachment |

## State machine

Canonical statuses: `AWAITING → FORM → SIGNED → PAID → ACTIVE → RETOUT → REVIEW → CLOSED`.

There is no generic status PUT. Every change is an explicit service action.

| Status | Meaning |
| ------ | ------- |
| AWAITING | Offer created; rental link may be issued |
| FORM | Required customer form completed |
| SIGNED | Acceptance recorded; legal snapshot frozen |
| PAID | Confirmed payment; vehicle reserved (not yet RENTED) |
| ACTIVE | Car-Out done; vehicle RENTED |
| RETOUT | Return link issued; vehicle stays RENTED |
| REVIEW | Car-In submitted; vehicle already returned; staff reconciliation pending |
| CLOSED | Staff close; financial lifecycle ended. Vehicle availability was already decided at Car-In. |

**Car-In ends customer possession.** Contract RETOUT → REVIEW and Vehicle RENTED → AVAILABLE in the same Car-In transaction. Close does not wait for hypothetical future RTA/Salik liabilities and does not release the vehicle.

Invalid jumps (`AWAITING → ACTIVE`, `ACTIVE → CLOSED`, `RETOUT → CLOSED`, `REVIEW → ACTIVE`, any `CLOSED` transition) are rejected with `409` / `CONTRACT_INVALID_TRANSITION`.

## Contract number

Allocated server-side inside the create transaction:

1. Advisory lock `contract_number` + UTC year
2. Upsert/increment `ContractNumberSequence.lastValue`
3. Format `DE-2026-000001`

Never derived from row count.

## Vehicle integration

| Event | Vehicle |
| ----- | ------- |
| Offer / FORM / SIGNED | No lock. SERVICE vehicles cannot start an offer. |
| PAID | Reserved: blocking contract exists; `operationalStatus` unchanged |
| ACTIVE (Car-Out) | `RENTED` (same transaction) |
| RETOUT | Stays `RENTED` (customer still has the vehicle) |
| REVIEW (Car-In) | `AVAILABLE` if the vehicle was `RENTED` (custody ended). Does not overwrite `SERVICE`. |
| CLOSED | Vehicle unchanged. Close must not set AVAILABLE and must not steal a newer rental. |

Blocking / currentRental statuses: **PAID, ACTIVE, RETOUT**. REVIEW is not blocking. CLOSED is never blocking. AWAITING / FORM / SIGNED do not permanently lock the vehicle — the first offer to reach PAID wins under the lock.

Critical mutations take `withTransaction` + `acquireAdvisoryLock(tx, "vehicle_rental", vehicleId)`, then re-read Vehicle and conflicting Contracts. Second blocking contract → `409` / `VEHICLE_ALREADY_RENTED`.

Fleet `PUT` / deactivate still reject `operationalStatus = RENTED`, and also reject when a blocking Contract exists (`vehicleHasBlockingContract`).

## currentRental

`currentRental` is the **current possession/reservation context** for a vehicle — not every financially-open Contract.

Included: `PAID | ACTIVE | RETOUT`.  
Excluded: `AWAITING | FORM | SIGNED | REVIEW | CLOSED`.

A REVIEW Contract after Car-In must not appear as `currentRental`. The vehicle may enter a new valid Contract while the prior Contract stays in REVIEW.

Shape:

```json
{ "contractId": "…", "customerName": "…", "endAt": "…", "status": "paid"|"active"|"retout" }
```

At **PAID**: Vehicle `operationalStatus` stays `AVAILABLE` (Car-Out has not happened). `currentRental.status` is `"paid"` so the fleet page can see the reservation. Fleet edit/deactivate remain 409 because PAID is a blocking contract.

Batch-loaded with `loadCurrentRentalsByVehicleIds` (one query, no N+1). If corrupt data has two blocking contracts, the oldest (`createdAt`, then `id`) is returned and the duplicate is logged — never a random pick.

## Customer

Reuse `Customer`. Nullable rental fields: `nationality`, `identityNumber`, `passportNumber`, `drivingLicenseNumber`, `drivingLicenseExpiry`, `address`. Documents use `CustomerDocument` + shared `Attachment` (no blobs on Customer). Public form must not send `vehicleId`, amount, `contractNumber`, or status.

## Snapshot

Written at SIGNED (not rewritten later). Contains `contractNumber`, customer identity including verified driving-license number/expiry, vehicle display facts, commercial terms, and `termsVersion`. White Contract PDF must read this snapshot later — never live master data. No PDF is generated in this phase.

## Public links

Opaque tokens via existing `generateOpaqueToken` / `hashToken`. Raw token returned **once**. DB stores SHA-256 hex only. Lookup uses hash + `timingSafeEqual`. TTL (`contracts.constants.ts`): RENTAL 72h, RETURN 24h, RENEWAL 48h. Supports expiry and revocation. Re-issuing a link of the same type revokes the previous unused token.

RENTAL `usedAt` is set when the contract reaches **PAID** (not on first GET or accept), so the customer can reload across license, form, sign, and payment. RETURN marks `usedAt` on Car-In (staff or public token). RETURN GET still resolves a used, unexpired token so the customer can see a received state. RENEWAL is unchanged. See `DOCU/05-pages/public-rental-flow.md`.

Public token routes live under `routes/public/` with an empty public hook — **no staff JWT and no staff permissions**. The opaque token is the only customer credential. Autoload strips `routes/public`, so URLs stay `/contracts/rental/:token` (not `/public/contracts/...`). Never log raw tokens or PII in outbox payloads. Rental GET returns `PublicRentalContextSchema` (office, vehicle, flow step, license, payment). RETURN/RENEWAL GET use `PublicContractViewSchema` (includes `office.displayName` from `OFFICE_DISPLAY_NAME`; no TARS, reconciliation, or payment internals).

## Payment foundation

`ContractPayment`: amount, currency, method (`BANK_TRANSFER | CARD | MANUAL`), status (`PENDING | PROCESSING | CONFIRMED | FAILED | CANCELLED`), optional `externalReference`, plus provider reference fields and a hashed payment-status token. Staff `POST .../payment/confirm` remains the manual/bank SIGNED → PAID path. Electronic card payment uses `PaymentProvider` (Stripe adapter is not live; no fake success). Public card POST never accepts amount. Redirect URLs are not confirmation. Details: `DOCU/05-pages/public-rental-flow.md`.

## Car-Out / Car-In

Eight Demo angles: FRONT, REAR, RIGHT_SIDE, LEFT_SIDE, FRONT_PLATE, REAR_PLATE, INTERIOR_ODOMETER, TIRES. Junctions reference Attachment; they are **not** `VehiclePhoto`. Stream routes are authenticated (`contracts.read`).

Staff Car-In: `POST /contracts/:id/car-in` (`contracts.return`) on RETOUT. Public token Car-In: `POST /contracts/return/:token/car-in` (used RETURN tokens are allowed so a second submit after REVIEW is idempotent). Both write `ContractCarIn` + eight photos, transition RETOUT → REVIEW, emit `contract.return_submitted`, and if the vehicle is RENTED set it AVAILABLE in the same transaction (advisory lock `vehicle_rental`). Car-In never closes the Contract. REVIEW means financial/operational review is still open, not that the customer still has the vehicle.

GPS Salik intelligence is a derived Contract projection (`roadLiabilitySignals`), not a stored boolean and not a lifecycle hold. Detail also includes a compact `postCloseReceivables` summary (count, openAmount, bounded items) without N+1.

Car-Out is the future TARS `HANDOVER` integration checkpoint and Car-In the future `RETURN_DOCUMENTATION` checkpoint. Neither calls TARS today, and the sequencing is unconfirmed. See `DOCU/04-api-contracts/tars-integration.md`.

## Reconciliation

Staff-owned settlement at Contract status **REVIEW** (after Car-In). Line types: DAMAGE, FUEL, LATE, SALIK, VIOLATION, OTHER.

New manual `SALIK` / `VIOLATION` lines are not accepted (`ROAD_LIABILITY_REQUIRED`). Those charges must originate from a confirmed `RoadLiability` via confirm-charge. Existing historical manual SALIK/VIOLATION rows remain readable and are not migrated or deleted.

RoadLiability-backed lines: unique `roadLiabilityId`, `line.amount` = final customer charge, `officialAmountSnapshot` / `adjustmentAmount` / `adjustmentReason` preserved. `POST /contracts/:id/reconcile` keeps those lines (does not delete/recreate them) and adds DAMAGE/FUEL/LATE/OTHER from the payload. Totals use customer charge once — adjustment is metadata, not a second line.

Saving reconciliation sets `approvedAt` (V1: reconcile action is the approval). Confirm-charge locks the liability snapshot but does not by itself mark the reconciliation approved or the liability `SETTLED`.

## Close

Requires REVIEW + Car-In + approved reconciliation. Same transaction: status CLOSED, `closedAt`, audit, outbox `contract.closed`. Close does **not** set Vehicle AVAILABLE and must not overwrite SERVICE or a newer rental's RENTED status.

## Renewal

Same Contract, history in `ContractRenewal`. Eligible **ACTIVE only** (not RETOUT). Updates `rentalDays`, `agreedAmount`, `endAt`. Staff `POST .../renew` or public `POST /contracts/renew/:token/confirm`.

## Permissions

Staff only. Public token routes have no staff permissions.

| Permission | Typical actions |
| ---------- | --------------- |
| `contracts.read` | List, detail, inspection streams |
| `contracts.manage` | Create offer, rental link, confirm payment |
| `contracts.activate` + `contracts.car_out` | Car-Out (both required on the route) |
| `contracts.return` | Return link + staff Car-In |
| `contracts.reconcile` | Reconciliation |
| `contracts.close` | Close |
| `contracts.renew` | Renewal link + renew |

## Admin routes

| Method | Path | Permission |
| ------ | ---- | ---------- |
| GET | `/contracts` | read |
| GET | `/contracts/:id` | read |
| POST | `/contracts/offers` | manage |
| POST | `/contracts/:id/rental-link` | manage |
| POST | `/contracts/:id/payment/confirm` | manage |
| POST | `/contracts/:id/car-out` | car_out + activate |
| POST | `/contracts/:id/return-link` | return |
| POST | `/contracts/:id/car-in` | return |
| POST | `/contracts/:id/reconcile` | reconcile |
| GET | `/contracts/:id/reconciliation/road-liabilities` | reconcile |
| POST | `/contracts/:id/reconciliation/road-liabilities/:roadLiabilityId/confirm-charge` | reconcile |
| POST | `/contracts/:id/close` | close |
| POST | `/contracts/:id/renewal-link` | renew (body: `additionalDays`, `additionalAmount`) |
| POST | `/contracts/:id/renew` | renew |
| GET | `/contracts/:id/car-out/photos/:photoId/stream` | read |
| GET | `/contracts/:id/car-in/photos/:photoId/stream` | read |
| GET | `/contracts/:id/tars` | read |

List query: `search` (number, plate, vehicle name, customer name/phone), `status`, `vehicleId`, `customerId`, `from`/`to`, `page`, `pageSize`, `sort`. List items include `hasSalikGpsSignal` (batched). Detail includes core, vehicle/customer refs, snapshot, payment summary, Car-Out/In, reconciliation, renewals, `roadLiabilitySignals`, `postCloseReceivables`, and `actions` capability flags (`canCarIn` is true on RETOUT with no Car-In yet). No raw tokens.

## Public routes

| Method | Path |
| ------ | ---- |
| GET | `/contracts/rental/:token` |
| POST | `/contracts/rental/:token/driving-license` |
| GET | `/contracts/rental/:token/driving-license` |
| POST | `/contracts/rental/:token/form` |
| POST | `/contracts/rental/:token/accept` |
| GET | `/contracts/rental/:token/payment` |
| POST | `/contracts/rental/:token/payment` |
| GET | `/contracts/payments/status/:statusToken` |
| GET | `/contracts/return/:token` |
| POST | `/contracts/return/:token/car-in` |
| GET | `/contracts/renew/:token` |
| POST | `/contracts/renew/:token/confirm` |

`POST /contracts/:id/renewal-link` is ACTIVE-only. It upserts a pending `ContractRenewal` (the stored offer) and issues an opaque hashed RENEWAL token (`CONTRACT_LINK_TTL_SECONDS.RENEWAL` = 48h). Prior unused RENEWAL links are revoked. Public `GET /contracts/renew/:token` returns `PublicContractView` plus optional `renewal` (`additionalDays`, `additionalAmount`, `previousEndAt`, `newEndAt`, `confirmed`). Used RENEWAL tokens may be re-read (`allowCompleted`) for the success reload. Public `POST /contracts/renew/:token/confirm` ignores client days/amount and applies the pending offer on the **same** Contract. The Contract stays ACTIVE; Vehicle stays RENTED; no second Contract is created. Staff `POST /contracts/:id/renew` still applies immediately, deletes pending offers, and revokes unused RENEWAL links. Duplicate public confirm is idempotent (same totals, same contract number). No TARS renewal execution. No payment/Stripe on renewal.

## Errors

Stable `AppError.code` + `context.reason`:

| reason | HTTP (via ErrorCode) |
| ------ | -------------------- |
| `CONTRACT_NOT_FOUND` | 404 |
| `CONTRACT_INVALID_TRANSITION` | 409 |
| `VEHICLE_NOT_AVAILABLE` | 409 |
| `VEHICLE_ALREADY_RENTED` | 409 |
| `CONTRACT_LINK_INVALID` / `USED` | 401 (`TOKEN_INVALID`) |
| `CONTRACT_LINK_EXPIRED` | 401 (`TOKEN_EXPIRED`) |
| `DRIVING_LICENSE_*` / `PAYMENT_*` / `PUBLIC_RENTAL_*` | see public-rental-flow.md |
| `CONTRACT_PAYMENT_REQUIRED` | 409 |
| `CONTRACT_CAR_OUT_REQUIRED` | 409 |
| `CONTRACT_CAR_IN_REQUIRED` | 409 |
| `CONTRACT_RECONCILIATION_REQUIRED` | 409 |
| `CONTRACT_ALREADY_CLOSED` | 409 |
| `ROAD_LIABILITY_REQUIRED` | 409 |
| `ROAD_LIABILITY_NOT_CHARGEABLE` | 409 |
| `ROAD_LIABILITY_CONTRACT_MISMATCH` | 409 |
| `ROAD_LIABILITY_ALREADY_CHARGED` | 409 |
| `CUSTOMER_CHARGE_BELOW_OFFICIAL` / `ADJUSTMENT_REASON_REQUIRED` / `INVALID_CUSTOMER_CHARGE` | 422 |

## Transactions / idempotency / outbox / audit

Atomic Contract+Vehicle writes: payment confirm, Car-Out, Car-In (vehicle AVAILABLE), renewal. Close is transactional for the Contract only (vehicle unchanged). Idempotency via existing `runIdempotent` when `Idempotency-Key` is sent: payment confirm, Car-Out, Car-In, close, renew, confirm-charge. Unified charge confirm uses scope `road-liability:confirm-charge:${roadLiabilityId}`; the old Contract wrapper remains REVIEW-only. Same key + same payload replays the current result. Same key + different payload → `409` / `IDEMPOTENCY_KEY_CONFLICT`. Transitions also no-op if already at the target status. Confirm-charge also uses DB unique `RoadLiabilityCustomerCharge.roadLiabilityId` + advisory locks `contract_reconcile` / `road_liability_charge`.

Outbox events (IDs / non-PII only): `contract.created`, `contract.license_uploaded`, `contract.license_verified`, `contract.form_completed`, `contract.signed`, `payment.started`, `payment.pending`, `payment.confirmed`, `payment.failed`, `contract.paid`, `contract.activated`, `contract.return_started`, `contract.return_submitted`, `contract.closed`, `contract.renewed`.

Staff audit via `request.setAudit` on create, links, payment, Car-Out, Car-In, return, reconcile, close, renew.

## Tests

Unit: `tests/unit/contracts-status.test.ts` (includes 48h RENEWAL TTL), `tests/unit/public-rental-flow.test.ts`, `tests/unit/contracts-road-liability-charge.test.ts`. Integration: `tests/integration/contracts.test.ts`, `tests/integration/contracts-renewal.test.ts`, `tests/integration/public-rental-flow.test.ts`, and `tests/integration/contracts-road-liability-charge.test.ts` — require `RUN_INTEGRATION=true` and `DATABASE_URL`/`TEST_DATABASE_URL` pointing at disposable `haidara_test`. Do not run against Development `haidara`. No fake active contracts are seeded onto the Development Fleet.

## TARS Integration Boundary

Contracts does **not** depend on TARS and never calls it directly. TARS is reached only through `TarsIntegrationService` → `TarsProvider`, which lives in `src/modules/integrations/tars/`. Integration state is stored separately (`TarsContractIntegration`, `TarsOperation`) and is independent of `Contract.status` — no TARS state was added to the lifecycle.

In this phase nothing is wired: signing, payment, Car-Out, Car-In and Close behave exactly as documented above, and no real TARS API exists (`TARS_NOT_CONFIGURED`). The only Contracts-facing surface is the read-only `GET /contracts/:id/tars` projection (`contracts.read`). Full detail — provider/mapper architecture, retry and idempotency rules, privacy rules and future checkpoints — lives in `DOCU/04-api-contracts/tars-integration.md`.

## Domain boundaries

Contracts owns rental lifecycle and vehicle operational rental sync. It stores Salik/Violation *amounts* as reconciliation lines only. It does not render White Contract PDF or mutate Vehicle gallery photos. Card charging waits on a real PaymentProvider confirmation (no fake PAID).
