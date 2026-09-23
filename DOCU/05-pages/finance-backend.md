# Finance Backend V1

Finance V1 is an operational layer on top of the unified customer collection foundation (Stripe + explicit CASH). It does not include Invoices, VAT/GL accounting, or ad-hoc manual customer collections outside the CASH rental / CASH road-liability flows.

## Definitions

| Concept | Meaning |
| --- | --- |
| **Collected** | Trusted confirmed customer collections: Stripe (`CONFIRMED` + `CARD` + `provider = stripe`) and explicit CASH (`CONFIRMED` + `CASH`, `provider = null`) |
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

## Operating company classification

Every ledger row and every manual expense carries a **nullable** `companyId`
(migration `20260921090000_finance_company_classification`).

`null` means **GENERAL**: a financial record with no authoritative company-bearing
source, such as office rent booked without a Vehicle. GENERAL is *not* an
`OperatingCompany` — Diamond still has exactly two, UNIQUE and ELITE.

The ledger persists its company **at write time**, from the writer's own
authoritative source, because a recognized movement is history and must never be
re-derived later:

| Writer | Source |
| --- | --- |
| Stripe contract payment | `Contract.companyId` (frozen — never the Vehicle's current company) |
| Maintenance cost | `MaintenanceOrder → Vehicle.companyId` |
| Manual expense create / correct / void | `ManualExpense.companyId`, `null` included |

Nothing falls back to UNIQUE. An unresolvable company stays `null`.

Company scope on every Finance read: no parameter = **ALL** (UNIQUE + ELITE +
GENERAL), `?companyId=<id>` = that company, `?companyScope=GENERAL` =
`companyId IS NULL`. The two together are 422 `FINANCE_COMPANY_SCOPE_CONFLICT`.
ALL adds no predicate — as `companyId IS NOT NULL` it would hide GENERAL.

Open receivables derive company through `Contract.company` and store no column, so
GENERAL returns none.

Full rules: [operating-companies.md](../00-system-overview/operating-companies.md).

## Trusted Collected rule

V1 Collected includes only trusted customer collections:

- Electronic: `CONFIRMED` + `CARD` + `provider = stripe`
- Cash: `CONFIRMED` + `CASH` + `provider = null` (staff-selected rental collection mode or road-liability cash confirm)

Historical `MANUAL` / `BANK_TRANSFER` payments are preserved but **never** counted automatically in Collected totals.

Ledger rows are created inside the existing payment confirmation transaction (`recordTrustedCollectionLedger`, alias `recordStripePaymentLedger`).

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
- Correction: in-place update of the same `ManualExpense` (status stays `ACTIVE`) + immutable `ManualExpenseRevision` history. No VOID, no `MANUAL_EXPENSE_REVERSAL`, no replacement row. The existing `manual-expense:<id>:create` ledger projection is updated in place when amount, date, or vehicle change.
- Optional `attachmentId` (receipt evidence via shared Attachment model)
- **No Manual Income**
- **No Company field.** The company is derived from the optional Vehicle and owned
  by the Backend: a Vehicle makes the expense that Vehicle's company, no Vehicle
  makes it GENERAL (`null`). Changing the Vehicle re-derives it, removing the
  Vehicle makes it GENERAL, adding one classifies it. The create/correct schemas
  carry no `companyId`, so a client-sent one is stripped — *Vehicle = ELITE,
  companyId = UNIQUE* still stores ELITE. The Vehicle picker's company filter is
  search UX only and never classifies the expense.

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

`20260921090000_finance_company_classification` backfills company from relations
only — manual expenses from their Vehicle, ledger rows by precedence (Contract →
Manual Expense → Maintenance → Vehicle → null). No description parsing, no
category guessing, no UNIQUE fallback. Guards abort on a mismatch or on any
operating company other than UNIQUE / ELITE.

## Verification

- Unit: `tests/unit/finance-ledger.test.ts`, `tests/unit/finance-company-scope.test.ts`
- Integration: `tests/integration/finance.test.ts`, `tests/integration/finance-company.test.ts` (both require `haidara_test`)
- Database evidence: `npm run verify:finance-company` (read-only; works before and after the migration)
