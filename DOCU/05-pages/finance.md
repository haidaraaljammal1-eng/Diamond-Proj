# Finance Page (Frontend V1)

Route: `/[locale]/finance` (`/ar/finance`, `/en/finance`)

Permission: `finance.read` (navigation + page access). Manual expense mutations require `finance.manage_expenses`.

## Purpose

Administrative financial operations center backed by Finance Backend V1. The page presents backend-authoritative totals only — no frontend financial recalculation.

## Layout (top → bottom)

1. Page header — refresh + Add Expense (`finance.manage_expenses` only)
2. Period control — Today / Week / Month / Custom
3. Four KPI cards — Collected, Outstanding, Expenses, Net Movement
4. Open Receivables — operational collection queue
5. Financial Analytics — trend + outstanding/expense breakdowns
6. Financial Ledger — audit-style movement table

## KPI semantics

| KPI | Meaning | Period |
| --- | --- | --- |
| Collected | Stripe-confirmed customer money | Selected period |
| Outstanding | Current unpaid obligations | **Current balance** (not period-filtered) |
| Expenses | Recognized company expenses (maintenance + manual, net of voids) | Selected period |
| Net Movement | `Collected − Expenses` | Selected period |

Do not label Collected as Revenue or Net Movement as Profit.

## Open Receivables

`GET /finance/open-receivables` — union of:

- `RENTAL` — signed, unpaid Stripe rental
- `RENEWAL` — approved renewal awaiting payment
- `RECONCILIATION` — approved, unsettled reconciliation
- `POST_CLOSE_RECEIVABLE` — open post-close charge

Action: **View** opens the existing Contract Detail Drawer. Finance does not provide manual collection controls.

## Analytics

- **Financial Trend** — daily collected vs expenses (+ net in tooltip/chart)
- **Outstanding Breakdown** — current balance by source (not period-filtered)
- **Expense Breakdown** — period expenses by category

No payment-method breakdown. No invoices.

## Ledger

`GET /finance/ledger` — paginated recognized movements.

Display semantics:

- Collection → `+ AED …`
- Expense → `- AED …`
- Expense Reversal → `+ AED …` with explicit reversal label (not income)

Manual expense rows open the Finance Expense Detail Drawer.

## Manual Expense

`POST /finance/expenses` — categories: Vehicle Cleaning, Fuel, Parking, Government Fees, Office/Admin, Marketing, Operations, Other.

- Optional vehicle, vendor, receipt number, attachment, note
- Void → reversal ledger row; no hard delete
- Correct → void original + create corrected expense
- Add / Correct / Void forms pass relative FormError keys (`required`, `wholeAed`, `positiveAmount`, `tooLong`) — never `validation.*` prefixes

**No Manual Income.** Maintenance expenses originate from Maintenance module only.

## Architecture

```
FinanceScreen → useFinance* hooks → finance.store → finance.api → Fastify /finance/*
```

## Stripe-only rule

Customer collections are Stripe-confirmed only. Finance V1 has no Deposit, no Invoices, no manual customer collection UI.
