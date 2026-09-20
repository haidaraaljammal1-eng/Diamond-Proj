# Vehicles Page — Backend

Diamond HTML Demo (`demo.html` → Fleet / Vehicles) drives the scope. This document covers the backend contract for the Vehicles page only.

## Operating company (UNIQUE / ELITE)

Every Vehicle belongs to exactly one operating company, and the backend is company-aware:

| Surface | Behaviour |
| ------- | --------- |
| `POST /vehicles` | `companyId` is **required**. It must reference an existing, ACTIVE `OperatingCompany`; an unknown or retired company is a 422 (`invalidParent` / `inactiveReference`). There is no default: staff choose the company when adding a vehicle. |
| `PUT /vehicles/:id` | `companyId` is **write-once** and can never be updated. A different value is rejected with **422** `immutable_field` (`context.field = companyId`); re-sending the vehicle's own company is a no-op. The update never writes the column, so no request, import or bulk path can move a vehicle between companies. |
| `VehiclePublic` / card / detail | Carry a compact `company` ref (`id`, `code`, `displayName`, `accentColor`), so a fleet list needs no per-row company lookup. Legal names are not here — they belong to the official contract. |
| `GET /vehicles?companyId=` | Server-side Prisma filter. One dimension only; there is no competing `companyCode` parameter. |
| `GET /operating-companies` | Reference list for company pickers and filters (see below). |

**No transfer workflow exists.** The company is chosen once at Add Vehicle: a
UNIQUE vehicle stays UNIQUE forever and an ELITE vehicle stays ELITE forever. The
field is still declared in `UpdateVehicleSchema` so an old client that sends it
gets the explicit 422 instead of having the key silently stripped by Zod and
receiving a misleading 200. `Contract.companyId` is unaffected: it remains the
historical company stamped at contract creation.

Identifier uniqueness after the company change:

- `plateNumber` and `vin` stay **globally** unique — a plate or chassis belongs to one physical car.
- `externalId` is unique **per company** (`@@unique([companyId, externalId])`), because UNIQUE and ELITE integrate with separate external systems. Every lookup passes `companyId_externalId`; nulls stay distinct, so vehicles without an external id are unaffected. On update the check is scoped to the vehicle's permanent company — there is no target company to re-check against.
- Road-liability vehicle matching by `externalVehicleRef` now accepts a hit only when exactly one vehicle across all companies carries that id. An ambiguous id matches nothing rather than attributing a charge to the wrong car.

The fleet where-builder was also fixed while adding the filter: `vehicleType` and `search` are both OR groups and used to be spread into the same object, so a search silently dropped the type filter. They now compose through `AND`.

## Demo requirements (summary)

| Demo concept                                           | Backend                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| Vehicle card (name, year, plate, color, status, rates) | `VehicleCard` projection on `GET /vehicles`                 |
| Filters: all / available / rented / service            | `status` query param                                        |
| Primary card image                                     | `primaryImage` (first `isPrimary`, else lowest `sortOrder`) |
| Detail modal specs + gallery                           | `GET /vehicles/:id` → `VehicleDetail`                       |
| Current renter + rental timer                          | `currentRental` from Contracts (`PAID` / `ACTIVE` / `RETOUT`) |
| Set Rental Price / Generate Link                       | **Contracts** — `POST /contracts/offers` + rental-link      |
| GPS button                                             | **Out of scope** — GPS domain                               |
| Service workshop details                               | **Out of scope** — Maintenance domain                       |

## Models

Extended existing `Vehicle` domain in `prisma/schema/operational.prisma` (no duplicate Cars domain):

- `vehicleName` — direct free-text fleet name (Diamond Add Vehicle)
- `modelId` — optional legacy/import link to `VehicleModel` (nullable)
- `plateNumber` — normalized registration plate (unique when set)
- `dailyRate`, `monthlyRate` — whole AED default rates (not rental-offer amounts)
- `operationalStatus` — `AVAILABLE | RENTED | SERVICE` (distinct from `isActive`)
- `VehiclePhoto` — links `Vehicle` → shared `Attachment` with `sortOrder` / `isPrimary`

### Vehicle identity

- `vehicleName` supports direct free-text vehicle names (e.g. `Toyota Land Cruiser`).
- `modelId` is **optional** — legacy/import compatibility only.
- A new Diamond Vehicle does **not** require VehicleModel creation or lookup.
- The backend never auto-creates `VehicleModel` from a free-text name.

### displayName

List/detail card projections include a computed `displayName`:

1. `vehicleName` when set
2. else legacy `model.name` (+ `modelYear` when present)
3. else `plateNumber`, else `"Vehicle"`

The frontend must not compose the card title from multiple sources.

### Fleet type label (filter options)

`fleetVehicleTypeLabel(vehicleName, modelName)`:

1. trimmed `vehicleName` when set
2. else trimmed legacy `model.name`

Used by `GET /vehicles/filter-options` and `vehicleType` list filtering.

## Status semantics

| API value   | DB enum     | Demo label (frontend i18n) |
| ----------- | ----------- | -------------------------- |
| `available` | `AVAILABLE` | متاحة                      |
| `rented`    | `RENTED`    | مؤجرة                      |
| `service`   | `SERVICE`   | صيانة                      |

`isActive` remains master-data lifecycle (deactivate/reactivate). It is **not** the fleet operational status.

Source of truth for operational status: `Vehicle.operationalStatus`, synchronized by Contracts. Car-Out sets `RENTED`; Car-In releases custody to `AVAILABLE` when appropriate. Close does not change Vehicle status. See `DOCU/05-pages/contracts-backend.md`.

`GET /vehicles` cards and `GET /vehicles/:id` detail derive `reservation` from a PAID Contract without completed Car-Out: `{ isReserved, contractId, contractNumber, status: "PAID", awaitingHandover }`. They also expose `isBookable`. A vehicle is bookable only when active, operationally `AVAILABLE`, and without a blocking current rental. PAID therefore remains `AVAILABLE` but is reserved and non-bookable; Car-Out later changes the Contract to ACTIVE and Vehicle to RENTED. No reservation value is persisted on Vehicle.

## Rented vehicle mutation guard

`operationalStatus = RENTED` blocks fleet mutations that would change pricing or remove the vehicle from the active fleet:

- `PUT /vehicles/:id` (including default-rate updates) → `409 CONFLICT`
- `POST /vehicles/:id/deactivate` → `409 CONFLICT`

Rejected when `operationalStatus = RENTED` **or** a blocking Contract exists (`PAID | ACTIVE | RETOUT`) via shared `vehicleHasBlockingContract`. Do not bypass Contract-owned rental state. REVIEW after Car-In is not blocking.

## Endpoints

All under `/vehicles` (admin route access), permission-gated:

| Method | Path                                   | Permission        | Purpose                                    |
| ------ | -------------------------------------- | ----------------- | ------------------------------------------ |
| GET    | `/vehicles`                            | `vehicles.read`   | Paginated card list                        |
| GET    | `/vehicles/filter-options`             | `vehicles.read`   | Distinct active-fleet vehicle type options |
| GET    | `/vehicles/:id`                        | `vehicles.read`   | Detail + full gallery                      |
| POST   | `/vehicles`                            | `vehicles.manage` | Create vehicle                             |
| PUT    | `/vehicles/:id`                        | `vehicles.manage` | Partial update (incl. default rates)       |
| POST   | `/vehicles/:id/deactivate`             | `vehicles.manage` | Fleet delete → soft deactivate             |
| POST   | `/vehicles/:id/reactivate`             | `vehicles.manage` | Restore deactivated vehicle                |
| POST   | `/vehicles/:id/photos`                 | `vehicles.manage` | Upload gallery image                       |
| DELETE | `/vehicles/:id/photos/:photoId`        | `vehicles.manage` | Remove gallery image                       |
| GET    | `/vehicles/:id/photos/:photoId/stream` | `vehicles.read`   | Inline photo stream                        |

### Create semantics

`POST /vehicles` accepts direct `vehicleName` and fleet fields. Example:

```json
{
  "vehicleName": "Toyota Land Cruiser",
  "modelYear": 2025,
  "plateNumber": "Dubai A 47291",
  "color": "White",
  "dailyRate": 750,
  "monthlyRate": 14500
}
```

- `modelId` is **optional** — the property may be omitted entirely. Legacy create with `modelId` only remains supported.
- At least one of `vehicleName` or a positive `modelId` is required. Requests with neither are rejected (422).
- `operationalStatus` is **not** accepted on create — the service always sets `AVAILABLE`.
- `isActive` defaults to `true` (master-data lifecycle; distinct from operational status).
- No VehicleModel is auto-created.

Optional create fields: `vin`, `modelYear`, `color`, `plateNumber`, `dailyRate`, `monthlyRate`, `externalId`.

**Optional photo (frontend only in current scope):** binary is **not** sent on `POST /vehicles`. After create, the client may upload one image via `POST /vehicles/:id/photos`. The first photo is marked `isPrimary` and surfaces as `primaryImage` on list/detail. No seed or bulk photo backfill for existing fleet rows.

**Development fleet baseline:** `npm run db:cleanup:dev-fleet` (development only — refuses production/non-local DB) removes non-`DEMO-FLEET-*` vehicles and ensures exactly `DEMO-FLEET-01..20` with zero photos, then re-runs `db:seed:demo` idempotently.

### Default pricing

- `dailyRate` / `monthlyRate` are **Vehicle default rates** (Demo card footer).
- They are not rental-offer amounts, contract prices, or current rental prices.

### Price editing

`PUT /vehicles/:id` supports partial updates. Example:

```json
{ "dailyRate": 850, "monthlyRate": 16000 }
```

Requires `vehicles.manage`. Rejected when `operationalStatus = RENTED`. Updating rates does not change `vehicleName`, `plateNumber`, `operationalStatus`, `isActive`, or photos.

### Deactivate / Delete

Fleet **Delete** maps to safe deactivate:

- `POST /vehicles/:id/deactivate` → `isActive = false`
- Record remains in the database (no hard delete in Fleet flow)
- `operationalStatus` is **not** changed
- Rejected when `operationalStatus = RENTED`

### Filter options

`GET /vehicles/filter-options` returns distinct active-fleet types:

```json
{
  "data": [{ "value": "Toyota Land Cruiser", "label": "Toyota Land Cruiser" }]
}
```

- Active fleet only (`isActive = true`)
- Direct `vehicleName` + legacy `model.name` fallback
- Case-insensitive deduplication; display label preserved from first seen row
- Sorted alphabetically

## List query

```
GET /vehicles?status=all|available|rented|service&page=1&pageSize=20&active=true
```

| Param              | Purpose                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search`           | Matches `vehicleName`, `plateNumber`, `vin`, `externalId`, legacy `model.name`                                                                                          |
| `vehicleType`      | Exact fleet type match on `vehicleName` or legacy `model.name` when `vehicleName` is null                                                                               |
| `modelId`          | Legacy/model-linked filter (retained for compatibility)                                                                                                                 |
| `active`           | `true` → active fleet only; omit for active + inactive (Fleet UI always sends `true`)                                                                                   |
| `sort`             | Whitelist: `vin`, `plateNumber`, `modelYear`, `dailyRate`, `monthlyRate`, `operationalStatus`, `createdAt`, `isActive` (e.g. `dailyRate:asc`, default `createdAt:desc`) |
| `page`, `pageSize` | Pagination                                                                                                                                                              |

### Sort behavior

Implemented in `vehicles-sort.ts` → `buildVehicleListOrderBy`:

- Rate/year sorts use explicit Prisma `nulls` placement (`first` on ASC, `last` on DESC) so `dailyRate = 0` sorts before positive values on ASC and after them on DESC.
- Deterministic tie-break: `createdAt:desc`, then `id:desc`.
- Sorting applies to the full filtered dataset before pagination.

## Response projections

**List (`VehicleCard`)** — card-ready, no N+1:

- Scalar vehicle fields + `displayName`, nested `model` (nullable), `primaryImage`, `currentRental`, derived `reservation`, and `isBookable`
- No full `gallery` on list

**Detail (`VehicleDetail`)** — list fields + `gallery[]`

Weekly price in Demo (`daily × 7 × 0.88`) stays derived on the client; no `weeklyRate` column.

## Current rental (Contracts)

`currentRental` is resolved from Contracts — never denormalized onto `Vehicle`. List and detail batch-load with `loadCurrentRentalsByVehicleIds` (one query for the page, no N+1).

It is the current **possession/reservation context** (`PAID | ACTIVE | RETOUT`), not every financially-open Contract:

```json
{ "contractId": "…", "customerName": "…", "endAt": "…", "status": "paid"|"active"|"retout" }
```

At PAID the vehicle stays `AVAILABLE` (Car-Out pending) but `currentRental.status` is `"paid"` and fleet mutations stay 409 via the Contract guard. REVIEW after Car-In is `null` (vehicle may be rented again). Otherwise `null` (no blocking contract, including CLOSED). Customer name prefers the Contract snapshot. Seed fleet rows still have no fake renter data.

## Photos

Reuse shared `Attachment` storage. `VehiclePhoto` is the domain join. Primary selection: explicit `isPrimary`, else first ordered photo. Empty gallery → `primaryImage: null` (frontend fallback).

## Development seed

File: `APP/backend/prisma/seed/demo-fleet.ts`

- ~12 realistic Development/Test vehicles with direct `vehicleName` (no VehicleModel creation)
- Idempotent via stable `externalId` upserts
- Distribution: 5 AVAILABLE, 4 RENTED, 2 SERVICE, 1 inactive (`isActive = false`)
- Varied plates, years, colors, and default rates for sort/filter testing
- `currentRental` remains null on seed rows (no fake contract seed on the Development Fleet)

## Permissions

| Action                                             | Permission        |
| -------------------------------------------------- | ----------------- |
| List / detail / filter options / photo stream      | `vehicles.read`   |
| Create / update / deactivate / reactivate / photos | `vehicles.manage` |

Access is permission-based only — no role-name branching.

## Out of scope (explicit)

- GPS tracking / remote disable
- Maintenance orders / workshop ETA
- Demo `CARS` mock data in production services or frontend constants
- White Contract PDF / payment gateways (Contracts Frontend / later domains)

Rental offers, links, and lifecycle live in Contracts (`DOCU/05-pages/contracts-backend.md`).
