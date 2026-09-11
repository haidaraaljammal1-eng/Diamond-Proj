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
4. Financial Ledger — audit-style movement table
5. Financial Analytics — trend + outstanding/expense breakdowns
6. Open Receivables — operational collection queue

Ledger and Open Receivables swapped positions only. KPIs, period control, and analytics keep their surrounding order.

## KPI semantics

| KPI | Meaning | Period |
| --- | --- | --- |
| Collected | Stripe-confirmed customer money (or simulated Customer Collection rows) | Selected period |
| Outstanding | Current unpaid obligations | **Current balance** (not period-filtered) |
| Expenses | Recognized company expenses (maintenance + manual, net of reversals) | Selected period |
| Net Movement | `Collected − Expenses` | Selected period |

Do not label Collected as Revenue or Net Movement as Profit.

Expense Reversal is a technical Void offset of a company expense, not income and not Customer Collection. Net expenses subtract reversals (example: −100 +100 reversal → Expenses **0**). Correct Expense does **not** create a reversal.

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
| VOIDED | Voided | ملغى |

The Movement filter options are: All Movements, Customer Collection, Expense, Voided. **Expense Reversal / إلغاء مصروف** is not a user-facing Movement in the main Ledger.

**Source** answers “where did this movement originate?”

| Origin | EN | AR |
| --- | --- | --- |
| Rental Payment | Rental Payment | دفعة إيجار |
| Renewal Payment | Renewal Payment | دفعة تجديد |
| Return Reconciliation | Return Reconciliation | تسوية الإرجاع |
| Post-Close Charge | Post-Close Charge | مطالبة بعد الإغلاق |
| Maintenance | Maintenance | صيانة |
| Manual Expense | Manual Expense | مصروف يدوي |

Do not use Customer Collection, Expense, Voided, or Expense Reversal as Source labels.

Correct Expense updates the **same** Manual Expense in place (same ID, status stays ACTIVE) and records immutable Correction History inside the same expense details. Finance Ledger / KPIs / analytics use the current amount (example: 100 → 80 shows **− AED 80** on the same operational row). It does **not** VOID the expense, create a reversal, or create a replacement expense.

A voided Manual Expense is shown as **one** operational row:

- Movement: Voided / ملغى
- Source: Manual Expense / مصروف يدوي
- Amount: original value with strikethrough (`AED 100`), no `+ AED` / green styling

The technical `MANUAL_EXPENSE_REVERSAL` (`+ AED …`) remains in the backend ledger for accounting (original −100 + reversal +100 = **0** effective expense). It is **not** listed as a duplicate row in the main Finance Ledger. Expense filter = active expenses only. Voided filter = voided Manual Expenses only. All Movements = collections + active expenses + voided original rows (no hidden reversal duplicates). Demo Simulation follows the same presentation and never writes to Backend.

Desktop columns share one width definition between header and body (`table-layout: fixed` + `colgroup`): Date, Movement, Source, Description / Reference, Contract / Vehicle, Amount, Action. Long description/reference/contract/vehicle text truncates; Amount and Action widths stay stable. The same layout is used in real mode and Demo Simulation. Horizontal scrolling is preserved on smaller screens; cards remain at 700px.

Corrected expenses: same operational Expense row with the current amount (`- AED 80`). Correction History lives in expense details, not as extra Ledger movements.

Amount presentation (sign only; backend values stay unsigned):

- Customer Collection → `+ AED …` (positive styling)
- Expense → `- AED …` (negative styling)
- Voided Manual Expense → `AED …` with strikethrough / muted styling (not Collection green, not `+ AED`)

Toolbar: Search, Movement, Source, Clear. Period stays on the page control so KPIs, analytics, and ledger share one range.

Real-mode search uses backend-supported fields. Simulation search covers contract number, customer, vehicle, plate, description, reference, and vendor — not raw enum keys.

## Manual Expense

`POST /finance/expenses` — categories: Vehicle Cleaning, Fuel, Parking, Government Fees, Office/Admin, Marketing, Operations, Other.

- Optional vehicle, vendor, receipt number, attachment, note
- Void → reversal ledger row; no hard delete. Standalone **Void Expense** still requires Void Reason / سبب الإلغاء. Voided Ledger presentation stays **Voided / ملغى** with a struck-through original amount.
- Correct → in-place update of the same Manual Expense (same ID, ACTIVE) + immutable **Correction History / سجل التعديلات** inside the same details. **Correct Expense has no Void Reason field.** A VOID expense cannot be corrected. Saving without changes does not create history.
- Add / Correct / Void forms pass relative FormError keys (`required`, `wholeAed`, `positiveAmount`, `tooLong`) — never `validation.*` prefixes

**No Manual Income.** Maintenance expenses originate from Maintenance module only.

Simulated ledger expense View opens a demo-only detail. Add Expense and Void stay disabled while simulation is on. Correct Expense is frontend-only during simulation (same ID, in-place, Correction History, no backend writes). Fake IDs are never sent to Finance mutation APIs.

## Demo Simulation

Gated by `NEXT_PUBLIC_DEMO_SIMULATION_ENABLED=true` (existing project flag). Production stays off unless explicitly configured.

- Frontend-only in-memory overlay (`financeOverlay` on the shared Demo Simulation store)
- One fixture dataset; Collected / Expenses / Net Movement / trend / expense breakdown are derived from the same movements
- Outstanding and Open Receivables are derived from simulated open receivables and **do not** change with Today / Week / Month
- Fixtures cover every Movement, every Ledger Source, a standalone voided Manual Expense (plus hidden technical reversal), an in-place corrected Manual Expense with Correction History, all manual categories + Maintenance, and all four receivable sources
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
