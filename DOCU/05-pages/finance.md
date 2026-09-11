# Finance Page (Frontend V1)

Route: `/[locale]/finance` (`/ar/finance`, `/en/finance`)

Permission: `finance.read` (navigation + page access). Manual expense mutations require `finance.manage_expenses`.

## Purpose

Administrative financial operations center backed by Finance Backend V1. Real mode presents backend-authoritative totals only — no frontend financial recalculation.

A Development/demo **Finance Simulation** overlay can replace the page with a coherent frontend-only fixture. It never writes to Finance, Stripe, contracts, maintenance, manual expenses, receivables, or any database table.

## Layout (top → bottom)

1. Page header — Demo Simulation (when enabled) + refresh + Add Expense (`finance.manage_expenses` only; hidden during simulation)
2. Period control — Today / Week / Month / Custom (shared by KPIs, analytics, and ledger)
3. Four KPI cards — Collected, Outstanding, Expenses, Net Movement
4. Open Receivables — operational collection queue
5. Financial Analytics — trend + outstanding/expense breakdowns
6. Financial Ledger — audit-style movement table

## KPI semantics

| KPI | Meaning | Period |
| --- | --- | --- |
| Collected | Stripe-confirmed customer money (or simulated Customer Collection rows) | Selected period |
| Outstanding | Current unpaid obligations | **Current balance** (not period-filtered) |
| Expenses | Recognized company expenses (maintenance + manual, net of reversals) | Selected period |
| Net Movement | `Collected − Expenses` | Selected period |

Do not label Collected as Revenue or Net Movement as Profit.

Expense Reversal is a correction of a company expense, not income and not Customer Collection. Net expenses subtract reversals (example: −100, +100 reversal, −80 corrected → Expenses **80**).

## Open Receivables

`GET /finance/open-receivables` — union of:

- `RENTAL` — signed, unpaid Stripe rental
- `RENEWAL` — approved renewal awaiting payment
- `RECONCILIATION` — approved, unsettled reconciliation
- `POST_CLOSE_RECEIVABLE` — open post-close charge

Toolbar: Search, **Source** (receivable origin: Rental / Renewal / Return Reconciliation / Post-Close Charge), Sort.

Receivable Source is not the same as Ledger Source (Maintenance / Manual Expense never appear here).

Action: **View** opens the existing Contract Detail Drawer. Finance does not provide manual collection controls. Simulated receivable rows do not open real contract drawers.

An open receivable is an obligation. It is not a ledger Customer Collection until a payment movement exists.

## Analytics

- **Financial Trend** — daily collected vs expenses (+ net in tooltip/chart)
- **Outstanding Breakdown** — current balance by receivable source (not period-filtered)
- **Expense Breakdown** — period expenses by category (Maintenance + manual categories). Reversals reduce the original category. There is no “Expense Reversal” breakdown category.

No payment-method breakdown. No invoices.

## Ledger

`GET /finance/ledger` — paginated recognized movements.

### Movement vs Source

These are separate columns and independent filters.

**Movement** answers “what happened financially?”

| Value | EN | AR |
| --- | --- | --- |
| CUSTOMER_COLLECTION (`COLLECTION`) | Customer Collection | تحصيل من العميل |
| EXPENSE | Expense | مصروف |
| EXPENSE_REVERSAL | Expense Reversal | إلغاء مصروف |

**Source** answers “where did this movement originate?”

| Origin | EN | AR |
| --- | --- | --- |
| Rental Payment | Rental Payment | دفعة إيجار |
| Renewal Payment | Renewal Payment | دفعة تجديد |
| Return Reconciliation | Return Reconciliation | تسوية الإرجاع |
| Post-Close Charge | Post-Close Charge | مطالبة بعد الإغلاق |
| Maintenance | Maintenance | صيانة |
| Manual Expense | Manual Expense | مصروف يدوي |

Do not use Customer Collection, Expense, or Expense Reversal as Source labels. An expense reversal of a manual expense is:

- Movement: Expense Reversal
- Source: Manual Expense

Desktop columns: Date, Movement, Source, Description / Reference, Contract / Vehicle, Amount, Action.

Amount presentation (sign only; backend values stay unsigned):

- Customer Collection → `+ AED …` (positive styling)
- Expense → `- AED …` (negative styling)
- Expense Reversal → `+ AED …` with corrective/neutral styling and the Expense Reversal label (never styled as Collection)

Toolbar: Search, Movement, Source, Clear. Period stays on the page control so KPIs, analytics, and ledger share one range.

Real-mode search uses backend-supported fields. Simulation search covers contract number, customer, vehicle, plate, description, reference, and vendor — not raw enum keys.

## Manual Expense

`POST /finance/expenses` — categories: Vehicle Cleaning, Fuel, Parking, Government Fees, Office/Admin, Marketing, Operations, Other.

- Optional vehicle, vendor, receipt number, attachment, note
- Void → reversal ledger row; no hard delete
- Correct → void original + create corrected expense
- Add / Correct / Void forms pass relative FormError keys (`required`, `wholeAed`, `positiveAmount`, `tooLong`) — never `validation.*` prefixes

**No Manual Income.** Maintenance expenses originate from Maintenance module only.

Simulated ledger expense View opens a demo-only detail. Void / Correct / Add Expense are disabled while simulation is on. Fake IDs are never sent to Finance mutation APIs.

## Demo Simulation

Gated by `NEXT_PUBLIC_DEMO_SIMULATION_ENABLED=true` (existing project flag). Production stays off unless explicitly configured.

- Frontend-only in-memory overlay (`financeOverlay` on the shared Demo Simulation store)
- One fixture dataset; Collected / Expenses / Net Movement / trend / expense breakdown are derived from the same movements
- Outstanding and Open Receivables are derived from simulated open receivables and **do not** change with Today / Week / Month
- Fixtures cover every Movement, every Ledger Source, the manual-expense correction chain, all manual categories + Maintenance, and all four receivable sources
- Reset Simulation restores fixtures and filter state with no backend calls
- Disable Simulation returns the page to real `/finance/summary|open-receivables|analytics|ledger` data
- No Stripe Checkout, no payment confirmations, no backend simulation routes

The page shows a persistent **DEMO SIMULATION / محاكاة تجريبية** banner so simulated values cannot be mistaken for real company money.

## Architecture

```
FinanceScreen → useFinance* hooks → finance.store → finance.api → Fastify /finance/*
                                     ↘ financeOverlay (demo only; no API writes)
```

## Stripe-only rule

Customer collections are Stripe-confirmed only. Finance V1 has no Deposit, no Invoices, no manual customer collection UI.
