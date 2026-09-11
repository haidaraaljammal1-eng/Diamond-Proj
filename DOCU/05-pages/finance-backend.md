# Finance Backend V1

Finance V1 is a **backend-only** operational layer on top of the unified Stripe payment foundation. It does not include Finance frontend, Invoices, VAT/GL accounting, or manual customer collections.

## Definitions

| Concept | Meaning |
| --- | --- |
| **Collected** | Trusted Stripe-confirmed customer money (`ContractPayment`: `CONFIRMED` + `CARD` + `provider = stripe` + `confirmedAt`) |
| **Outstanding** | Current unpaid customer obligations (rental, renewal, reconciliation, post-close receivable) — not revenue |
| **Expenses** | Completed maintenance actual cost + active manual expenses (net of void reversals) |
| **Net Movement** | `Collected − Expenses` for the selected period (not profit) |

Diamond V1 has **no Deposit**. Reconciliation uses `finalAmount = chargesTotal` only.

## Architecture

- **Obligations** remain in Contract / Renewal / Reconciliation / PostCloseReceivable.
- **Collections** remain in `ContractPayment`.
- **Expenses** come from `MaintenanceOrder.cost` (on completion) and `ManualExpense`.
- **`FinancialLedgerEntry`** is an immutable/rebuildable read model for recognized movements only. Unpaid obligations are **not** ledger rows.

Ledger kinds:

- Collections: `RENTAL_PAYMENT`, `RENEWAL_PAYMENT`, `RECONCILIATION_PAYMENT`, `POST_CLOSE_RECEIVABLE_PAYMENT`
- Expenses: `MAINTENANCE_EXPENSE`, `MANUAL_EXPENSE`, `MANUAL_EXPENSE_REVERSAL`

Dedupe keys (DB unique): `payment:<id>`, `maintenance:<id>`, `manual-expense:<id>:create`, `manual-expense:<id>:void`.

## Stripe-only Collected rule

Historical `MANUAL` / `BANK_TRANSFER` payments are preserved but **never** counted in V1 Collected totals.

Ledger rows are created inside the existing payment confirmation transaction (`recordStripePaymentLedger`).

## Open Receivables

`GET /finance/open-receivables` unions authoritative obligation sources:

| Source | Rule | Amount |
| --- | --- | --- |
| `RENTAL` | `Contract.status = SIGNED` and no trusted Stripe rental payment | `agreedAmount` |
| `RENEWAL` | `approvedAt` set, `appliedAt` null, `additionalAmount > 0` | `additionalAmount` |
| `RECONCILIATION` | approved, `settledAt` null, `finalAmount > 0` | `finalAmount` |
| `POST_CLOSE_RECEIVABLE` | `status = OPEN` | receivable `amount` |

Outstanding is a **current balance** (`outstandingAsOf = now`), not period-filtered.

V1 has no partial payments: `amountPaid` is `0` or equals `amountDue`.

## Maintenance expense

`MaintenanceOrder` with `status = COMPLETED`, `cost IS NOT NULL`, and `completedAt` produces one `MAINTENANCE_EXPENSE` ledger row on completion. Maintenance cost is never a customer receivable.

## Manual Expense

Staff-recorded company expenses outside other Diamond modules.

- Categories: `VEHICLE_CLEANING`, `FUEL`, `PARKING`, `GOVERNMENT_FEES`, `OFFICE_ADMIN`, `MARKETING`, `OPERATIONS`, `OTHER`
- Lifecycle: `ACTIVE` → `VOID` (no hard delete)
- Correction: void original + reversal ledger + new expense with `correctionOfExpenseId`
- Optional `attachmentId` (receipt evidence via shared Attachment model)
- **No Manual Income**

## APIs

| Route | Permission |
| --- | --- |
| `GET /finance/summary` | `finance.read` |
| `GET /finance/analytics` | `finance.read` |
| `GET /finance/ledger` | `finance.read` |
| `GET /finance/open-receivables` | `finance.read` |
| `POST /finance/expenses` | `finance.manage_expenses` |
| `GET /finance/expenses/:id` | `finance.read` |
| `POST /finance/expenses/:id/void` | `finance.manage_expenses` |
| `POST /finance/expenses/:id/correct` | `finance.manage_expenses` |

Period queries use business-time `from` / `to` (`to` exclusive), defaulting to current month.

## Permissions

- `finance.read`
- `finance.manage_expenses` (does not permit changing Stripe payments, settling receivables, or editing maintenance/RTA amounts)

Seeded idempotently; `system_admin` receives both.

## Migration backfill

`20260911120000_finance_v1` backfills idempotently:

1. Stripe payments: `CONFIRMED` + `CARD` + `provider = stripe` + `confirmedAt`
2. Maintenance: `COMPLETED` + `cost IS NOT NULL` + `completedAt`

## Verification

- Unit: `tests/unit/finance-ledger.test.ts`
- Integration: `tests/integration/finance.test.ts` (requires `haidara_test`)
