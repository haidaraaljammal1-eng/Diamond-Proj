# System-wide operating company audit and rollout

Where UNIQUE / ELITE is visible today, where it is still missing, and which phase
owns each gap. Read this with
[operating-companies.md](./operating-companies.md), which defines the rules.

Updated 2026-09-20, after **Phase A**.

## The two kinds of company

Diamond has exactly two ways a record knows its company, and mixing them is the
main risk this audit exists to prevent.

| Kind | Rule | Examples |
| ---- | ---- | -------- |
| **Persisted** | The row stores `companyId` because it must survive later changes elsewhere | `Vehicle`, `Contract` |
| **Derived** | The row reads the company from a relation whose company can never move | `MaintenanceOrder` → Vehicle, GPS state → Vehicle |

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
| Road liabilities | none yet | no | no | B |
| Imports | none — creators resolve the default company | no | no | B |
| Dashboard | none yet | no | no | B |
| Finance ledger (`FinancialLedgerEntry`) | none yet | no | no | C |
| Manual expense (`ManualExpense`) | none yet | no | no | C |
| Invoices / daily statements | do not exist yet | — | — | later |
| Company-scoped RBAC | does not exist — staff see every company | — | — | later |

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

- Company on `FinancialLedgerEntry` and `ManualExpense` — **Phase C**. A
  completed Maintenance order with a cost writes a `MAINTENANCE_EXPENSE` ledger
  entry; that entry will persist its own `companyId` at write time, because a
  ledger row is recognized history and must not be re-derived from the Vehicle
  later. Until then, Maintenance derives its company and Finance stores none.
- Road liabilities, imports and dashboard — **Phase B**.
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
