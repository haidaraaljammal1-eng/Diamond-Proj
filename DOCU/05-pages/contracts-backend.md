# Contracts Backend V1

Contract is the single rental aggregate. There is no parallel `Rental` model. Frontend public rental pages, White Contract PDF, live Stripe/Tamara/Tabby, Salik/Violations/Finance/Invoice engines, GPS, WhatsApp, AI damage, and Maintenance are out of scope of this backend document. Public Rental Flow V2: `DOCU/05-pages/public-rental-flow.md`.

Money is whole AED integers (same pattern as Vehicle rates). Default currency is `AED`. Contract has no `branchId` — Vehicle/Customer do not carry a clear rental-branch owner in the current schema.

> **Operating company (UNIQUE / ELITE):** see the section below and [operating-companies.md](../00-system-overview/operating-companies.md).

## Operating company (UNIQUE / ELITE)

`Contract.companyId` is **historical ownership**: the company that owned the Vehicle when the contract was created.

- **Derivation.** `POST /contracts/offers` loads the Vehicle and persists `companyId: vehicle.companyId`. A company sent by the client is ignored — the field is not in the request schema and is never read from the request.
- **Immutability.** No update path re-syncs the company from the Vehicle. `Contract.companyId` stays the authoritative contract/company dimension for filters, the legal snapshot, TARS routing and future invoices, statements and reporting. The Vehicle's own company is itself write-once (no transfer workflow exists), so an existing Contract, its official document and its accounting can never be re-branded from the fleet side.
- **DTOs.** Contract list items and contract detail carry a compact `company` ref (`id`, `code`, `displayName`, `accentColor`).
- **Filter.** `GET /contracts?companyId=` filters on `Contract.companyId`, never on `vehicle.companyId`, so the contract list always reflects the company each contract was written under.
- **Numbering is unchanged.** Both companies share the single global `DE-{year}-{sequence}` sequence.

### Official contract

`OfficialContractView.header.company` carries `code`, `displayName`, `legalNameAr`, `legalNameEn` and `accentColor`, resolved from the Contract's own company. Signing freezes it into `snapshot.officialContract` with the rest of the legal view, so no later fleet change can re-brand a signed agreement.

Contracts signed before multi-company existed have no company block in their snapshot. `officialContractCompany(frozen, live)` returns the frozen company when present and otherwise falls back to the live one, which for those contracts is UNIQUE (their `companyId` was backfilled to UNIQUE and is immutable). **Stored snapshot JSON is never rewritten.**

### Public rental link

`office.company` (`code`, `displayName`, `legalNameAr`, `legalNameEn`) is exposed on the public contract view and the public rental context, read from the Contract. The customer sees which company they are renting from and can never select or change it. No lifecycle, OCR, signature or payment behaviour changed.

### TARS routing

`createTarsProvider(companyCode)` and `getTarsConfig(companyCode)` resolve per company. Both the status read and the execute path take the code from `Contract.companyId` — never from the Vehicle's current company or a request parameter. `GET /contracts/:id/tars` returns the routing `company` alongside `configured`, so the UI can show "TARS · UNIQUE" without implying a connection. Both companies remain unconfigured: no endpoints, credentials, payloads or env variables were invented, and an execute attempt still fails closed with `TARS_NOT_CONFIGURED` and writes no operation row.

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
| RETOUT | Hirer confirmed the return on the return link; vehicle stays RENTED. Issuing the link alone keeps ACTIVE |
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

Once a Contract is PAID, its assigned Vehicle remains operationally `AVAILABLE` but is reserved and non-bookable. New offers and RENTAL links for another Contract on that Vehicle are rejected under the `vehicle_rental` advisory lock. PAID reservation is derived from Contract status and an incomplete Car-Out; no Vehicle reservation column or `RESERVED` operational status exists.

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

Contract list items and details expose `actions.canCarOut`. It is true only for the owning PAID Contract with no completed Car-Out, an active assigned Vehicle still `AVAILABLE`, and no competing blocking Contract. Car-Out is entered from Contracts, never Fleet. The existing staff `POST /contracts/:id/car-out` route remains; the saved-draft workflow completes through `POST /contracts/:id/car-out/complete`. Both recheck eligibility after the vehicle advisory lock, then transition PAID → ACTIVE and Vehicle AVAILABLE → RENTED in one transaction. Payment itself never changes Vehicle status or runs Car-Out.

Batch-loaded with `loadCurrentRentalsByVehicleIds` (one query, no N+1). If corrupt data has two blocking contracts, the oldest (`createdAt`, then `id`) is returned and the duplicate is logged — never a random pick.

## Customer

Reuse `Customer`. Nullable rental fields: `nationality`, `identityNumber`, `passportNumber`, `drivingLicenseNumber`, `drivingLicenseExpiry`, `address`. Documents use `CustomerDocument` + shared `Attachment` (no blobs on Customer). Public form must not send `vehicleId`, amount, `contractNumber`, or status.

## Snapshot

Written at SIGNED (not rewritten later). Contains `contractNumber`, customer identity including verified driving-license number/expiry, vehicle display facts, commercial terms, and `termsVersion`. White Contract PDF must read this snapshot later — never live master data. No PDF is generated in this phase.

## Public links

Opaque tokens via existing `generateOpaqueToken` / `hashToken`. Raw token returned **once**. DB stores SHA-256 hex only. Lookup uses hash + `timingSafeEqual`. TTL (`contracts.constants.ts`): RENTAL 72h, RETURN 24h, RENEWAL 48h. Supports expiry and revocation. Re-issuing a link of the same type revokes the previous unused token.

RENTAL `usedAt` is set when the contract reaches **PAID** (not on first GET or accept), so the customer can reload across license, form, sign, and payment. RETURN marks `usedAt` on Car-In (staff or public token). RETURN GET still resolves a used, unexpired token so the customer can see a received state. RENEWAL is unchanged. See `DOCU/05-pages/public-rental-flow.md`.

Public token routes live under `routes/public/` with an empty public hook — **no staff JWT and no staff permissions**. The opaque token is the only customer credential. Autoload strips `routes/public`, so URLs stay `/contracts/rental/:token` (not `/public/contracts/...`). Never log raw tokens or PII in outbox payloads. Rental GET returns `PublicRentalContextSchema` (office, vehicle, flow step, license, payment). RETURN/RENEWAL GET use `PublicContractViewSchema` (includes `office.displayName` from `OFFICE_DISPLAY_NAME`; no TARS, reconciliation, or payment internals).

Official Contract review confirmation uses `POST /contracts/rental/:token/official-contract/review/submit` after real identity verification. It persists `AWAITING → FORM` independently of whether personal fields were corrected. Signature submission requires the persisted FORM status and then writes `FORM → SIGNED`, ContractAcceptance, signature Attachments, and the frozen legal snapshot.

## Payment foundation

`ContractPayment`: amount, currency, method (`BANK_TRANSFER | CARD | MANUAL`), status (`PENDING | PROCESSING | CONFIRMED | FAILED | CANCELLED`), `purpose` (`RENTAL | RENEWAL | RECONCILIATION | POST_CLOSE_RECEIVABLE`), `targetId`, provider/checkout fields, and a hashed payment-status token. V1 customer collection is Stripe Checkout only (`PaymentProvider`). Staff `POST .../payment/confirm` is disabled (`MANUAL_PAYMENT_DISABLED`); historical `MANUAL` / `BANK_TRANSFER` rows remain readable. Public card POST never accepts amount. Redirect URLs are not confirmation. Close requires settled reconciliation when `finalAmount > 0`. Details: `DOCU/05-pages/payments-backend.md` and `DOCU/05-pages/public-rental-flow.md`.

## Car-Out / Car-In

The PAID Car-Out draft stores mileage, the existing nine-level fuel code, structured OUT damage, a separate hirer OUT signature, and Contract-owned photo evidence. Saving it keeps the Contract PAID and Vehicle AVAILABLE, reserved and non-bookable. Required OUT slots are six exterior photos (FRONT, REAR, FRONT_RIGHT, REAR_RIGHT, FRONT_LEFT, REAR_LEFT), one odometer photo (ODOMETER), and one dashboard/fuel photo (DASHBOARD_FUEL). LEFT, RIGHT and OTHER are optional. Completion requires all eight required slots, mileage, fuel and the OUT signature; the legal contract HIRER signature does not satisfy this requirement. Previously uploaded optional side photos remain attached to their draft. Attachment storage validates image MIME and bytes, enforces size, generates storage keys, and records SHA-256, uploader and upload time. The Contract detail `carOutHandover` shows progress and actions; the list exposes only `carOutStatus`.

Staff with `contracts.read` may stream the frozen legal HIRER / ADDITIONAL_DRIVER / SPONSOR signature images via `GET /contracts/:id/official-contract/signatures/:slot/stream` for the read-only Car-Out contract preview. The response is private and uncached; this does not change the legal snapshot or customer signing routes.

Completion copies the draft into the immutable operational `ContractCarOut` snapshot with server handover time, assigned Vehicle ID, mileage, fuel, damage, photo references and OUT signature. Existing `Vehicle` has no authoritative mileage column, so no new Vehicle mileage field was added. OUT draft and evidence mutations reject after ACTIVE. The signed legal `Contract.snapshot` is unchanged. Staged Car-In now reuses these same OUT angles (see below); the old eight Demo inspection angles (RIGHT_SIDE, LEFT_SIDE, FRONT_PLATE, REAR_PLATE, INTERIOR_ODOMETER, TIRES) survive only on the legacy public token route and on historical rows. Photo joins reference Attachment, never `VehiclePhoto`; streams require `contracts.read`. The additive migration is applied by `npm run dev:bootstrap` on a new local database.

**Return intent.** `POST /contracts/:id/return-link` only issues the token: the Contract stays ACTIVE and renewal stays possible. The public `POST /contracts/return/:token/confirm` is the return-intent event: ACTIVE → RETOUT, `contract.return_started`, unused renewal links revoked. It is idempotent (RETOUT or later returns the current view). Return confirmation, staff `renew`, public renewal confirm and link issuing take the `contract_lifecycle` advisory lock and re-read the status, so a renewal and a return confirmation cannot both win; renewal payment start also refuses a non-ACTIVE contract. **Renewal eligibility is re-checked at application time.** `applyRenewal` takes the same lifecycle lock (lock order: `contract_payment`, then `contract_lifecycle`) and re-reads the Contract; a Contract that has left ACTIVE is never extended and never moved back from RETOUT. Direct callers (staff renew, zero-amount public confirm) get `CONTRACT_INVALID_TRANSITION`. When a renewal payment that started before the return is captured afterwards, payment confirmation and domain application still run in one transaction: the payment is recorded CONFIRMED because the provider took the money, the renewal stays unapplied (`appliedAt` null, no second renewal row or payment attempt), and `contract.renewal_not_applied` (payment id, renewal id, amount) is emitted so staff refund or settle it. Vehicle stays RENTED until Car-In.

Verification (2026-09-19): `contracts-renewal` 8/8 and `tars-integration` 15/15 on `haidara_test`; the in-flight race test fails when the re-check is removed. On the dev database a fresh contract (DE-2026-000017) confirmed: return link keeps ACTIVE, RENTED and Renew; return confirmation gives RETOUT, RENTED, no Renew, Receive vehicle. The in-flight renewal payment could not be reproduced on dev because no card provider is configured there (`PAYMENT_PROVIDER_NOT_CONFIGURED`); it is covered only by the integration test.

### Staged Car-In (staff)

Car-In is now a resumable draft workflow that mirrors Car-Out, not a single submit.

```
RETOUT → Car-In draft → save / resume → Complete → REVIEW
Vehicle: RENTED throughout the draft → AVAILABLE only at Complete
```

Entry requires Contract **RETOUT**, Vehicle **RENTED**, an existing Car-Out, and no final Car-In (`actions.canCarIn`). `ContractCarInDraft` + `ContractCarInDraftPhoto` hold mileage, the nine-level fuel code, structured IN damage, notes, the hirer IN signature and photo evidence. Saving, uploading, replacing or deleting draft evidence never changes Contract or Vehicle status, so the draft can be closed and reopened; a reopened draft restores everything, including the signature and photos.

**Car-In now uses the same photo vocabulary as Car-Out**, so OUT and IN evidence line up: required FRONT, FRONT_LEFT, REAR_LEFT, REAR, REAR_RIGHT, FRONT_RIGHT, ODOMETER, DASHBOARD_FUEL (8), optional LEFT, RIGHT, OTHER. The old Car-In-only set (RIGHT_SIDE, LEFT_SIDE, FRONT_PLATE, REAR_PLATE, INTERIOR_ODOMETER, TIRES) is rejected by the staged endpoints; `CAR_OUT_REQUIRED_ANGLES` / `CAR_OUT_PHOTO_ANGLES` are the shared constants.

**The IN signature is mandatory at Complete** and is enforced in the backend, not only in the UI: `actions.canComplete` stays false without it and completion returns 422. Unlike `ContractCarOut`, the final `ContractCarIn` carries no signature or damage column; the signature is persisted to `OfficialContractSignature` slot `VEHICLE_IN_HIRER` and the damage to `OfficialContractReviewDraft.damageIn`, exactly as the legacy path did. The draft row is never deleted on completion, so the captured signature and damage stay readable afterwards.

Complete runs in one transaction under advisory lock `vehicle_rental`: re-read Contract and Vehicle, verify RETOUT + RENTED + Car-Out present + no existing Car-In, verify mileage, fuel, the signature and all eight required slots, create `ContractCarIn`, copy draft photos into `ContractCarInPhoto`, persist damage and the IN signature, RETOUT → REVIEW, Vehicle RENTED → AVAILABLE, complete the RETURN links, emit `contract.return_submitted`. All or nothing. A second Complete (including two concurrent ones) converges on the single existing Car-In instead of creating a second one, and `Idempotency-Key` replays through `runIdempotent` (scope `contract:car-in-complete:${contractId}`). After REVIEW every draft mutation (patch, photo upload, photo delete, signature) returns 409.

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET | `/contracts/:id/car-in` | `contracts.read`. Work state: status, draft values, signature, photo evidence, `actions` |
| PATCH | `/contracts/:id/car-in` | `contracts.return`. Partial save of mileage / fuel / damage / notes |
| POST | `/contracts/:id/car-in/photos?angle=` | `contracts.return`. Multipart; one photo per angle, re-upload replaces the slot |
| DELETE | `/contracts/:id/car-in/photos/:photoId` | `contracts.return`. Draft photos only |
| POST | `/contracts/:id/car-in/signature` | `contracts.return`. Multipart PNG; replaces the draft IN signature |
| GET | `/contracts/:id/car-in/signature/stream` | `contracts.read` |
| GET | `/contracts/:id/car-in/photos/:photoId/stream` | `contracts.read`. Draft and final photos |
| POST | `/contracts/:id/car-in/complete` | `contracts.return`. The one authoritative staff completion |

**Legacy compatibility.** `POST /contracts/:id/car-in` (staff) no longer reads a body; it is a hidden, deprecated alias that completes the saved draft through the same function as `/car-in/complete`, so there is exactly one authoritative staff workflow. A caller that still posts the old full payload no longer has it applied, and completion fails loudly if no draft was saved first. The public token route `POST /contracts/return/:token/car-in` is **unchanged**: it keeps the legacy single-shot `CarInSchema` with the original eight `INSPECTION_ANGLES`, still writes `ContractCarIn` directly, and used RETURN tokens are still allowed so a second submit after REVIEW is idempotent. Documented staff policy remains that the customer does not submit Car-In.

Car-In never closes the Contract. REVIEW means financial/operational review is still open, not that the customer still has the vehicle.

**OUT vs IN comparison is not implemented yet.** The two evidence sets now share one vocabulary, which is the prerequisite, but nothing compares mileage, fuel or damage between Car-Out and Car-In.

GPS Salik intelligence is a derived Contract projection (`roadLiabilitySignals`), not a stored boolean and not a lifecycle hold. Detail also includes a compact `postCloseReceivables` summary (count, openAmount, bounded items) without N+1.

Car-Out is the future TARS `HANDOVER` integration checkpoint and Car-In the future `RETURN_DOCUMENTATION` checkpoint. Neither calls TARS today, and the sequencing is unconfirmed. See `DOCU/04-api-contracts/tars-integration.md`.

## Reconciliation

Diamond V1 does not use rental deposits. Reconciliation `finalAmount` equals `chargesTotal`. No deposit collection, deduction, credit, or refund exists.

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
| `contracts.car_out` | Save OUT draft, upload/replace/delete OUT evidence |
| `contracts.activate` + `contracts.car_out` | Complete Car-Out (both required) |
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
| GET | `/contracts/:id/car-out` | read |
| PATCH | `/contracts/:id/car-out` | car_out |
| POST | `/contracts/:id/car-out/photos?angle=...` | car_out |
| DELETE | `/contracts/:id/car-out/photos/:photoId` | car_out |
| POST | `/contracts/:id/car-out/signature` | car_out |
| GET | `/contracts/:id/car-out/signature/stream` | read |
| POST | `/contracts/:id/car-out/complete` | car_out + activate |
| POST | `/contracts/:id/return-link` | return (no status change) |
| GET | `/contracts/:id/car-in` | read (staged work state) |
| PATCH | `/contracts/:id/car-in` | return (draft save) |
| POST | `/contracts/:id/car-in/photos?angle=` | return |
| DELETE | `/contracts/:id/car-in/photos/:photoId` | return |
| POST | `/contracts/:id/car-in/signature` | return |
| GET | `/contracts/:id/car-in/signature/stream` | read |
| POST | `/contracts/:id/car-in/complete` | return |
| POST | `/contracts/:id/car-in` | return (deprecated alias for complete, no body) |
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

`POST /contracts/:id/renewal-link` is ACTIVE-only. It upserts a pending `ContractRenewal` (the stored offer) and issues an opaque hashed RENEWAL token (`CONTRACT_LINK_TTL_SECONDS.RENEWAL` = 48h). Prior unused RENEWAL links are revoked. Public `GET /contracts/renew/:token` returns `PublicContractView` plus optional `renewal` (`additionalDays`, `additionalAmount`, `previousEndAt`, `newEndAt`, `confirmed`, `awaitingPayment`) and `payment.providerAvailable`. Used RENEWAL tokens may be re-read (`allowCompleted`) for the success reload. Public `POST /contracts/renew/:token/confirm` approves the stored offer (`approvedAt`). When `additionalAmount > 0`, terms apply only after `POST /contracts/renew/:token/payment` is confirmed by Stripe. Zero additional amount applies without payment. The Contract stays ACTIVE; Vehicle stays RENTED; no second Contract is created. Staff `POST /contracts/:id/renew` still applies immediately, deletes pending offers, and revokes unused RENEWAL links. No TARS renewal execution.

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
