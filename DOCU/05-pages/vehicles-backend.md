# Vehicles Page — Backend

Diamond HTML Demo (`demo.html` → Fleet / Vehicles) drives the scope. This document covers the backend contract for the Vehicles page only.

## Demo requirements (summary)

| Demo concept | Backend |
|---|---|
| Vehicle card (name, year, plate, color, status, rates) | `VehicleCard` projection on `GET /vehicles` |
| Filters: all / available / rented / service | `status` query param |
| Primary card image | `primaryImage` (first `isPrimary`, else lowest `sortOrder`) |
| Detail modal specs + gallery | `GET /vehicles/:id` → `VehicleDetail` |
| Current renter + rental timer | `currentRental` (blocked — see below) |
| Set Rental Price / Generate Link | **Out of scope** — Contracts/Rental domain |
| GPS button | **Out of scope** — GPS domain |
| Service workshop details | **Out of scope** — Maintenance domain |

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

| API value | DB enum | Demo label (frontend i18n) |
|---|---|---|
| `available` | `AVAILABLE` | متاحة |
| `rented` | `RENTED` | مؤجرة |
| `service` | `SERVICE` | صيانة |

`isActive` remains master-data lifecycle (deactivate/reactivate). It is **not** the fleet operational status.

Source of truth for operational status today: `Vehicle.operationalStatus`. When the Contracts domain exists, rented status should be kept consistent with active contracts (future sync — not implemented here).

## Rented vehicle mutation guard

`operationalStatus = RENTED` blocks fleet mutations that would change pricing or remove the vehicle from the active fleet:

- `PUT /vehicles/:id` (including default-rate updates) → `409 CONFLICT`
- `POST /vehicles/:id/deactivate` → `409 CONFLICT`

Based on `operationalStatus` only — no Contracts lookup, no fake rental data.

## Endpoints

All under `/vehicles` (admin route access), permission-gated:

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/vehicles` | `vehicles.read` | Paginated card list |
| GET | `/vehicles/filter-options` | `vehicles.read` | Distinct active-fleet vehicle type options |
| GET | `/vehicles/:id` | `vehicles.read` | Detail + full gallery |
| POST | `/vehicles` | `vehicles.manage` | Create vehicle |
| PUT | `/vehicles/:id` | `vehicles.manage` | Partial update (incl. default rates) |
| POST | `/vehicles/:id/deactivate` | `vehicles.manage` | Fleet delete → soft deactivate |
| POST | `/vehicles/:id/reactivate` | `vehicles.manage` | Restore deactivated vehicle |
| POST | `/vehicles/:id/photos` | `vehicles.manage` | Upload gallery image |
| DELETE | `/vehicles/:id/photos/:photoId` | `vehicles.manage` | Remove gallery image |
| GET | `/vehicles/:id/photos/:photoId/stream` | `vehicles.read` | Inline photo stream |

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
  "data": [
    { "value": "Toyota Land Cruiser", "label": "Toyota Land Cruiser" }
  ]
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

| Param | Purpose |
|---|---|
| `search` | Matches `vehicleName`, `plateNumber`, `vin`, `externalId`, legacy `model.name` |
| `vehicleType` | Exact fleet type match on `vehicleName` or legacy `model.name` when `vehicleName` is null |
| `modelId` | Legacy/model-linked filter (retained for compatibility) |
| `active` | `true` → active fleet only; omit for active + inactive (Fleet UI always sends `true`) |
| `sort` | Whitelist: `vin`, `plateNumber`, `modelYear`, `dailyRate`, `monthlyRate`, `operationalStatus`, `createdAt`, `isActive` (e.g. `dailyRate:asc`, default `createdAt:desc`) |
| `page`, `pageSize` | Pagination |

### Sort behavior

Implemented in `vehicles-sort.ts` → `buildVehicleListOrderBy`:

- Rate/year sorts use explicit Prisma `nulls` placement (`first` on ASC, `last` on DESC) so `dailyRate = 0` sorts before positive values on ASC and after them on DESC.
- Deterministic tie-break: `createdAt:desc`, then `id:desc`.
- Sorting applies to the full filtered dataset before pagination.

## Response projections

**List (`VehicleCard`)** — card-ready, no N+1:

- Scalar vehicle fields + `displayName`, nested `model` (nullable), `primaryImage`, `currentRental`
- No full `gallery` on list

**Detail (`VehicleDetail`)** — list fields + `gallery[]`

Weekly price in Demo (`daily × 7 × 0.88`) stays derived on the client; no `weeklyRate` column.

## Current rental (dependency)

`currentRental` is always `null` until a **Contracts** domain provides authoritative active/retout/review rentals. No denormalized `currentCustomerName` or `rentalEndAt` on `Vehicle`. No fake customer, contract, or countdown in seed data.

## Photos

Reuse shared `Attachment` storage. `VehiclePhoto` is the domain join. Primary selection: explicit `isPrimary`, else first ordered photo. Empty gallery → `primaryImage: null` (frontend fallback).

## Development seed

File: `APP/backend/prisma/seed/demo-fleet.ts`

- ~12 realistic Development/Test vehicles with direct `vehicleName` (no VehicleModel creation)
- Idempotent via stable `externalId` upserts
- Distribution: 5 AVAILABLE, 4 RENTED, 2 SERVICE, 1 inactive (`isActive = false`)
- Varied plates, years, colors, and default rates for sort/filter testing
- `currentRental` remains null on all seed rows

## Permissions

| Action | Permission |
|---|---|
| List / detail / filter options / photo stream | `vehicles.read` |
| Create / update / deactivate / reactivate / photos | `vehicles.manage` |

Access is permission-based only — no role-name branching.

## Out of scope (explicit)

- Contracts lifecycle, rental links, Set Rental Price backend
- GPS tracking / remote disable
- Maintenance orders / workshop ETA
- Demo `CARS` mock data in production services or frontend constants
