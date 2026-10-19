# Deferred road charges & Finance receivables

Staff can **register** traffic/Salik amounts on a contract without immediate card collection. Collection still flows through existing reconciliation, post-close, or road-liability CASH confirm paths — no parallel payment engine.

## Register (contract drawer)

- `POST /contracts/:id/deferred-road-charge` (`violations.charge`, `Idempotency-Key` required)
- Body: same as returned-contract manual charge (`chargeCategory`, `amountAed`, `referenceNumber`)
- Creates `RoadLiability` (`STAFF_MANUAL`, `OPEN`) + reference registry; **no** Stripe/off-session
- `REVIEW` / `CLOSED`: auto-attaches via unified customer-charge (`RECONCILIATION` or post-close receivable)
- `ACTIVE` / `RETOUT`: stays open until reconciliation attach/settlement

## Finance open receivables

| Source | Rule |
| --- | --- |
| `ROAD_LIABILITY` | Staff manual `OPEN` liabilities not on reconciliation/post-close; optional `cashCollectionAvailable` for CASH contracts |
| `RENEWAL` | Office unpaid **or** customer-approved `AWAITING_PAYMENT` (`approvedAt`, no `appliedAt`, no settlement) |

Cash confirm for eligible `ROAD_LIABILITY` rows: `POST /finance/open-receivables/road-liabilities/:roadLiabilityId/cash-confirm` — delegates to existing `confirmCashCollection`.

## Unchanged flows

- Returned-contract **off-session** manual charge (`POST /road-liabilities/returned-contracts/:id/manual-charge`)
- Reconciliation CASH/POS settlement, Stripe renewals, direct road-liability card collection

## Pushover

Attention monitor includes deferred/open road liabilities and renewals awaiting payment (existing Dubai slot schedule + idempotency).
