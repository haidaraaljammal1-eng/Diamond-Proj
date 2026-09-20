# Vehicles Page — Frontend

Diamond HTML Demo (`demo.html` → Fleet / Vehicles) is the behavioral source of truth. The **latest approved Fleet screenshot** is the visual reference for `VehicleCard`. Backend contract: [vehicles-backend.md](./vehicles-backend.md).

> **Operating company (UNIQUE / ELITE):** the backend is ready — `GET /operating-companies`, required `companyId` on vehicle creation, `company` on every Vehicle DTO and `?companyId=` on the fleet list. The UI (Add Vehicle Select, card badge, fleet filter) is not built yet. Read [operating-companies.md](../00-system-overview/operating-companies.md) before adding it.

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
| Set rental price UI | `forms/rental-price/set-rental-price-dialog.tsx` (creates a real Contract offer + rental link) |
| Query / actions     | `utils/vehicle-filters.ts`, `utils/vehicle-card-actions.ts`                       |

## Fleet scope

The Fleet page shows **active vehicles only**. `active=true` is always sent internally; there is no Show Retired toggle in the UI. Deactivated vehicles disappear after successful deactivate + refetch.

## Fleet pagination

- Server-side pagination via `GET /vehicles?page=&pageSize=`.
- Default `pageSize` is **20** (no page-size selector in the UI).
- `meta.total`, `meta.totalPages`, and `meta.page` from the Backend are the source of truth — never derived from `data.length`.
- Previous / Next controls appear only when `meta.totalPages > 1`.
- Search, status, vehicle type, sort, and clear filters reset `page` to **1** before refetch.
- After deactivate (or any mutation that shrinks `totalPages`), an out-of-range current page is corrected to the last valid page and refetched — no false empty state.
- No runtime fleet cap (e.g. no `slice(0, 100)`); any number of active vehicles is reachable page by page.

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

| Status | Visible actions |
| ------ | ---------------- |
| **AVAILABLE** + no `currentRental` | Set Rental Price · Edit Default Rates* · Delete* |
| **AVAILABLE** + `currentRental.status = paid` | Car-Out (real Contracts flow; no Set Price / Edit / Delete) |
| **RENTED** (`active` / `retout` / `review`) | Return Link · GPS only |
| **SERVICE** | Go to Maintenance only |

\* Requires `vehicles.manage`. Inner buttons use `stopPropagation()`.

`currentRental.status = paid` is Backend authority: the vehicle stays AVAILABLE until Car-Out, but the chip reads **Ready for Car-Out** / **جاهزة للتسليم** and rental/edit/delete actions are hidden. Do not invent a RESERVED operational status.

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

## Fleet ↔ Contracts bridge

- **Set Rental Price** — AVAILABLE with no `currentRental` → `POST /contracts/offers` then rental link. Default rates are suggestions only.
- **Car-Out** — AVAILABLE + `currentRental.status = paid` → Car-Out dialog for `currentRental.contractId`.
- **Return Link** — RENTED + `active` generates a real return link; `retout` opens the contract drawer; `review` opens Reconciliation.
- **GPS** — RENTED secondary action; temporary notice until GPS domain.
- **currentRental** — Backend projection (`paid` / `active` / `retout` / `review`); never fake renter/timer.

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
