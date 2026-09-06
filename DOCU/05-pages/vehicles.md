# Vehicles Page — Frontend

Diamond HTML Demo (`demo.html` → Fleet / Vehicles) is the visual and behavioral source of truth. Backend contract: [vehicles-backend.md](./vehicles-backend.md).

## Route

- `/ar/vehicles`
- `/en/vehicles`

Navigation rail entry `cars` links to `/vehicles` and requires `vehicles.read`.

## Architecture

```
VehiclesPage
  → VehiclesScreen
    → useVehicles() / useVehicle()
      → vehicles.store.ts
        → vehicles.api.ts
          → Central API Client
            → Fastify Backend
```

UI state (detail modal open, price dialog, boundary notices) stays in screen/components — not in the store.

## Module

`APP/frontend/src/modules/vehicles/`

| Area | Files |
|---|---|
| API | `api/vehicles.api.ts`, `api/vehicles.api.types.ts` |
| Store | `stores/vehicles.store.ts` |
| Hooks | `hooks/use-vehicles.ts`, `hooks/use-vehicle.ts` |
| Screen | `components/vehicles-screen/` |
| Grid / card | `components/vehicles-grid/`, `components/vehicle-card/` |
| Status / timer | `components/vehicle-status/`, `components/vehicle-rental-timer/` |
| Detail | `components/vehicle-detail/` (flush `Dialog`) |
| Filters | `components/vehicle-filters/` (Demo `.fchip`) |
| Set price UI | `forms/rental-price/set-rental-price-dialog.tsx` |

## Filters

Server-side `status` query: `all | available | rented | service`. Demo chip styling only — no extra filters.

## VehicleCard

Composes shared `Card` (`padding="none"`, `interactive`) with Demo `.car` internal layout. Images via `VehicleImage` (authenticated stream). Status via shared `Chip` through `VehicleStatus`.

## Status mapping

| API | i18n |
|---|---|
| `available` | متاحة / Available |
| `rented` | مؤجرة / Rented |
| `service` | صيانة / Service |

## Images

- List: `primaryImage` only
- Detail: `gallery[]` from `GET /vehicles/:id`
- `primaryImage === null` → gradient placeholder (no Demo mock URLs)

## Detail modal

Card click opens flush `Dialog` + `VehicleDetail`. `GET /vehicles/:id` loads on open. Inner buttons use `stopPropagation` on the card.

## currentRental = null

Expected until Contracts domain exists. UI shows `rented` status but **never** fakes `customerName`, countdown, or contract rows. Timer/renter render only when `currentRental` has real `customerName` and `endAt`.

## Timer

`VehicleRentalTimer` derives remaining time from `endAt` locally (30s refresh). Expired styling matches Demo; status is **not** changed client-side.

## Set Rental Price boundary

Demo buttons open `SetRentalPriceDialog` (FormBuilder + period chips). Submit is disabled — Contracts/Rental backend not built. No fake link success.

## GPS boundary

GPS buttons remain visible per Demo. Click shows a boundary notice; no map/tracking implementation.

## i18n

Namespace `Vehicles` in `messages/ar.json` and `messages/en.json`.

## Tests

- Unit: `src/modules/vehicles/**/*.test.ts`
- Visual: `e2e/vehicles.visual.spec.ts` (Arabic desktop)

## Permissions

- Page: `vehicles.read`
- Photo upload/delete (not exposed in Demo UI): `vehicles.manage`
