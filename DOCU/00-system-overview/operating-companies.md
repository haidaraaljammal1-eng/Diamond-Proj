# Operating companies (UNIQUE / ELITE)

Diamond runs one fleet, one staff team and one workflow for two rental companies:
**UNIQUE** and **ELITE**. The company is a classification and routing dimension.
It never forks the Contract lifecycle, Car-Out/Car-In, payments, reservation or
maintenance, and it never changes contract numbering.

Status: **UNIQUE / ELITE is rolled out across the current operational pages.**
Phase C2 added the Finance page scope (ALL / UNIQUE / ELITE / GENERAL) and the
Dashboard scope (All Companies / UNIQUE / ELITE). GENERAL stays a Finance
classification (`companyId` null), not a dashboard company and not an
`OperatingCompany`. TARS routing is company-aware; both providers remain
unconfigured. Invoices and daily statements are still later.

Which domains carry company today, which still do not, and which phase owns each
gap: [operating-company-rollout-audit.md](./operating-company-rollout-audit.md).

## `OperatingCompany`

`prisma/schema/master-data.prisma`, table `operating_companies`.

| Field | Notes |
| ----- | ----- |
| `id` | `Int` autoincrement, matching the other master-data entities |
| `code` | Stable business key, `@unique`, normalized UPPERCASE: `UNIQUE`, `ELITE` |
| `displayName` | Short operational label for lists and filters |
| `legalNameAr` / `legalNameEn` | Legal names for the official contract. Not UI copy, never translated through next-intl |
| `accentColor` | Brand accent for documents and lists. Not an operational-status colour |
| `isActive` | Soft deactivation. A company is never hard-deleted |

Seeded rows:

| code | displayName | legalNameEn | accentColor |
| ---- | ----------- | ----------- | ----------- |
| UNIQUE | UNIQUE | DIAMOND UNIQUE CAR RENTALS CO. LLC S.O.C | `#C9A15C` |
| ELITE | ELITE | DIAMOND ELITE CAR RENTALS CO. LLC S.O.C | `#3E5C76` |

Both `accentColor` values are **placeholders**: no official brand colour exists in
the repository or in DOCU. UNIQUE reuses the current Diamond gold and ELITE uses a
muted slate blue that stays distinguishable beside it. Replace both when the
companies supply their real brand values; every later surface (contract, invoice,
statement, reporting) must read this field instead of hardcoding a colour.

## Ownership

- **`Vehicle.companyId` — required and WRITE-ONCE.** Every fleet vehicle, active
  or retired, belongs to exactly one company, chosen once at Add Vehicle. It can
  never change afterwards: Diamond has **no vehicle company transfer workflow**.
  See [Write-once company](#write-once-company) below.
- **`Contract.companyId` — required, historical.** The company that owned the
  Vehicle when the Contract was created. It is frozen history, like
  `contractNumber` and `snapshot`, and stays the authoritative contract/company
  dimension for filters, the legal snapshot, TARS routing and future invoices,
  statements and reporting — it is never derived away, even though the Vehicle's
  company can no longer move. Nothing in the database cascades a company change
  into Contracts; the Backend sets the Contract's company from the Vehicle at
  creation time.
- Both relations use `onDelete: Restrict`. A company that owns vehicles or
  contracts cannot be deleted; deactivate it with `isActive = false` instead.
- Indexes: `vehicles.companyId`, `contracts.companyId`, `operating_companies.isActive`.

## Migration and existing data

`20260920012059_multi_company_foundation` is one deterministic migration:

1. create `operating_companies` and insert UNIQUE and ELITE (`ON CONFLICT DO NOTHING`);
2. add `vehicles.companyId` nullable, backfill every row to UNIQUE, abort if any
   row is still null, then `SET NOT NULL`;
3. add `contracts.companyId` nullable, backfill **from the vehicle relation**
   (`contracts.companyId := vehicles.companyId`), abort if any row is still null,
   then `SET NOT NULL`;
4. create the indexes and the two `RESTRICT` foreign keys.

It inserts the company rows itself, so it never depends on a seed having run
first. `prisma/seed/operating-companies.ts` upserts the same rows by `code`
afterwards and converges on them; `isActive` is never overwritten by a re-seed.

Approved business rule for the backfill: **all pre-existing Vehicles and
Contracts are UNIQUE**, retired vehicles included.

Verified on the development database after applying: 2 companies, 32 vehicles and
17 contracts unchanged in count, every row assigned to UNIQUE, no null company,
no contract number changed, no lifecycle value changed, no snapshot rewritten.

## Seeding

- `npm run db:seed` (base seed) upserts UNIQUE and ELITE. They are required master
  data, not demo data, so they belong in every environment.
- `npm run db:seed:demo` creates the 20 `DEMO-FLEET-*` vehicles **explicitly under
  UNIQUE** rather than relying on the migration backfill, and never re-assigns the
  company of a vehicle that already exists.
- `npm run dev:bootstrap` runs both, so a clean development database reproduces
  the same state.

No ELITE development vehicle is seeded yet: it would change the expected demo
fleet count that the bootstrap health check asserts. Add one from the UI once the
backend phase can create vehicles under a chosen company.

## Uniqueness

- `plateNumber` stays **globally** unique — two companies cannot hold the same plate.
- `vin` stays **globally** unique.
- `externalId` is unique **per company** (`@@unique([companyId, externalId])`,
  migration `20260920033000_vehicle_external_id_per_company`). UNIQUE + `123` and
  ELITE + `123` may coexist; the same id twice inside one company is rejected.
  Postgres keeps NULLs distinct, so vehicles without an external id are unaffected.
  All lookups now pass `companyId_externalId`: `vehicles.service.assertExternalIdFree`,
  `imports/row-evaluate` and the demo fleet seed. Road-liability matching by
  `externalVehicleRef` accepts a hit only when exactly one vehicle across all
  companies carries that id, so an ambiguous id attributes to nothing.

`tests/integration/operating-companies.test.ts` asserts the live constraints:
company code uniqueness, both `companyId` columns NOT NULL, invalid company FK
rejected, delete restricted, plate/VIN global uniqueness, and the current
global-`externalId` behaviour.

## Backend behaviour (phase 2, done)

| Area | Behaviour |
| ---- | --------- |
| `GET /operating-companies` | Active companies by default, `?activeOnly=false` includes retired ones. Read-only reference data, permission `reference_data.lookup` / `vehicles.read` / `contracts.read` (any). `GET /operating-companies/:id` also exists. |
| Vehicle create | `companyId` required; unknown or retired company rejected. No hidden default anywhere in the vehicle service. |
| Vehicle update | `companyId` is **write-once**. A different value is a 422 `immutable_field`; the same value is a no-op. No update path writes it. |
| Vehicle DTOs + fleet filter | `company` ref on every projection; `?companyId=` filters in Prisma. |
| Contract create | `companyId` is derived from the Vehicle server-side; a client value is ignored. |
| Contract DTOs + list filter | `company` ref on list and detail; `?companyId=` filters `Contract.companyId`. |
| Official contract | `header.company` (code, display, legal AR/EN, accent) from the Contract, frozen at SIGNED. Legacy snapshots fall back to the live company (UNIQUE) and are never rewritten. |
| Public rental | `office.company` exposed; the customer never selects a company. |
| TARS | `createTarsProvider(companyCode)` / `getTarsConfig(companyCode)`, routed from `Contract.companyId`; status DTO carries the routing company; both companies still unconfigured and fail closed. |
| Legacy creators | **Removed in Phase B.** The sales import and purchase experiences no longer create Vehicles, so `default-company.ts` (`resolveDefaultOperatingCompanyId`) is deleted. Nothing resolves a default company any more. |

Tests: `tests/integration/multi-company.test.ts` (20), `tests/integration/operating-companies.test.ts` (10),
`tests/unit/multi-company-routing.test.ts` (8). Fixtures resolve a real company through
`tests/helpers/operating-company.ts` instead of inventing ids.

## Write-once company

The operating company is selected **once**, when the Vehicle is created, and can
never be changed. A vehicle created under UNIQUE stays UNIQUE forever; one created
under ELITE stays ELITE forever. There is no transfer workflow, no admin override
and no bulk reassignment.

| Surface | Rule |
| ------- | ---- |
| `POST /vehicles` | `companyId` **required**. The company must exist and be active (422 `invalid_parent` / `inactive_reference`). No default. |
| `PUT /vehicles/:id` | `companyId` is still parsed, then refused: a different value throws `immutableFieldError("companyId")` → **422** with `context.reason = immutable_field`. The same value is a no-op, exactly like `vin`. `data.companyId` is never set, so no update path can move a vehicle. |
| Sales import | Matching an existing Vehicle (by per-company `externalId`, else by global VIN) reuses that row and never writes its company. An ELITE vehicle matched from an import that resolves the default company stays ELITE. |
| Frontend | Add Vehicle requires the company; every later surface shows it read-only. The rate-only edit dialog sends `{ dailyRate, monthlyRate }` and never `companyId`. |

The field is deliberately kept in `UpdateVehicleSchema` rather than dropped: Zod
strips unknown keys, so removing it would answer an old client's transfer attempt
with a misleading `200` and a silently unchanged company. Explicit rejection
matches the existing `vin` / master-data `code` immutability convention.

Because the company can never move, `externalId` lookups during update are scoped
to the vehicle's permanent company and the per-company `@@unique([companyId,
externalId])` constraint needs no re-check against a target company.

## Frontend behaviour (phase 3, done)

- `modules/operating-companies` owns the read-only API, Zustand store and hook for
  active companies. UI components do not fetch directly.
- Add Vehicle uses Shared Select + FormBuilder and requires `companyId`; it never
  defaults silently to UNIQUE.
- Fleet cards/details show a small accent marker and the toolbar filters by
  authoritative company id. Clear Filters resets company to All Companies.
- The current Edit Vehicle action is intentionally a default-rate dialog. It shows
  the company read-only, and no Diamond surface edits it — the company is
  write-once in the Backend, so there is nothing to expose.
- Contracts show `Contract.company` in rows, drawer and signed-document context.
  Their company filter participates in the existing keyed query, latest-wins gate,
  focus/visibility refresh and 30-second visible-tab polling.
- For a pre-multi-company staff snapshot that lacks `header.company`, the reader
  projects the missing block from historical `Contract.company` plus the backend
  company lookup. It never uses the Vehicle and never rewrites the frozen JSON.
- Car-Out and Car-In show `Contract.company` in their existing contextual headers;
  their custody workflows are unchanged.
- Public Rental renders `office.company.displayName`; customers cannot select it.
- Shared `CompanyIdentity` consumes `displayName` and backend `accentColor` as a
  compact identity marker separate from lifecycle status chips.

Phase 3 report (what shipped, the verification round and the open items):
[multi-company-phase3-report.md](./multi-company-phase3-report.md).

## Frontend verification suite

`APP/frontend/e2e/multi-company.visual.spec.ts` covers Fleet, Contracts and the
signed A4 in AR/EN at 390px. It signs in once (the auth route allows five
attempts a minute) and skips pre-snapshot contracts that have no A4.

## Company marker layout rule

`CompanyIdentity` is `inline-flex` by default. A surface that needs a different
arrangement gives the **container** the layout (the contracts table cell stacks
number and marker with `.numberCell`); it must not re-declare `display` on the
shared component from its own CSS module. Both rules are single-class, so the
winner depended on which CSS chunk loaded last, and the marker jumped onto the
contract-number line until a full reload put the order back.

## Official Contract visual rule

The approved black A4 header remains the visual source of truth. Its logo,
dimensions, contact block, typography hierarchy and legal body are unchanged.
Only `header.company.legalNameAr` and `header.company.legalNameEn` vary:

- UNIQUE: `شركة دايموند يونيك لتأجير السيارات ذ.م.م ش.ش.و` /
  `DIAMOND UNIQUE CAR RENTALS CO. LLC S.O.C`
- ELITE: `شركة دايموند إيليت لتأجير السيارات ذ.م.م ش.ش.و` /
  `DIAMOND ELITE CAR RENTALS CO. LLC S.O.C`

No new ELITE logo was invented. The existing logo remains because the repository
contains no authoritative company-specific replacement. Its existing alt text is
a pre-existing branding mismatch and was not used to redesign the contract.

## Current state

The foundation migrations are applied. Fleet, Contracts, the official A4, public
rental and custody show company. Pre-existing failures in `integration-catalog`,
some contract lifecycle cases, official-contract field locks and public-rental
payment-provider cases are unrelated and were not repaired here.

## Phase A — TARS UI, Vehicle pickers, Maintenance, GPS (done)

Phase A changed **no database**: no Prisma edit, no migration, no new `companyId`
column anywhere. Every surface below reads the company through a relation that
already exists.

### Derived, never duplicated

`Vehicle.companyId` is write-once, so a Vehicle relation is a permanently correct
answer to "which company". Two domains therefore **derive** their company instead
of storing one:

| Domain | Company source | What is *not* stored |
| ------ | -------------- | -------------------- |
| Maintenance | `MaintenanceOrder → Vehicle → Vehicle.company` | `MaintenanceOrder` has **no** `companyId` |
| GPS | `Vehicle.company` on the GPS read models | `VehicleGpsBinding` and `VehicleGpsLatestState` store **no** company |

A record gets its own persisted `companyId` only when it is frozen history that
must not be recomputed later — which is why `Contract.companyId` exists and
`MaintenanceOrder.companyId` deliberately does not.

### Maintenance

- The embedded Vehicle projection on the maintenance list and detail carries the
  compact company ref, so a card never needs a company lookup per order.
- `GET /maintenance?companyId=` filters through the Vehicle relation
  (`vehicle.companyId`) and composes with `status`, `search`,
  `maintenanceType`, `vehicleId`, sort and pagination.
- The frontend shows the marker on the card, in the detail dialog and in the
  completed-history row, and adds a Company filter (All Companies / UNIQUE /
  ELITE) built from the authoritative company store. Clear Filters returns it to
  All Companies.
- **The maintenance lifecycle is unchanged**: create, scheduled / in service,
  ready for pickup, complete, cancel, the optional cost rules, and the Vehicle
  `AVAILABLE` ↔ `SERVICE` transitions all behave exactly as before.
- A completed order's cost still writes one `MAINTENANCE_EXPENSE` ledger entry.
  That entry does **not** carry a company yet — see *Deferred* below.

### GPS

- `GpsVehicleSummary` and `GpsMapPoint` carry the company ref; the list row and
  the vehicle detail drawer show it.
- `GET /gps/vehicles?companyId=` filters `Vehicle.companyId` and composes with
  `search`, `status` and `trackingStatus`.
- **No company reaches a provider.** `GpsProvider` exposes only `name` and
  `configured`, so there is nothing for a company value to travel on. Company is
  Diamond business metadata, applied inside Diamond's own query layer.
- The map is **not** company-filtered, matching the existing behaviour of the
  search and tracking filters: they scope the fleet list, not the markers. Map
  markers stay free of company chrome; company identity lives in the row and the
  detail surface.
- Demo Simulation still never persists GPS, and an overlay point with no real
  vehicle behind it carries `company: null` rather than an invented company.

### Vehicle pickers

Both pickers already loaded `VehicleCardDto`, which carries `company`:

| Picker | Shows company | Filters by company |
| ------ | ------------- | ------------------ |
| Maintenance (Add Vehicle to Maintenance) | option row + selected summary | yes, through `GET /vehicles?companyId=` |
| Finance (Add / Correct Expense) | option row + selected summary | yes, through `GET /vehicles?companyId=` |

Both narrow through the existing server-side Vehicles query. Neither fetches a
full fleet to filter locally, and the vehicle name stays visually dominant over
the company marker.

### TARS

The Backend already routed and reported the company; the frontend type dropped
it. `ContractTarsStateDto.company` now reaches the UI and the section heading
reads `TARS Integration Status · UNIQUE` or `· ELITE`.

- **UNIQUE TARS and ELITE TARS are two separate integrations** — separate
  provider, configuration, credentials and API. A contract never crosses.
- **Routing reads `Contract.companyId`** only: never the Vehicle's current
  company, a frontend selection, a query parameter, a global default or a
  hardcoded code. This is what protects historical contracts from provider
  crossover.
- **The real TARS APIs still do not exist.** Both companies remain
  `configured = false` and fail closed with `TARS_NOT_CONFIGURED`. No endpoint,
  credential, token, request/response schema, fake provider or environment secret
  was added.
- The TARS UI remains display-only: no execute, retry, test-connection or
  configuration control was introduced alongside the company marker.
- A Demo Simulation TARS preset may fake integration state but never the company:
  the real `Contract.company` is merged back over the preset.

### Deferred on purpose

| Item | Phase |
| ---- | ----- |
| `FinancialLedgerEntry.companyId` (incl. `MAINTENANCE_EXPENSE`) | C |
| `ManualExpense.companyId` | C |
| Road liabilities, imports, dashboard company scope | B |
| Invoices, daily statements, company-scoped RBAC | later |

The Maintenance → Finance boundary is the one to keep straight: **Maintenance
derives its company from the Vehicle; the future ledger entry will persist its
own `companyId` at write time**, because a recognized financial movement is
history and must never be re-derived from a Vehicle later.

## Phase B — road liabilities / Salik, single Vehicle creation source, dashboard rows (done)

Phase B changed **no database**: no Prisma edit, no migration, no new `companyId`
column, and nothing in Finance.

### Fleet → Add Vehicle is the only Vehicle creation source

`POST /vehicles`, invoked from Fleet → Add Vehicle, is now the **only** way a
Vehicle comes into existence. It is the one place staff choose the operating
company, and that choice is permanent, so every other creation path was a way to
get a vehicle into the wrong fleet silently.

| Path | Before | Now |
| ---- | ------ | --- |
| Sales import | `getOrCreateVehicle` created a Vehicle under the default company | **Match-only.** No match ⇒ row `INVALID`, reason `vehicle_not_found`, suggested action *Add the vehicle from the Vehicles page, then re-run this import*. `executeRow` writes no Vehicle. |
| Purchase experiences | An inline `vehicle` block created one under the default company | `vehicleId` must reference an existing active Vehicle; an inline block is refused with 422. |
| `resolveDefaultOperatingCompanyId` | Explicit UNIQUE fallback for those two | **Deleted** — no caller is left, and keeping it would leave the door open. |

Consequences that are deliberate, not oversights:

- **Imports get no Company selector.** Imports do not own Vehicle creation, so
  they never assign, change or default a company. A matched Vehicle keeps its own
  company; an ELITE vehicle matched from a sales file stays ELITE.
- **An ambiguous `externalId` matches nothing.** `externalId` is unique per
  company and the sales file carries no company column, so a hit is accepted only
  when exactly one vehicle across all companies holds that id — the same
  unambiguous rule road-liability matching already applies. Diamond does not pick
  a company to force a match. `vin` and `plateNumber` stay globally unique.
- A missing Vehicle is an operator task: create it in Fleet under UNIQUE or
  ELITE, then re-run the import row, which now matches.

### Road liabilities and Salik

A `RoadLiability` has **no company column**. Company is derived on read, by one
precedence that lives only in `resolveRoadLiabilityCompany`:

1. `attributedContractId` set ⇒ `attributedContract.company` — **always wins**,
   because a Contract is frozen history.
2. No Contract, `vehicleId` set ⇒ `vehicle.company` — safe only because
   `Vehicle.companyId` is write-once.
3. Neither ⇒ `null`. Unmatched means unmatched: no guess, no UNIQUE fallback, and
   no `UNMATCHED` company row.

Salik is identical. Company never comes from the Salik/RTA provider, the source
account, the endpoint or an external reference — it is a Diamond business property.

`GET /road-liabilities?companyId=` is contract-first to match:
`attributedContract.companyId = X` OR (`attributedContractId IS NULL` AND
`vehicle.companyId = X`). **All Companies includes unmatched rows** — hiding them
would hide exactly the ones that need attention. `RoadLiabilityCustomerCharge` and
`ContractPostCloseReceivable` gained no `companyId`; both reach it through their
Contract.

The list row, mobile card and detail drawer render `CompanyIdentity`; an unmatched
liability shows the neutral `OperatingCompanies.unmatched` label instead.

### Dashboard rows only

`todayDeliveries` and `recentContracts` carry the compact company ref from
`Contract.company`, selected in the same query, and render it as row metadata. The
dashboard had **no company scope** in Phase B. Phase C2 added `?companyId=`
and the header selector; see [Phase C2](#phase-c2--finance-page-and-dashboard-scope-done).

## Phase C1 — Finance database + backend (done)

Migration `20260921090000_finance_company_classification`. Two **nullable**
columns, a relation-only backfill, and no frontend change.

### GENERAL is a classification, not a company

`OperatingCompany` still holds exactly two rows. A financial record with no
authoritative company-bearing source behind it is **GENERAL**, which is stored and
returned as `null`:

| Record | Company |
| ------ | ------- |
| Manual Expense with a Vehicle | that Vehicle's company (UNIQUE or ELITE) |
| Manual Expense with no Vehicle (office rent, marketing, a government fee) | `null` — GENERAL |
| Ledger entry | whatever its source resolved to, including `null` |

The DTO returns `company: null`. It never returns a synthetic
`{ code: "GENERAL" }`, and the frontend never infers a company from the Vehicle —
the Backend owns the resolved classification. Phase C2 renders `null` as
*عام / GENERAL*.

### Manual Expense has no company selector

This is the rule most likely to be "helpfully" undone later, so it is explicit:
**Add / Correct Expense gains no Company field.** Staff already choose the
Vehicle, and the Vehicle already knows its company, so asking again would only
create a way for the two to disagree.

| Action | Result |
| ------ | ------ |
| Create with a Vehicle | `companyId = Vehicle.companyId` |
| Create without a Vehicle | `companyId = null` (GENERAL) |
| Correct to a different Vehicle | re-derived from the new Vehicle |
| Correct to remove the Vehicle | `null` (GENERAL) |
| Correct to add a Vehicle | derived from it |
| Correct anything else | unchanged |

`CreateManualExpenseSchema` and `CorrectManualExpenseSchema` carry no `companyId`,
so Zod strips a client-sent one. A request claiming *Vehicle = ELITE,
companyId = UNIQUE* stores ELITE. The Vehicle picker's own company filter is
search UX only: picking an ELITE vehicle while the filter says All Companies still
produces an ELITE expense.

### Ledger company is written, not derived

`FinancialLedgerEntry.companyId` is persisted **at write time**, because a
recognized movement is history. Every writer passes it through the single
`insertLedgerEntry`, which requires the field explicitly:

| Writer | Authoritative source |
| ------ | -------------------- |
| Stripe contract payment | `Contract.companyId` — frozen, never the Vehicle's current company |
| Maintenance cost | `MaintenanceOrder → Vehicle.companyId` |
| Manual expense create / correct / void | `ManualExpense.companyId`, `null` included |

A Manual Expense and its ledger row are written in the same transaction and always
agree. No writer, query or backfill step substitutes UNIQUE for a missing company.

### Company scope on the Finance APIs

| Query | Meaning |
| ----- | ------- |
| *(nothing)* | ALL — UNIQUE + ELITE + GENERAL |
| `?companyId=<id>` | that operating company only |
| `?companyScope=GENERAL` | `companyId IS NULL` only |
| both together | 422 `FINANCE_COMPANY_SCOPE_CONFLICT` |

ALL adds **no** predicate. Written as `companyId IS NOT NULL` it would silently
hide every GENERAL row. Ledger reads, summary, analytics and open receivables all
accept the scope; ledger aggregates filter the persisted column directly, so a
company-scoped total needs no join.

Receivables keep **no** company column: they derive through `Contract.company`,
which every Contract has. GENERAL therefore returns no contract receivables, and
no "general receivable" concept was invented to fill that space.

## Phase C2 — Finance page and Dashboard scope (done)

No new Prisma model and no new migration. The Finance page sends the C1 contract:
nothing = ALL (UNIQUE + ELITE + GENERAL), `?companyId=` = that company,
`?companyScope=GENERAL` = null only. Filtering stays on the server. The same
scope is applied to summary, analytics, the ledger and open receivables, and it
composes with the existing period and ledger filters. `company: null` renders as
عام / GENERAL in neutral text. A real company uses `CompanyIdentity`. Add /
Correct Expense still has no Company field; the Vehicle picker remains search UX
and the returned DTO is what the list shows.

The dashboard selector is All Companies / the active operating companies. It
never offers GENERAL. `GET /dashboard/overview?companyId=` filters fleet KPIs by
`Vehicle.companyId`, contract KPIs, active rentals, today's deliveries and recent
contracts by `Contract.companyId`, weekly rental activity by the Contract on
Car-Out / Car-In, and weekly finance by `FinancialLedgerEntry.companyId`. Omitting
`companyId` is All Companies, and that finance total still includes GENERAL.
`companyScope=GENERAL` is 422 `DASHBOARD_COMPANY_SCOPE_UNSUPPORTED`. GPS online
follows `Vehicle.companyId` inside Diamond's own summary; the GPS page itself is
unchanged. Vehicle company stays write-once, Contract company stays frozen, and
TARS routing is untouched.

The C1 backfill is relation-only (Contract → Manual Expense → Maintenance →
Vehicle → null) and `npm run verify:finance-company` refuses a mismatch.
`finance-company` integration is 24 tests; `finance-company-scope` unit is 5.

## Later document work

- **Invoices / statements / accounting:** persist the company they were issued
  for. They must never infer it later from the Vehicle's current owner.
- Reuse the authoritative `displayName`, legal AR/EN names and `accentColor` rather
  than introducing document-specific UNIQUE/ELITE conditionals.

Contract numbering stays global: `DE-{year}-{sequence}` from the single
`ContractNumberSequence`. Company has no effect on it.
