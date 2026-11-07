# Deferred road charges & Finance receivables

Staff can **register** traffic/Salik amounts on a contract without immediate card collection. Collection still flows through existing reconciliation, post-close, or road-liability CASH confirm paths — no parallel payment engine.

## Register (contract drawer)

- `POST /contracts/:id/deferred-road-charge` (`violations.charge`, `Idempotency-Key` required)
- Body: same as returned-contract manual charge (`chargeCategory`, `amountAed`, `referenceNumber`)
- Creates `RoadLiability` (`STAFF_MANUAL`, `OPEN`) + reference registry; **no** Stripe/off-session
- `REVIEW` / `CLOSED`: auto-attaches via unified customer-charge (`RECONCILIATION` or post-close receivable)
- `ACTIVE` / `RETOUT`: stays open until reconciliation attach/settlement
- Contract detail (`GET /contracts/:id`) exposes unsettled staff-deferred reconciliation-bound rows in `deferredReconciliationCharges` (reference, amount, type, createdAt).
- **CLOSED** contracts: staff button label and dialog copy use the closed-contract variant; registration still uses the same API and creates post-close receivables (not reconciliation-bound deferred rows).

## Finance open receivables

| Source | Rule |
| --- | --- |
| `ROAD_LIABILITY` | Staff manual `OPEN` liabilities not yet on reconciliation/post-close. **Deferred-for-reconciliation** rows (no `customerCharge` yet) appear for visibility with **View only** — `cashCollectionAvailable` is false; collect at **reconciliation**, not Finance cash confirm. **Direct collection** liabilities (`DIRECT_COLLECTION`) may still expose Finance cash when the contract requires cash. |
| `RENEWAL` | Office unpaid **or** customer-approved `AWAITING_PAYMENT` (`approvedAt`, no `appliedAt`, no settlement) |

Cash confirm for eligible `ROAD_LIABILITY` rows: `POST /finance/open-receivables/road-liabilities/:roadLiabilityId/cash-confirm` — **only** when the liability is already on the **direct collection** path. Deferred registrations awaiting reconciliation are rejected (422).

## Unchanged flows

- Returned-contract **off-session** manual charge (`POST /road-liabilities/returned-contracts/:id/manual-charge`)
- Reconciliation CASH/POS settlement, Stripe renewals, direct road-liability card collection

## Pushover

- **Daily Operations & Receivables** (when `DAILY_OPERATIONS_DIGEST_ENABLED`): unified Pushover digest at 09:00 / 14:00 / 19:00 Asia/Dubai for open Finance receivables, overdue ACTIVE returns, and overdue maintenance. See `DOCU/00-system-overview/pushover-staff-notifications.md`. Legacy Attention / Open Receivables / Overdue Rental / Maintenance Missed / Maintenance Delay scheduled monitors are superseded.
- **Instant business events** (when `PUSHOVER_ENABLED`): payment confirmed/failed, road liability attributed (`road_liability.received`, not duplicated from `road_liability.chargeable`), Car-Out / Car-In, contract close, renewal applied, maintenance scheduled/completed — title from `PUSHOVER_NOTIFICATION_TITLE`; body is **English**, multi-line (event, vehicle, contract, key amounts/dates, staff).
