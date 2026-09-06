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

- `plateNumber` — normalized registration plate (unique when set)
- `dailyRate`, `monthlyRate` — whole AED default rates (not rental-offer amounts)
- `operationalStatus` — `AVAILABLE | RENTED | SERVICE` (distinct from `isActive`)
- `VehiclePhoto` — links `Vehicle` → shared `Attachment` with `sortOrder` / `isPrimary`

## Status semantics

| API value | DB enum | Demo label (frontend i18n) |
|---|---|---|
| `available` | `AVAILABLE` | متاحة |
| `rented` | `RENTED` | مؤجرة |
| `service` | `SERVICE` | صيانة |

`isActive` remains master-data lifecycle (deactivate/reactivate). It is **not** the fleet operational status.

Source of truth for operational status today: `Vehicle.operationalStatus`. When the Contracts domain exists, rented status should be kept consistent with active contracts (future sync — not implemented here).

## Endpoints

All under `/vehicles` (admin route access), permission-gated:

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/vehicles` | `vehicles.read` | Paginated card list |
| GET | `/vehicles/:id` | `vehicles.read` | Detail + full gallery |
| POST | `/vehicles/:id/photos` | `vehicles.manage` | Upload gallery image |
| DELETE | `/vehicles/:id/photos/:photoId` | `vehicles.manage` | Remove gallery image |
| GET | `/vehicles/:id/photos/:photoId/stream` | `vehicles.read` | Inline photo stream |

Existing CRUD/deactivate routes unchanged; write schemas accept the new fleet fields.

## List query

```
GET /vehicles?status=all|available|rented|service&page=1&pageSize=20
```

Existing filters (`search`, `modelId`, `active`, `sort`) remain. No new search API was added for this page.

## Response projections

**List (`VehicleCard`)** — card-ready, no N+1:

- Scalar vehicle fields + `displayName`, nested `model`, `primaryImage`, `currentRental`
- No full `gallery` on list

**Detail (`VehicleDetail`)** — list fields + `gallery[]`

**Pricing distinction**

- `dailyRate` / `monthlyRate` = vehicle **default** rates (Demo card footer)
- Set Rental Price manual amount = **rental offer** (Contracts domain — not stored on Vehicle)

Weekly price in Demo (`daily × 7 × 0.88`) stays derived on the client; no `weeklyRate` column.

## Current rental (dependency)

`currentRental` is always `null` until a **Contracts** domain provides authoritative active/retout/review rentals. No denormalized `currentCustomerName` or `rentalEndAt` on `Vehicle`.

Expected future shape when Contracts exists:

```json
{
  "contractId": "DE-2026-0817-114",
  "customerName": "…",
  "endAt": "2026-09-17T12:00:00.000Z",
  "status": "active"
}
```

## Photos

Reuse shared `Attachment` storage. `VehiclePhoto` is the domain join. Primary selection: explicit `isPrimary`, else first ordered photo. Empty gallery → `primaryImage: null` (frontend fallback).

## Migration

`20260906143000_vehicle_fleet_page` — adds fleet fields, enum, and `vehicle_photos` table.

## Out of scope (explicit)

- Contracts lifecycle, rental links, Set Rental Price backend
- GPS tracking / remote disable
- Maintenance orders / workshop ETA
- Demo `CARS` mock seed data in production services
