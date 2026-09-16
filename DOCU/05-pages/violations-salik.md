# Violations & Salik (Road Liabilities)

Staff operational page (future UI: **Violations & Salik** / **المخالفات وسالك**). Backend domain name is **Road Liabilities**.

This is not a manual data-entry module. RTA violations, Salik tolls, and Salik violations enter only through provider/ingestion boundaries.

## Domain purpose

Track road events that may become customer financial obligations, while keeping GPS predictions out of confirmed debt, Reconciliation, and Finance.

## Observation vs liability

| Concept | Model | Meaning |
| --- | --- | --- |
| Observation | `RoadLiabilityObservation` | One normalized source event |
| Liability | `RoadLiability` | Canonical operational/financial obligation |

Do not collapse them. Customer identity stays on the attributed **Contract** — it is not duplicated on the liability.

## Prediction vs authoritative confirmation

A GPS gate crossing is an observation, not a charge.

| Source | `authoritative` | Confirmation | Collection |
| --- | --- | --- | --- |
| `GPS_INFERENCE` | always `false` | `PENDING_CONFIRMATION` | `NOT_READY` — never confirmed debt |
| `SALIK` / `RTA` | `true` | `CONFIRMED` | `OPEN` when matched + valid amount |

`sourceKey` is provenance, not financial authority. Authority is the explicit `authoritative` flag.

Do not automatically `REJECT` old predictions just because time passed.

## Sources

Known `sourceKey` values: `RTA`, `SALIK`, `GPS_INFERENCE`. Reserved for later: `TARS`.

Today:

- RTA provider = **not configured** (`RtaUnconfiguredProvider`)
- Salik provider = **not configured** (`SalikUnconfiguredProvider`)
- No HTTP, no guessed `RTA_API_KEY` / `SALIK_BASE_URL` env vars
- Read APIs return 200 with `providers.rtaConfigured` / `salikConfigured` = false

This is not an application error.

## TARS unverified rule

Architecture allows a future TARS `sourceKey`. Do **not** assume TARS supplies traffic violations, tolls, amounts, timestamps, or vehicle events until official TARS API documentation proves it. No TARS traffic-liability adapter exists in this foundation.

## GPS crossing inference

After `GpsService.ingestLatestPosition` **accepts** a new point, an observer receives `{ previous, current }` **outside** the GPS transaction.

The detector uses the movement **segment** vs the gate **line/corridor**. Entering a radius around a gate is not enough. Heading is applied only when the gate has verified direction metadata — it is never invented.

A detected crossing creates:

- `sourceKey = GPS_INFERENCE`
- `eventType = SALIK_TOLL`
- no amount
- confidence `HIGH` / `MEDIUM` / `LOW`

Stale/duplicate GPS ingest does not run inference. Inference failure never rolls back GPS latest-state. Exact route coordinates are not stored on road liabilities and are not logged.

GPS jitter of the same physical crossing is deduplicated by vehicle + gate + ~2 minute proximity. This is **not** a Salik billing rule. Do not implement “two gates within one hour = one fee” from GPS.

## TollGate geometry

`TollGate` is a provider-neutral catalog (`networkKey` example: `SALIK`): line endpoints, corridor meters, optional heading, effective dates.

**Gate catalog is empty** in development and production until verified official geometry exists. Do not seed approximate Salik coordinates. Tests may insert fixtures only in `haidara_test`.

Production inference stays inactive until official geometry is loaded.

## Contract custody attribution

Attribution uses **actual vehicle possession**, not `currentRental`, not scheduled `startAt`/`endAt`, and not contract status alone:

`carOut.occurredAt <= event.occurredAt` and (`carIn` missing or `event.occurredAt < carIn.occurredAt`)

- 0 windows → `UNMATCHED`
- 1 window → `MATCHED` (`attributedContractId`)
- >1 → `AMBIGUOUS` (never auto-pick)

CLOSED historical contracts still match. Unmatched and ambiguous liabilities are kept; they are not discarded and are not chargeable.

Vehicle matching uses Diamond `vehicleId`, normalized plate, or `Vehicle.externalId`. No duplicate Vehicle rows.

## Chargeable rule

`isChargeableRoadLiability`:

- `confirmationStatus = CONFIRMED`
- `attributionStatus = MATCHED`
- `attributedContractId` present
- amount > 0
- `collectionStatus = OPEN`

GPS predictions never satisfy this. `confirmedOpenAmount` on the summary excludes them.

## Provider boundaries

```
External provider  →  adapter  →  NormalizedRoadObservation  →  ingestRoadObservation
GPS ingest (accepted)  →  observer  →  SalikCrossingDetector  →  GPS inference observation  →  ingest
```

Contracts and Vehicles must not call RTA/Salik/TARS APIs. `ingestRoadObservation` is internal — not a staff POST.

When official Salik arrives, exactly one strong GPS prediction (same vehicle, same gate when known, compatible type, close time) is upgraded on the **same** liability. Amount comes only from the official event. If GPS missed the crossing, the official event still creates a confirmed liability.

## Reconciliation integration boundary

Chargeable set: confirmed, matched to that contract, `OPEN`, valid amount (`listChargeableLiabilitiesForContract` / `COLLECTIBLE_WHERE`). GPS predictions never enter charge review.

`RoadLiabilityCustomerCharge.roadLiabilityId` is unique. One RoadLiability becomes one customer charge — either a Reconciliation line or a Post-Close Receivable, never both. Attachment does **not** mark collection `SETTLED`.

New manual `SALIK` / `VIOLATION` reconciliation lines are rejected (`ROAD_LIABILITY_REQUIRED`). Historical manual rows stay readable. Existing liability-backed reconciliation lines were backfilled into `RoadLiabilityCustomerCharge`.

Staff APIs:

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/road-liabilities/:id/customer-charge` | `violations.read` | Unified Charge Review read |
| POST | `/road-liabilities/:id/customer-charge/confirm` | `violations.charge` | Unified confirm; destination from Contract status |
| GET | `/contracts/:id/reconciliation/road-liabilities` | `contracts.reconcile` | REVIEW `available[]` + `attached[]` |
| POST | `/contracts/:id/reconciliation/road-liabilities/:roadLiabilityId/confirm-charge` | `contracts.reconcile` | REVIEW-only wrapper around the unified service |

Body: `{ customerChargeAmount, adjustmentReason?, adjustmentNote? }` only. Official amount, adjustment, currency, contract attribution, and destination are server-derived.

## Customer Charge Review

Official RTA/Salik amount on `RoadLiability.amount` is immutable. Staff may **increase** the customer charge before confirmation; they cannot decrease it in this workflow (discounts/waivers need a future explicit path).

- `officialAmount` = `RoadLiability.amount`
- `customerChargeAmount` ≥ official (default suggestion = official)
- `adjustmentAmount` = customer − official (server-derived)
- Increase requires `adjustmentReason`
- REVIEW destination: one `RoadLiabilityCustomerCharge` + one ReconciliationLine; totals recalculate
- CLOSED destination: one `RoadLiabilityCustomerCharge` + one `ContractPostCloseReceivable` (`OPEN`). Original reconciliation is unchanged. Contract stays CLOSED. Vehicle is unchanged.
- After confirmation the charge is locked; a different amount is `ROAD_LIABILITY_ALREADY_CHARGED`
- Future automatic fee suggestions may change `suggestedCustomerChargeAmount` only (`buildRoadLiabilityChargeProposal`)

Line mapping: `RTA_VIOLATION` / `SALIK_VIOLATION` → `VIOLATION`; `SALIK_TOLL` → `SALIK`.

GPS predictions never create ReconciliationLine or Post-Close Receivable.

## Finance integration boundary

Finance is not built here. Confirmed amount, currency, contract attribution, and collection status are on `RoadLiability`. `ContractPostCloseReceivable` is the foundation for later Finance consumption. V1 customer collection for open post-close receivables uses the shared Stripe Checkout engine (`POST /contracts/:id/post-close-receivables/:receivableId/payment`); official `RoadLiability.amount` stays immutable. GPS predictions must never appear as confirmed Finance exposure.

When a liability first becomes chargeable, one idempotent outbox event `road_liability.chargeable` is written (IDs and amount only — no PII, coordinates, or secrets).

## No manual creation

There are no staff routes to create or patch RTA violations, Salik tolls, or Salik violations.

## API endpoints

Staff JWT. Permission: `violations.read`. No public or rental-token routes.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/road-liabilities/summary` | KPIs including unique `needsAttentionCount` (excludes predicted GPS amounts from `confirmedOpenAmount`) |
| GET | `/road-liabilities` | Paginated list, search, `queue`, `channel`, detailed filters, default `occurredAt DESC` |
| GET | `/road-liabilities/:id` | Detail + observation provenance timeline |
| GET | `/road-liabilities/:id/customer-charge` | Unified Charge Review read (`violations.read`) |
| POST | `/road-liabilities/:id/customer-charge/confirm` | Unified confirm (`violations.charge`); destination from Contract lifecycle |

List search: vehicle name, plate, contract number, customer name, external reference, location. Filters: type, sourceKey, confirmation/attribution/collection status, vehicleId, contractId, date range.

## Statuses

- Confirmation: `PENDING_CONFIRMATION` / `CONFIRMED` / `REJECTED`
- Attribution: `UNRESOLVED` / `MATCHED` / `UNMATCHED` / `AMBIGUOUS`
- Collection: `NOT_READY` / `OPEN` / `SETTLED` / `DISPUTED` / `VOID`

No staff mutation routes for these statuses.

Read-only derived `workState` (not stored): SETTLED → VOID → REJECTED → DISPUTED → AWAITING_CONFIRMATION → AMBIGUOUS_MATCH → NEEDS_CONTRACT → ATTRIBUTION_PENDING → COLLECTIBLE (`isChargeableRoadLiability`, including CLOSED unmatched-to-reconciliation late charges) → NOT_READY.

List query extras: `queue=collectible|needs_attention|settled`, `channel=RTA|SALIK` (by type, so GPS-inferred Salik tolls are still Salik). Summary adds unique `needsAttentionCount`. Existing detailed filters remain.

## Idempotency

- Provider `externalEventId` → unique `(sourceKey, externalEventId)`
- Otherwise a conservative `ingestionFingerprint`
- Duplicate observation does not create a duplicate liability

## Frontend (staff UI)

Route: `/[locale]/violations` (`/ar/violations`, `/en/violations`). Module: `APP/frontend/src/modules/road-liabilities/`. Permission: `violations.read` (nav + page). Backend remains authoritative.

Page → `useRoadLiabilities` → Zustand store → `road-liabilities.api.ts` → central API client. Components do not call HTTP. No TanStack Query / SWR.

Visual hierarchy: three compact KPIs (collectible amount, awaiting confirmation, unique needs-attention count) → work-queue tabs → one toolbar (search, RTA/Salik authority, date, Advanced Filters) → operational list. Settled is a queue, not a fourth equal KPI. Secondary unmatched/ambiguous/type breakdowns stay off the main surface.

The main row shows one derived `workState` (server-authoritative, not persisted). Confirmation, attribution, and collection remain in Advanced Filters and the Detail Drawer. GPS is detection provenance, not an authority: a GPS Salik prediction appears under the Salik channel and reads as “GPS Detected / Awaiting Salik Confirmation”, never as confirmed debt. Amount `null` renders “Awaiting Official Amount” / “بانتظار المبلغ الرسمي”, never `AED 0`. Collectible amount is backend `confirmedOpenAmount` only. `needsAttentionCount` counts unique liabilities in the needs-attention queue.

Work queues map to `queue=collectible|needs_attention|settled` (omit for All). Authority maps to `channel=RTA|SALIK` (GPS predictions of type `SALIK_TOLL` belong to Salik). Existing `type`, `sourceKey`, and status filters remain for Advanced Filters. Pagination is server-side.

Row click fetches `GET /road-liabilities/:id` once and opens Shared Drawer (overview, event status dimensions, vehicle, contract/customer, provenance timeline). Matched contracts open existing `ContractDetailDrawer` with localized contract status. Vehicle GPS uses `/[locale]/gps?vehicleId=`. Search is explicit submit.

Customer Charge Review happens in the Liability Drawer, not the table row and not a separate page. One Dialog covers both destinations; frontend does not choose the destination.

- Official amount is read-only. Staff never edit RTA/Salik data.
- Customer charge is editable only inside the Charge Review Dialog, defaulting to backend `suggestedCustomerChargeAmount`.
- An increase requires a staff-entered reason. Equal amount does not. Optional note is allowed.
- Read: `GET /road-liabilities/:id/customer-charge` (`violations.read`). Confirm: `POST /road-liabilities/:id/customer-charge/confirm` (`violations.charge`) with `{ customerChargeAmount, adjustmentReason?, adjustmentNote? }` only.
- Backend derives destination: Contract REVIEW → Reconciliation line; Contract CLOSED → Post-Close Receivable (`OPEN`). Other Contract statuses are `NOT_ELIGIBLE`.
- One `RoadLiabilityCustomerCharge` per liability (`roadLiabilityId` UNIQUE) prevents the same liability becoming both a reconciliation charge and a post-close receivable.
- After confirm the Drawer shows the locked snapshot (Added to Reconciliation vs Post-Close Receivable Created). No ordinary edit.
- GPS predictions never show Charge Review and never create debt.
- CLOSED late-arrival stays COLLECTIBLE until charged. It does not reopen the Contract or rewrite the original reconciliation.
- The old `POST /contracts/:id/reconciliation/road-liabilities/:roadLiabilityId/confirm-charge` remains a REVIEW-only wrapper around the same service.

Contracts never wait for hypothetical future RTA/Salik. A GPS Salik crossing is a derived informational Contract flag (`roadLiabilitySignals`), not a Contract status and not a hold on Close.

Demo Simulation reuses the existing overlay store (`roadLiabilitiesOverlay`); simulated ids never hit `GET /road-liabilities/sim-…` or confirm APIs. Reset restores live summary/list and original simulation fixtures. Production with simulation disabled shows no demo chrome.
