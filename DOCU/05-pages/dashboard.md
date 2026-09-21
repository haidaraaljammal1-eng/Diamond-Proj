# Home Dashboard Page

Live operational home for Diamond Rent Car. The layout stays the Demo
`vDash()` identity (KPI tiles, latest contracts, Quick Access, weekly charts,
today’s deliveries, fleet status). Values come from `GET /dashboard/overview`,
not from demo fixtures.

## Route

| Locale | URL             |
| ------ | --------------- |
| ar     | `/ar/dashboard` |
| en     | `/en/dashboard` |

Navigation key: `dashboard`.

## Required permissions

| Permission          | Used for |
| ------------------- | -------- |
| `dashboard.read`    | Page access |
| `contracts.read`    | Active rentals, pending links, deliveries, latest contracts, weekly rental activity |
| `vehicles.read`     | Fleet KPI and Fleet Status (active vehicles only) |
| `finance.read`      | Weekly Financial Summary donut |
| `gps.read`          | GPS Quick Access tile (online count when the provider is configured) |
| `maintenance.read`  | Maintenance Quick Access tile |
| `contracts.manage` + `vehicles.read` | Generate New Link → Fleet, where Generate Link already exists |

Missing domain permissions hide that section (`null` from the API). They never
show a fabricated zero. Role names are not hardcoded.

Frontend path:

`DashboardScreen` → `useDashboardOverview` → Dashboard Zustand store →
`GET /dashboard/overview` → Fastify. Charts and cards do not call fetch.

## KPI rules

| Card | Source |
| ---- | ------ |
| Active Rentals | Contracts in `ACTIVE` + `RETOUT` (physical custody). **PAID is not rented.** **REVIEW after Car-In is not custody.** |
| Fleet | Active vehicles (`Vehicle.isActive = true`): rented / total |
| Pending Links | `AWAITING` + `FORM` |
| Deliveries Today | Contracts whose canonical `startAt` falls on today’s business day and whose Car-Out is not done (`AWAITING`, `FORM`, `SIGNED`, `PAID`). Ready count = `PAID`. |

Fake month-over-month / `▲` trend text is removed. The Active Rentals note is
“currently with customers”.

## Quick Access

Existing tiles only, permission-filtered, locale-aware:

| Tile | Route |
| ---- | ----- |
| Fleet / Vehicles | `/[locale]/vehicles` |
| Contracts | `/[locale]/contracts` |
| GPS | `/[locale]/gps` |
| Maintenance | `/[locale]/maintenance` |

Generate New Link goes to `/[locale]/vehicles` (the existing Generate Link
workflow). No parallel screen and no invented query parameters. The Demo
WhatsApp / chats tile is gone — there is no real destination.

Row actions on latest contracts and today’s deliveries open the existing
Contract Detail Drawer; lifecycle actions continue on `/contracts`.

## Weekly Financial Summary (donut)

Last **7 consecutive calendar days** in the business timezone, including
Saturday and Sunday. Days with no movement stay in the range as zero. Outstanding
is **not** in this chart.

- **Collections:** Rental Payment, Renewal Payment, Return Reconciliation, Post-Close Charge (trusted Stripe Collected — same Finance rules).
- **Expenses:** Maintenance + Manual Expenses (effective Finance expenses). Voided Manual Expense nets to zero; a corrected expense uses its current ledger amount.
- Compact totals: Collected, Expenses, **Net Movement** (`Collected − Expenses`). Never labelled Profit / Revenue / Net Profit.
- Zero categories are omitted from slices. AED formatting matches Finance.
- Hover / tap a slice to show a compact detail beside the chart: category name, amount, share, and Collection / Expense. The donut center stays **Net Movement**. Summary cards stay in sync with the same Finance totals. No second finance engine.

## Weekly Rental Activity (bars)

Last **7 consecutive calendar days** (weekends included). Two integer series:

- **Rented** = completed Car-Out (`ContractCarOut.occurredAt`)
- **Returned** = completed Car-In (`ContractCarIn.occurredAt`)

Not `createdAt`, payment date, `PAID`, `CLOSED`, or reconciliation approval.
Every day in the window is a chart bucket; a quiet day is `0`. Labels are
localized weekday + date (`Fri 05`).

## Fleet Status

Active fleet only (`isActive = true`):

`available + rented + service = total`

from canonical `operationalStatus` (`AVAILABLE` / `RENTED` / `SERVICE`).

## Today's Deliveries

Canonical date: Contract `startAt` (agreed pickup) in the backend business
timezone. Pending hand-overs only — Car-Out already completed (`ACTIVE`,
`RETOUT`, `REVIEW`, `CLOSED`) is excluded. Empty copy:

- EN: No deliveries scheduled today
- AR: لا توجد تسليمات مجدولة اليوم

## Operating company markers

Today's Deliveries and Latest Contracts show the row's `Contract.company` through
the shared `CompanyIdentity`, inline in the row meta line beside the contract
number. It is metadata, not the row's primary content, and never occupies the
trailing status slot.

The company comes from the row payload; neither card fetches companies and there
is no per-row lookup. The dashboard has **no company selector and no company
filter** — the KPIs, weekly finance, weekly rental activity and fleet status are
whole-business and unchanged. A dashboard company scope is deferred until the
Finance company foundation (Phase C) exists.

The field is optional on both row types, so a simulated or pre-multi-company
payload simply renders no marker.

## Charts

Existing Recharts infrastructure: `DonutChart` + `GroupedBarChart` (same tokens
as `TrendChart`). No new chart library. Donut hover uses the chart’s
active-slice / legend focus — not a second data source.

## Dashboard Simulation (removable, frontend-only)

Optional presentation overlay behind `NEXT_PUBLIC_DEMO_SIMULATION_ENABLED` in development, scoped to Dashboard and independent of the rental provider flag.
When the flag is off, the Simulation control is hidden and the page is the
real Dashboard only.

```
REAL: GET /dashboard/overview → store → cards/charts
SIM:  local fixture overlay → the same cards/charts
```

Rules:

- No backend writes, no fake Dashboard API, no Stripe, no DB rows.
- Real and simulated values never mix.
- Switching off restores the live API overview immediately.
- Quick Access still uses real routes and real permissions.
- Simulated contract rows do not open the real Contract drawer.
- Real store / API / `useDashboardOverview` do not import simulation.

Disable later by setting the env flag to false, or delete
`APP/frontend/src/modules/dashboard/simulation/` plus the overlay import in
`DashboardScreen`. Neither path needs backend, API, or business-logic changes.
`dashboard.demo-data.ts` stays deleted and is not used in Real mode.
