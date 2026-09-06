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

Every filter is server-side; the toolbar never filters an already-fetched page.

| Control | Query param | Notes |
|---|---|---|
| Status chips | `status` | `all` is omitted from the request |
| Search box | `search` | Backend matches plate, VIN, external id, model name; 350 ms debounce, trimmed |
| Model picker | `modelId` | Options from `GET /lookups/vehicle-models` (any-of `reference_data.lookup` / `vehicle_models.read`); a failed lookup leaves the picker empty and the page working |
| Sort | `sort` | `newest` (default, omitted), `priceAsc`, `priceDesc`, `yearDesc`, `plate` — mapped to the Backend `field:direction` whitelist |
| Show retired | `active` | Off sends `active=true`; on omits the param so both scopes return |

Changing any filter resets to page 1. The toolbar shows the result count, an
active-filter badge and a Clear action; the empty state offers the same Clear
when filters are what emptied the list.

Query building and the active-filter count are pure functions in
`utils/vehicle-filters.ts` (unit-tested) — the store and the API client both go
through them.

## VehicleCard

Composes shared `Card` (`padding="none"`, `interactive`) with Demo `.car` internal layout. Images via `VehicleImage` (authenticated stream). Status via shared `Chip` through `VehicleStatus`.

Demo-parity details worth keeping:

- The photo ground is the Demo Pearl Ivory stage (champagne, not a dark panel).
- The status chip uses `Chip solid` — an opaque tinted surface, because a
  translucent chip over a photo is unreadable.
- The rate line is the Demo boxed strip: bordered champagne box, gradient daily
  rate, monthly figure at the end.
- Action glyphs come from Iconify through the shared `Icon` — never emoji in a
  translation string.

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
