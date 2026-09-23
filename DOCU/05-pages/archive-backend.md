# Archive — Backend

Manual editable spreadsheet rows per fleet vehicle. Contracts, payments, Car-Out/Car-In, and all other operational modules are **out of scope** for this foundation — values are staff-entered only.

## Model

`ArchiveRow` (`archive_rows`):

| Field | DB type | Notes |
| --- | --- | --- |
| `id` | `Int` | PK |
| `vehicleId` | `Int` | FK → `Vehicle`, `onDelete: Restrict` |
| `rowOrder` | `Int` | Stable per-vehicle order (1-based); unique with `vehicleId` |
| `kmIn`, `km`, `kmOut` | `Int?` | Mileage — manual only |
| `deliveryDate`, `returnDate` | `DateTime? @db.Date` | Calendar dates only (PostgreSQL `DATE`) |
| `deliveryTime`, `returnTime` | `String?` | `HH:mm` wall-clock labels |
| `customerName` | `String?` | |
| `customerPhone` | `String?` | Never numeric — preserves `+`, leading zeros, spaces |
| `description` | `String?` | |
| `days` | `Int?` | |
| `dailyRate`, `rentalTotal` | `Int?` | Whole AED |
| `salik`, `parking`, `fuel`, `fines`, `total` | `Int?` | Whole AED |
| `blackPoints` | `Int?` | |
| `cash`, `visa`, `transfer`, `remaining` | `Int?` | Whole AED (manual ledger amounts) |
| `dollar` | `Int?` | Manual USD cash column (whole dollars, not AED) |
| `createdAt`, `updatedAt` | `DateTime` | |

No `contractId` in ARCHIVE-1. No calculated fields — `total`, `remaining`, and `rentalTotal` are independent manual cells.

## Vehicle relation

- Every row belongs to a real `Vehicle` by `vehicleId`.
- Vehicle soft-deactivation (`isActive = false`) does **not** delete archive rows (`onDelete: Restrict`).
- `GET /archive/vehicles` lists **active fleet** vehicles (`isActive: true`) regardless of `operationalStatus` (RENTED/SERVICE included).
- Row CRUD validates the vehicle exists by id; inactive vehicles remain addressable for historical archive work.

## rowOrder concurrency

`POST /archive/vehicles/:vehicleId/rows` runs inside `withTransaction` and acquires `pg_advisory_xact_lock` on namespace `archive_vehicle` + `vehicleId`, then sets `rowOrder = max(existing) + 1`. `@@unique([vehicleId, rowOrder])` is a database backstop against duplicate positions.

## Permissions

| Key | Purpose |
| --- | --- |
| `archive.read` | List vehicles and rows |
| `archive.manage` | Create, patch, delete rows |

Seeded via `PERMISSION_CATALOG`. `system_admin` receives all permissions on bootstrap.

## Routes

Base path: `/archive` (admin autoload).

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/archive/vehicles` | `archive.read` | Active fleet selector: `id`, `displayName`, `plateNumber` |
| `GET` | `/archive/vehicles/:vehicleId/rows` | `archive.read` | Rows ordered by `rowOrder` asc; empty array when none |
| `POST` | `/archive/vehicles/:vehicleId/rows` | `archive.manage` | Create empty row; optional manual initial values |
| `PATCH` | `/archive/rows/:rowId` | `archive.manage` | Sparse partial update; `vehicleId` not editable |
| `DELETE` | `/archive/rows/:rowId` | `archive.manage` | Delete row only |
| `GET` | `/archive/export` | `archive.read` | Download full-fleet XLSX workbook |

## Excel export (ARCHIVE-4)

`GET /archive/export` returns one `.xlsx` workbook for **all current fleet vehicles** (`isActive: true`), not only the vehicle selected in the UI.

- **Permission:** `archive.read` (same as list/read; no separate export permission).
- **Filename:** `Diamond_Archive_YYYY-MM-DD.xlsx` via `Content-Disposition`.
- **Sheets:** one worksheet per active fleet vehicle, ordered `vehicleName ASC`, `id ASC`.
- **Sheet naming:** sanitized `displayName`; duplicate names append plate; further collisions get a deterministic numeric suffix. Max 31 chars; invalid Excel chars removed.
- **Layout per sheet:**
  - Row 1: merged `A1:X1` vehicle header `displayName — plateNumber`
  - Row 2: fixed 24 business column headers (Arabic/English mix template)
  - Row 3+: `ArchiveRow` data ordered by `rowOrder ASC`
- **Empty vehicles:** sheet still created with header rows only.
- **Types:** numeric cells as numbers; `@db.Date` as date-only (`dd/mm/yyyy`, no timezone shift); times as `HH:mm` text; `customerPhone` as text (`numFmt @`).
- **Nulls:** empty cells. Numeric `0` stays `0`.
- **No formulas.** Persisted manual `ArchiveRow` values only — no Contract/Car-Out/Finance enrichment.
- **Query:** one vehicle query + one archive-row query (grouped in memory); no per-vehicle N+1.

## Money

Archive money cells follow the Diamond backend convention: **whole currency units as `Int`**, never `Float`. Operational modules (contracts, finance, maintenance, vehicle rates) use the same pattern; `Decimal` in this repo is reserved for non-money precision (GPS coordinates, `extraKmRate`).

- AED columns (`dailyRate`, `rentalTotal`, `salik`, `parking`, `fuel`, `fines`, `total`, `cash`, `visa`, `transfer`, `remaining`) store whole AED.
- `dollar` is the legacy USD cash column — whole US dollars, manually entered, not converted or linked to Stripe.

No automatic totals or cross-column calculations.

## Dates and times

`deliveryDate` / `returnDate` are date-only (`@db.Date`). `deliveryTime` / `returnTime` are separate `HH:mm` text labels with no timezone semantics.
