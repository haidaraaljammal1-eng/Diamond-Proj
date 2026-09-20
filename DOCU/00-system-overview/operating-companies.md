# Operating companies (UNIQUE / ELITE)

Diamond runs one fleet, one staff team and one workflow for two rental companies:
**UNIQUE** and **ELITE**. The company is a classification and routing dimension.
It never forks the Contract lifecycle, Car-Out/Car-In, payments, reservation or
maintenance, and it never changes contract numbering.

Status: **database + backend + frontend done, and rolled out to the first
operational modules.** Vehicles and Contracts expose company identity and
server-side filters, Add Vehicle requires an active company, the public rental
flow shows the Contract company, and the printed A4 reads the legal names frozen
in the authoritative official-contract view. Phase A added TARS company display,
both Vehicle pickers, Maintenance and GPS. TARS routing is company-aware but both
providers remain unconfigured.

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
| Legacy creators | The sales import and purchase experiences have no company input, so they resolve `resolveDefaultOperatingCompanyId` (UNIQUE) explicitly in `src/modules/operating-companies/default-company.ts`. Delete that module once the importer carries a company column. |

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

`APP/frontend/e2e/multi-company.visual.spec.ts` runs the whole company surface
against the live stack (backend :3001, frontend :3100): ELITE projections through
an intercepted DTO, Fleet marker + filter + Add Vehicle options, the Contracts
company column, the signed A4 under UNIQUE, and AR/EN at 390px.

Two environment rules keep it deterministic:

- It signs in **once** and reuses the stored session. `/auth/login` allows five
  attempts per minute per caller (`RATE_LIMIT_AUTH_MAX`), so a per-test login
  made the last tests 429 and surface as *Invalid credentials*.
- The A4 test walks the signed rows until one renders a document. Contracts
  created before the official-contract snapshot existed (for example
  `DE-2026-000017`, whose snapshot holds only
  `vehicle|customer|commercial|termsVersion|contractNumber`) have no A4 at all and
  correctly show *the signed copy is not available yet*. That is pre-existing data,
  unrelated to company identity, and is not repaired from the frontend.

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

Read this before touching anything company-related.

**Done:** the database foundation (migration `20260920012059_multi_company_foundation`),
the per-company `externalId` constraint (`20260920033000_vehicle_external_id_per_company`),
and the full backend above. Both migrations are applied to `diamond` and `haidara_test`.
`prisma validate`, `db:generate`, backend `typecheck` and `build` are clean, and the focused
company suites pass.

The frontend company lookup, Add Vehicle Select, Fleet and Contracts display/filter,
official A4 names, public rental identity and custody context are implemented and
verified in AR/EN on desktop and 390px mobile.

**Known pre-existing test failures, not caused by this work and not repaired here:**
`tests/unit/integration-catalog.test.ts` (CRM kind), `contracts.test.ts` "full lifecycle" and
"legacy stored deposit", `official-contract.test.ts` review field-lock cases
(`OFFICIAL_CONTRACT_FIELD_LOCKED`, committed at HEAD), and `public-rental-flow.test.ts`
payment-provider cases, which depend on local provider env flags.

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

## Later document work

- **Invoices / statements / accounting:** persist the company they were issued
  for. They must never infer it later from the Vehicle's current owner.
- Reuse the authoritative `displayName`, legal AR/EN names and `accentColor` rather
  than introducing document-specific UNIQUE/ELITE conditionals.

Contract numbering stays global: `DE-{year}-{sequence}` from the single
`ContractNumberSequence`. Company has no effect on it.
