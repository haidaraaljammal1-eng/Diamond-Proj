# System-wide operating company audit and rollout

Where UNIQUE / ELITE is visible today, where it is still missing, and which phase
owns each gap. Read this with
[operating-companies.md](./operating-companies.md), which defines the rules.

Updated 2026-09-22, after **Phase C2** (Finance page + Dashboard scope).

## The two kinds of company

Diamond has exactly two ways a record knows its company, and mixing them is the
main risk this audit exists to prevent.

| Kind | Rule | Examples |
| ---- | ---- | -------- |
| **Persisted** | The row stores `companyId` because it must survive later changes elsewhere | `Vehicle`, `Contract`, `FinancialLedgerEntry`, `ManualExpense` |
| **Derived** | The row reads the company from a relation whose company can never move | `MaintenanceOrder` → Vehicle, GPS state → Vehicle, receivables → Contract |

Phase C1 added a third answer that is neither: **GENERAL**, meaning `companyId IS
NULL`. It is not a company and never becomes one — see
[operating-companies.md](./operating-companies.md#general-is-a-classification-not-a-company).

A record gets a persisted `companyId` only when its own company could otherwise
be recomputed **wrongly** later. `Contract.companyId` is persisted because a
contract is frozen history. `MaintenanceOrder` is not, because
`Vehicle.companyId` is write-once and can never drift away from it.

Duplicating a company where a reliable immutable source already exists creates
two answers to one question. That is a bug waiting for its first disagreement.

## Current state by domain

| Domain | Company source | Read DTO | Server-side filter | Phase |
| ------ | -------------- | -------- | ------------------ | ----- |
| Vehicles | `Vehicle.companyId` (persisted, write-once) | yes | `?companyId=` | done |
| Contracts | `Contract.companyId` (persisted, historical) | yes | `?companyId=` | done |
| Official contract | frozen snapshot from `Contract.company` | yes | n/a | done |
| Public rental | `office.company` from `Contract.company` | yes | n/a | done |
| TARS | `Contract.companyId` → company-specific provider | yes | n/a | done |
| Maintenance | derived from `Vehicle.company` | yes | `?companyId=` (Vehicle relation) | **A** |
| GPS | derived from `Vehicle.company` | yes | `?companyId=` (`Vehicle.companyId`) | **A** |
| Vehicle pickers (Maintenance, Finance) | `Vehicle.company` on the existing card DTO | yes | `?companyId=` on `GET /vehicles` | **A** |
| Road liabilities / Salik | derived: attributed `Contract.company`, else `Vehicle.company`, else `null` | yes (nullable) | `?companyId=` (contract-first) | **B** |
| Imports | none — imports are match-only and never create or assign a company | n/a | n/a | **B** |
| Dashboard rows | `Contract.company` on `todayDeliveries` / `recentContracts` | yes | `?companyId=` on the overview | **C2** |
| Dashboard fleet KPIs | `Vehicle.companyId` | counts | `?companyId=` | **C2** |
| Dashboard contract KPIs / rentals / weekly rental | `Contract.companyId` | counts | `?companyId=` | **C2** |
| Dashboard weekly finance | `FinancialLedgerEntry.companyId` | totals | omitted = ALL, includes GENERAL; `?companyId=` excludes it | **C2** |
| Finance ledger (`FinancialLedgerEntry`) | `companyId` (persisted at write time, nullable) | yes (nullable) | `?companyId=` / `?companyScope=GENERAL` | **C1** |
| Manual expense (`ManualExpense`) | `companyId` derived from the optional Vehicle, persisted, nullable | yes (nullable) | through the ledger and its own column | **C1** |
| Finance receivables | derived from `Contract.company` — no column | yes (nullable) | `?companyId=`, GENERAL returns none | **C1** |
| Finance frontend | consumes the C1 scope; no expense company field | yes | server-side, not client-filtered | **C2** |
| Invoices / daily statements | do not exist yet | — | — | later |
| Company-scoped RBAC | does not exist — staff see every company | — | — | later |

## Phase C1 — Finance database + backend (done, 2026-09-21)

The first Finance database change since `finance_v1`. Migration
`20260921090000_finance_company_classification` adds two **nullable** columns and
backfills them from relations only. **No frontend change, no Invoice, no daily
statement, and no third OperatingCompany.**

- **Manual Expense company is backend-owned and derived from the optional
  Vehicle.** A Vehicle makes the expense that Vehicle's company; no Vehicle makes
  it GENERAL (`null`). The dialog gains **no** company field, the API accepts no
  company input, and a client-sent `companyId` is dropped by Zod — so a request
  claiming *Vehicle = ELITE, company = UNIQUE* still stores ELITE.
- **The ledger persists its company at write time**, from each writer's own
  authoritative source: Contract payments use `Contract.companyId` (frozen
  history, never the Vehicle's current owner), maintenance uses
  `MaintenanceOrder → Vehicle.companyId`, and the three Manual Expense writers
  copy `ManualExpense.companyId` verbatim. All five funnel through the single
  `insertLedgerEntry`, which now requires `companyId` explicitly, so a new writer
  cannot forget it.
- **Nothing falls back to UNIQUE.** No writer, no backfill step and no query
  substitutes a default for a missing company. Unresolvable stays `null`.
- **Filters:** no parameter = ALL (UNIQUE + ELITE + GENERAL), `?companyId=N` =
  that company, `?companyScope=GENERAL` = `companyId IS NULL`. ALL is the
  *absence* of a predicate — expressing it as `companyId IS NOT NULL` would drop
  GENERAL. The two cannot be combined (422 `FINANCE_COMPANY_SCOPE_CONFLICT`).
- **Receivables derive through the Contract** and gained no column. A Contract
  always has a company, so GENERAL correctly returns no contract receivables, and
  no general-receivable concept was invented to fill the gap.
- **Phase C1 left the dashboard on the ALL default.** Phase C2 now passes a
  company scope into those same helpers. All Companies still includes GENERAL.

Backfill, and what the numbers were: development `diamond` had 10 manual expenses
(all vehicle-less → all GENERAL) and 12 ledger rows (all from those expenses →
all null). `haidara_test` had 173 ledger rows: 165 resolved from their Contract,
8 from maintenance → Vehicle, 0 unresolved. Both databases report zero
ledger/contract and ledger/expense mismatches. Re-run the evidence any time with
`npm run verify:finance-company`.

## Phase B (done, 2026-09-21)

Road liabilities / Salik, the single Vehicle creation source, and dashboard rows.

**No database change.** No Prisma edit, no migration, no new `companyId` column,
no Finance schema change.

- **Road liabilities are the first *three-way* derived domain.** A liability may
  have a Contract, a Vehicle, both, or neither, so precedence had to be written
  down once and kept in the Backend: attributed `Contract.company` wins, the
  Vehicle answers only when there is no Contract, and a liability with neither
  stays `null`. The frontend consumes the resolved `company` and never rebuilds
  that order. The filter uses the same precedence
  (`attributedContract.companyId = X` OR `attributedContractId IS NULL AND
  vehicle.companyId = X`), so a liability on a UNIQUE vehicle under an ELITE
  Contract answers to ELITE only. All Companies keeps unmatched rows visible.
  Salik follows the identical rule; no company is inferred from a provider,
  account, endpoint or external reference. `RoadLiabilityCustomerCharge` and
  `ContractPostCloseReceivable` gained no company column.
- **Fleet → Add Vehicle became the sole Vehicle creation source.** The sales
  import and purchase experiences both used to create a Vehicle under the default
  company; both now reference an existing one or fail. `resolveDefaultOperatingCompanyId`
  is deleted with them. Imports gained no Company selector on purpose — a module
  that cannot create a Vehicle has no business choosing its company. An
  ambiguous `externalId` (held by two companies) matches nothing rather than
  guessing.
- **Dashboard got rows, not a scope.** `todayDeliveries` and `recentContracts`
  carry `Contract.company` in the same query and render it as row metadata. No
  header selector and no KPI change. The page scope arrived in Phase C2.

### The rule Phase B exists to protect

A permanent, unchangeable field must have exactly one place that sets it. Before
Phase B, `Vehicle.companyId` was immutable *and* three different code paths could
write it, two of them silently defaulting to UNIQUE. A sales file could put an
ELITE car in the UNIQUE fleet for ever, with no workflow to correct it. Closing
the extra doors is what makes the write-once rule mean anything.

## Phase A (done, 2026-09-20)

TARS status UI, both Vehicle pickers, Maintenance and GPS.

**No database change.** No Prisma edit, no migration, no new `companyId` column,
no Finance schema change. Every Phase A surface reads company through an existing
relation.

- **Maintenance.** `MaintenanceOrder` has no company of its own. The embedded
  Vehicle projection on list and detail now carries the compact company ref, and
  `GET /maintenance?companyId=` filters through the Vehicle relation. Company
  composes with `status`, `search`, `maintenanceType`, `vehicleId`, sort and
  pagination. The lifecycle (create → scheduled/in service → ready → complete /
  cancel), the cost rules and the vehicle AVAILABLE/SERVICE transitions are
  untouched.
- **GPS.** `GpsVehicleSummary` and `GpsMapPoint` carry the company ref, and
  `GET /gps/vehicles?companyId=` filters `Vehicle.companyId`. Nothing about
  company is persisted in `VehicleGpsBinding` or `VehicleGpsLatestState`, and no
  company value reaches a provider — the `GpsProvider` boundary exposes only
  `name` and `configured`, so there is nothing for a company to travel on.
  The map is deliberately **not** company-filtered, matching how the existing
  search and tracking filters already scope the list only.
- **Vehicle pickers.** Both pickers already loaded `VehicleCardDto`, which
  carries `company`. They now show it in the option row and keep it in the
  selected-vehicle summary, and both narrow through the existing
  `GET /vehicles?companyId=` query rather than filtering a fetched page locally.
- **TARS UI.** The Backend already sent the routing company; the frontend type
  dropped it. It now flows to the section heading as `TARS · UNIQUE` /
  `TARS · ELITE`. No execute, retry, test-connection or configuration control was
  added, and both providers stay unconfigured and fail closed.

### Deliberately deferred

- Company on `FinancialLedgerEntry` and `ManualExpense` — done in **Phase C1**
  (above), exactly as predicted here: the `MAINTENANCE_EXPENSE` entry persists its
  own `companyId` at write time, because a ledger row is recognized history and
  must not be re-derived from the Vehicle later. Maintenance still derives.
- Road liabilities, imports and dashboard rows — done in **Phase B** (above).
- Finance frontend and the dashboard company scope — done in **Phase C2**.
- Invoices, daily statements and company-scoped RBAC — later.

### Two defects the QA pass caught

Both were caused by the company marker itself and are fixed:

1. **A TARS projection without `company` took the whole section down.** The
   frontend type made it required, so a stale or mocked payload threw inside the
   marker. `TarsSummary.company` is now nullable and the marker is simply
   omitted — the same principle that already keeps a failed integration read from
   breaking the Contract drawer.
2. **The Finance picker option row wrapped at 390px.** `CompanyIdentity` is
   `flex: none`, so all the squeeze landed on the bare vehicle name, which had no
   `min-width: 0`. Long names wrapped to two lines and the rows went ragged
   (64px next to 41px). The name now truncates with an ellipsis, the plate stays
   whole as a code, and the row carries `min-width: 0` so it shrinks to the list
   instead of scrolling it.

The general lesson for the next surface: the marker never yields width, so
whatever sits beside it must be the thing that gives — give the flexible text
`min-width: 0` and an ellipsis, and let codes keep `flex: none`.

## Rules Phase A locked in

1. **`Vehicle.companyId` is immutable.** Chosen once at Add Vehicle, refused by
   every update path (422 `immutable_field`). There is no transfer workflow. This
   is what makes deriving Maintenance and GPS company safe.
2. **UNIQUE TARS and ELITE TARS are separate integrations.** Two providers, two
   configurations, two credential sets, two APIs. A contract never crosses.
3. **TARS routing reads `Contract.companyId`** — never the Vehicle's current
   company, a frontend selection, a query parameter or a default. This protects
   historical contracts from provider crossover.
4. **Real TARS APIs do not exist yet.** Both companies remain
   `configured = false` and fail closed with `TARS_NOT_CONFIGURED`. No endpoint,
   credential, payload shape or environment secret was invented.
5. **Company is identity, not status.** It renders through the shared
   `CompanyIdentity` with the backend `displayName` and `accentColor`. It is never
   styled as, or placed as, a lifecycle chip, and no module hardcodes a company
   colour or a local `["UNIQUE", "ELITE"]` array.
6. **Active companies come from the authoritative source** — the
   `modules/operating-companies` API → store → hook chain. Components never fetch.

## Adding company to the next domain

1. Decide persisted or derived using the table at the top. Derive whenever an
   immutable relation already answers the question.
2. If persisted, the column is required, `onDelete: Restrict`, indexed, and set
   at write time from the authoritative source — never recomputed on read.
3. Expose the compact company ref (`id`, `code`, `displayName`, `accentColor`)
   on every read model where vehicle or contract identity already appears, so no
   list needs a company lookup per row. Backend: `COMPANY_REF_SELECT` in
   `src/modules/operating-companies/company-ref.ts`.
4. Add `companyId` to the list query schema and filter it in the database. Never
   filter a fetched page in the frontend.
5. Render it with the shared `CompanyIdentity`, and give the **container** the
   layout — see the company marker layout rule in
   [operating-companies.md](./operating-companies.md).
6. Reuse the `OperatingCompanies` i18n namespace (`company`, `all`, `loading`)
   rather than adding per-module company strings.
