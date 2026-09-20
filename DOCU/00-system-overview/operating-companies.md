# Operating companies (UNIQUE / ELITE)

Diamond runs one fleet, one staff team and one workflow for two rental companies:
**UNIQUE** and **ELITE**. The company is a classification and routing dimension.
It never forks the Contract lifecycle, Car-Out/Car-In, payments, reservation or
maintenance, and it never changes contract numbering.

Status: **database + backend + frontend done.** Vehicles and Contracts expose
company identity and server-side filters, Add Vehicle requires an active company,
the public rental flow shows the Contract company, and the printed A4 reads the
legal names frozen in the authoritative official-contract view. TARS routing is
company-aware but both providers remain unconfigured.

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

- **`Vehicle.companyId` — required.** Every fleet vehicle, active or retired,
  belongs to exactly one company. Changing it re-assigns the vehicle from that
  moment on.
- **`Contract.companyId` — required, historical.** The company that owned the
  Vehicle when the Contract was created. It is frozen history, like
  `contractNumber` and `snapshot`: transferring a Vehicle to the other company
  must never re-brand a signed Contract, its official document or its accounting.
  Nothing in the database cascades a Vehicle company change into Contracts; the
  Backend will set the Contract's company from the Vehicle at creation time.
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
| Vehicle update | Optional `companyId` transfers the vehicle. Never rewrites Contract history. |
| Vehicle DTOs + fleet filter | `company` ref on every projection; `?companyId=` filters in Prisma. |
| Contract create | `companyId` is derived from the Vehicle server-side; a client value is ignored. |
| Contract DTOs + list filter | `company` ref on list and detail; `?companyId=` filters `Contract.companyId`. |
| Official contract | `header.company` (code, display, legal AR/EN, accent) from the Contract, frozen at SIGNED. Legacy snapshots fall back to the live company (UNIQUE) and are never rewritten. |
| Public rental | `office.company` exposed; the customer never selects a company. |
| TARS | `createTarsProvider(companyCode)` / `getTarsConfig(companyCode)`, routed from `Contract.companyId`; status DTO carries the routing company; both companies still unconfigured and fail closed. |
| Legacy creators | The sales import and purchase experiences have no company input, so they resolve `resolveDefaultOperatingCompanyId` (UNIQUE) explicitly in `src/modules/operating-companies/default-company.ts`. Delete that module once the importer carries a company column. |

Tests: `tests/integration/multi-company.test.ts` (14), `tests/integration/operating-companies.test.ts` (10),
`tests/unit/multi-company-routing.test.ts` (5). Fixtures resolve a real company through
`tests/helpers/operating-company.ts` instead of inventing ids.

## Frontend behaviour (phase 3, done)

- `modules/operating-companies` owns the read-only API, Zustand store and hook for
  active companies. UI components do not fetch directly.
- Add Vehicle uses Shared Select + FormBuilder and requires `companyId`; it never
  defaults silently to UNIQUE.
- Fleet cards/details show a small accent marker and the toolbar filters by
  authoritative company id. Clear Filters resets company to All Companies.
- The current Edit Vehicle action is intentionally a default-rate dialog. It shows
  the company read-only; company transfer is not exposed through that rate-only UX.
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

## Later document work

- **Invoices / statements / accounting:** persist the company they were issued
  for. They must never infer it later from the Vehicle's current owner.
- Reuse the authoritative `displayName`, legal AR/EN names and `accentColor` rather
  than introducing document-specific UNIQUE/ELITE conditionals.

Contract numbering stays global: `DE-{year}-{sequence}` from the single
`ContractNumberSequence`. Company has no effect on it.
