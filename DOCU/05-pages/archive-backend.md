# Archive — Backend

Manual editable spreadsheet rows per fleet vehicle, plus an optional **manual pull-sync** from signed contracts (no event-driven writes).

## Pull-sync (manual)

Staff run `POST /archive/sync` (`archive.manage` / `diamond.fn.archive.full`). The job:

- Links at most one `ArchiveRow` per signed contract via nullable unique `contractId`.
- Recomputes automatic columns from Contracts, Car-Out/Car-In, RENTAL payments, reconciliation **FUEL** and **DAMAGE** lines, and matched road-liability customer charges.
- `blackPoints` stores the sum of reconciliation **DAMAGE** line amounts (UI label: أضرار / Damage); not traffic black points.
- `total` = `fuel` + `salik` + manual `parking` + `blackPoints` + `fines` only (extras / `المجموع`; `rentalTotal` is excluded). Null components treated as 0 in the sum only when at least one component is non-null. Payment columns do not affect `total`.
- `rentalTotal`: sum of confirmed `ContractPayment` with `purpose = RENTAL` only.
- `cash` / `visa`: recomputed from payment **methods** (not reconciliation payment amounts). Rental portion uses confirmed `RENTAL` method(s) against effective `rentalTotal`. Extras portion uses current row `total` allocated by confirmed `RECONCILIATION` method (`CASH` → cash, `CARD` → visa). No reconciliation payment → extras are not allocated to cash/visa until a method exists.
- `transfer` / `remaining`: manual ledger columns only; Pull Sync never writes them.
- Never updates `description`, `dollar`, `transfer`, `remaining`.
- Charge columns `fuel`, `salik`, `blackPoints`, `fines` sync from sources unless `manualOverrides.{field} === true` on the row; `parking` is never written by sync (staff/import only).
- Advances global `ArchiveSyncState.lastSuccessfulSyncAt` only after a fully successful run (`syncStartedAt` cursor, incremental discovery by source `updatedAt` / `createdAt`).

Legacy rows without `contractId` are untouched.

## Model

`ArchiveRow` (`archive_rows`):

| Field | DB type | Notes |
| --- | --- | --- |
| `id` | `Int` | PK |
| `vehicleId` | `Int` | FK → `Vehicle`, `onDelete: Restrict` |
| `contractId` | `String?` | FK → `Contract`, unique when set; pull-sync identity |
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
| `blackPoints` | `Int?` | Damage total (reconciliation `DAMAGE` lines) unless manually overridden |
| `manualOverrides` | `Json` | Per sync-auto field: when `true`, pull-sync must not overwrite that column |
| `manualCellValues` | `Json` | Optional raw display text per editable field when staff enters non-typed values (e.g. `days: "شهري"`); typed columns unchanged; default `{}` |
| `cash`, `visa`, `transfer`, `remaining` | `Int?` | Whole AED (manual ledger amounts) |
| `dollar` | `Int?` | Manual USD cash column (whole dollars, not AED) |
| `createdAt`, `updatedAt` | `DateTime` | |

Rows without `contractId` remain fully manual. Synced rows still allow staff to edit cells via PATCH; sync preserves the five manual fields above and freezes `customerName` / `customerPhone` after the first create.

`PATCH` on any charge column (`fuel`, `salik`, `parking`, `blackPoints`, `fines`) sets the matching override flag, recomputes `total` via `archiveTotalFromCharges` / `computeArchiveExtrasTotal`, and returns the full row. Payment columns never affect `total`. `POST /archive/rows/:rowId/restore-auto` remains for internal/API use; Archive UI does not expose restore.

Hidden XLSX sheet `_DiamondArchiveMeta` stores `contractId`, JSON `manualOverrides`, and JSON `manualCellValues` per `vehicleId` + `rowOrder` for export/import round-trips. Visible cells export the display value (manual text when present).

`PATCH` accepts string or number per field: parseable values update typed columns; non-parseable text is stored in `manualCellValues` only. `effectiveChargeSnapshot` / cash-visa allocation treat non-numeric manual text as **0** for arithmetic only.

**UI:** No gold override styling or restore control; `manualOverrides` still govern Pull Sync merge server-side.

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
| `POST` | `/archive/import/preview` | `archive.manage` | Parse uploaded Diamond XLSX; preview only |
| `POST` | `/archive/import/confirm` | `archive.manage` | Apply previewed import (server session token) |
| `GET` | `/archive/sync/status` | `archive.manage` | Last successful sync + running flag |
| `POST` | `/archive/sync` | `archive.manage` | Manual pull-sync from operational sources |

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
- **Types:** numeric cells as numbers; `@db.Date` as date-only (`dd/mm/yyyy`) via UTC calendar extraction + UTC-noon ExcelJS values (no timezone shift); times as `HH:mm` text; `customerPhone` as text (`numFmt @`).
- **Nulls:** empty cells. Numeric `0` stays `0`.
- **No formulas.** Visible cells are persisted `ArchiveRow` values only.
- **Hidden metadata:** when any row has `contractId`, a very-hidden sheet `_DiamondArchiveMeta` stores `vehicleId`, `rowOrder`, `contractId` for import round-trip (not shown to staff).
- **Query:** one vehicle query + one archive-row query (grouped in memory); no per-vehicle N+1.

## Excel import

- Accepts the workbook produced by `GET /archive/export` (same row 1 vehicle header, row 2 headers, row 3+ data).
- Vehicle match: normalized `plateNumber` from merged row 1 (`displayName — plate`); sheet name is not used.
- Confirm replaces all `ArchiveRow` rows for each matched vehicle in one DB transaction (`deleteMany` + recreate `rowOrder` 1..N).
- If the vehicle already has contract-linked rows, confirm requires metadata from a fresh Diamond export (blocks old XLSX that would drop `contractId`).
- Preview stores a short-lived server import token (15 minutes); confirm consumes it once.

## Money

Archive money cells follow the Diamond backend convention: **whole currency units as `Int`**, never `Float`. Operational modules (contracts, finance, maintenance, vehicle rates) use the same pattern; `Decimal` in this repo is reserved for non-money precision (GPS coordinates, `extraKmRate`).

- AED columns (`dailyRate`, `rentalTotal`, `salik`, `parking`, `fuel`, `fines`, `total`, `cash`, `visa`, `transfer`, `remaining`) store whole AED.
- `dollar` is the legacy USD cash column — whole US dollars, manually entered, not converted or linked to Stripe.

No automatic totals or cross-column calculations.

## Dates and times

`deliveryDate` / `returnDate` are date-only (`@db.Date`). `deliveryTime` / `returnTime` are separate `HH:mm` text labels with no timezone semantics.
