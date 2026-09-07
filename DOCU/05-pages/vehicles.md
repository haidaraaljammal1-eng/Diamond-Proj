# Vehicles Page — Frontend

Diamond HTML Demo (`demo.html` → Fleet / Vehicles) is the behavioral source of truth. The **latest approved Fleet screenshot** is the visual reference for `VehicleCard`. Backend contract: [vehicles-backend.md](./vehicles-backend.md).

## Route / Permission

- `/ar/vehicles`
- `/en/vehicles`

Navigation rail entry `cars` → `/vehicles`. Page access: `vehicles.read`. Mutating actions: `vehicles.manage`.

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

UI state (detail modal, add/edit/delete dialogs, boundary notices) stays in screen/components — not in the store.

## Module

`APP/frontend/src/modules/vehicles/`

| Area                | Files                                                                             |
| ------------------- | --------------------------------------------------------------------------------- |
| API                 | `api/vehicles.api.ts`, `api/fleet-type-lookup.api.ts`                             |
| Store               | `stores/vehicles.store.ts`, `stores/fleet-type-lookup.store.ts`                   |
| Hooks               | `hooks/use-vehicles.ts`, `hooks/use-vehicle.ts`, `hooks/use-fleet-type-lookup.ts` |
| Screen              | `components/vehicles-screen/`                                                     |
| Grid / card         | `components/vehicles-grid/`, `components/vehicle-card/`                           |
| Status / timer      | `components/vehicle-status/`, `components/vehicle-rental-timer/`                  |
| Detail              | `components/vehicle-detail/` (flush `Dialog`)                                     |
| Filters             | `components/vehicle-filters/` (approved data toolbar)                             |
| Search              | `shared/components/data-search/` (explicit submit pattern)                        |
| Add vehicle         | `forms/add-vehicle/add-vehicle-dialog.tsx`                                        |
| Edit default rates  | `forms/edit-rates/edit-default-rate-dialog.tsx`                                   |
| Fleet delete        | `forms/deactivate/vehicle-deactivate-dialog.tsx`                                  |
| Set rental price UI | `forms/rental-price/set-rental-price-dialog.tsx` (Contracts boundary)             |
| Query / actions     | `utils/vehicle-filters.ts`, `utils/vehicle-card-actions.ts`                       |

## Fleet scope

The Fleet page shows **active vehicles only**. `active=true` is always sent internally; there is no Show Retired toggle in the UI. Deactivated vehicles disappear after successful deactivate + refetch.

## Approved toolbar

Every filter is server-side; changing any filter resets to page 1.

| Control             | Query param   | Notes                                                                   |
| ------------------- | ------------- | ----------------------------------------------------------------------- |
| Status chips        | `status`      | `all` omitted from request                                              |
| Search              | `search`      | Explicit submit via Shared `DataSearch` — server-side; trimmed on apply |
| Vehicle type        | `vehicleType` | Options from `GET /vehicles/filter-options` (active fleet only)         |
| Sort                | `sort`        | UX presets mapped to Backend `field:direction` (see below)              |
| Result count        | —             | `meta.total` from Backend pagination                                    |
| Active filter badge | —             | `countActiveFilters()` pure helper (user filters only)                  |
| Clear filters       | —             | Resets to `DEFAULT_VEHICLE_FILTERS`, page 1                             |

## Search behavior

- Search input uses local draft state in Shared `DataSearch` (`src/shared/components/data-search/`).
- No request per keystroke — typing is UI-only.
- Search is applied only on Shared Search button click or Enter.
- Server-side search via `GET /vehicles?search=…`; submit resets page to 1.
- Clear search (×) clears draft + applied query and refetches; other filters unchanged.
- Clear filters resets all user filters including search.
- Reuse `DataSearch` for future data-heavy pages with the same explicit-submit pattern.

## Vehicle Card Action Matrix

Central policy: `utils/vehicle-card-actions.ts` → `getVehicleCardActions(vehicle, canManage)`.

| Status                 | Visible actions                                  |
| ---------------------- | ------------------------------------------------ |
| **AVAILABLE** (active) | Set Rental Price · Edit Default Rates* · Delete* |
| **RENTED** (active)    | Return Link · GPS only                           |
| **SERVICE** (active)   | Go to Maintenance only                           |

\* Requires `vehicles.manage`. Inner buttons use `stopPropagation()`.

`currentRental = null` does not change the matrix — `operationalStatus` is authoritative.

## Sort mapping

| UX preset   | Backend `sort`                       |
| ----------- | ------------------------------------ |
| `newest`    | `createdAt:desc` (default — omitted) |
| `priceAsc`  | `dailyRate:asc`                      |
| `priceDesc` | `dailyRate:desc`                     |
| `yearDesc`  | `modelYear:desc`                     |
| `plate`     | `plateNumber:asc`                    |

All sorting is server-side on the full filtered dataset before pagination. Backend applies deterministic tie-breaking (`createdAt:desc`, `id:desc`) and explicit null placement for rate sorts (`0` first on ASC, `0`/null last on DESC).

## Vehicle Type Filter

- Source: `GET /vehicles/filter-options` — distinct active-fleet types from `vehicleName` with legacy `model.name` fallback.
- Not derived from the current paginated page.
- Refreshed after create/deactivate so new types appear immediately.
- Label: **All vehicle types** / **كل أنواع السيارات**.

## VehicleCard visual reference

Composes shared `Card` (`padding="none"`, `interactive`) with Demo `.car` internal layout matched to the **latest approved Fleet screenshot**.

## Add Vehicle

Free-text `vehicleName` via Shared `Dialog` + `FormBuilder`. No `modelId`, `operationalStatus`, or `isActive` in the form. Backend starts `AVAILABLE`.

### Vehicle photo UX (current scope)

- **One optional photo** per vehicle in the UI — no gallery management.
- Add Vehicle uses a **single** photo picker control: `Upload photo` → after selection `Change photo` + one preview (JPEG/PNG).
- Create flow: `POST /vehicles` then optional `POST /vehicles/:id/photos` (first image becomes `primaryImage`).
- Partial upload failure keeps the vehicle and shows a notice; photo can be added later from Detail.
- Fleet Card and Vehicle Detail header both use `vehicle.primaryImage` (authenticated stream).
- Detail with no photo: **لم يتم رفع صورة** / **No photo uploaded** + `Upload photo` (manage permission), Shared `secondaryStrong`.
- Detail with photo: hero shows the same image + overlay **Replace Photo** at the bottom-end of the header (does not cover name, status, or plate). Shared `secondaryStrong`, always visible (not hover-only). Behavior unchanged: upload new → delete old → refetch.
- **Development demo fleet** (`DEMO-FLEET-01..20`) has **no seeded photos** — cards use the existing placeholder.

On success: list + type filter options refresh.

## Edit Default Rates

Pencil on **AVAILABLE** active cards only (`vehicles.manage`). `PUT /vehicles/:id` partial `{ dailyRate, monthlyRate }`. Backend rejects rented vehicles.

## Delete (fleet deactivate)

Trash on **AVAILABLE** active cards only. Shared confirmation `Dialog` → `POST /vehicles/:id/deactivate`. Backend rejects rented vehicles.

## Boundaries

- **Set Rental Price** — AVAILABLE primary action; Contracts boundary (submit disabled).
- **Return Link** — RENTED primary action; Contracts boundary.
- **GPS** — RENTED secondary action; temporary notice until GPS domain.
- **currentRental** — `null` until Contracts; no fake renter/timer.

## i18n

Namespace `Vehicles` in `messages/ar.json` and `messages/en.json`. Plate/VIN stay LTR inside Arabic RTL.

## Tests

- Unit: `src/modules/vehicles/**/*.test.ts`
- Visual: `e2e/vehicles.visual.spec.ts` (Arabic desktop; requires Playwright credentials)

## Permissions summary

| Action                                             | Permission        |
| -------------------------------------------------- | ----------------- |
| View page / detail / photo stream / filter options | `vehicles.read`   |
| Add / edit rates / deactivate                      | `vehicles.manage` |

Access is permission-based only — no role-name branching.

## Button hierarchy

Shared `Button` (`src/shared/components/ui/button/`) — three emphasis levels:

| Variant           | Use on Fleet                                                                 | Visual                                                                  |
| ----------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `primary`         | Add Vehicle, card primary CTA (Set Rental Price / Return Link / Maintenance) | Dark-gold gradient fill, high-contrast label                            |
| `secondary`       | Search, Clear filters, Refresh, card icon actions (edit / delete / GPS)      | Ivory/light surface, champagne border, gold text and icons              |
| `secondaryStrong` | Vehicle Detail overlay **Replace Photo** / empty-state **Upload photo**      | Stronger champagne/ivory fill, dark-gold text/icon, clearer border/shadow |

Vehicle Type and Sort triggers use Shared `Select` `variant="ghost"` — same ivory + gold chrome as `Button` `secondary`. Status chips stay on the FilterChip pattern, not Shared Button.

Do not add page-specific button CSS when a Shared variant covers the design.
