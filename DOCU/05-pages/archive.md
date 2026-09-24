# Archive — Frontend

Manual editable spreadsheet per fleet vehicle. See [archive-backend.md](./archive-backend.md) for API details.

## Route

`/archive` (locale-prefixed: `/ar/archive`, `/en/archive`)

## Permissions

- `archive.read` — open page, select vehicle, view rows
- `archive.manage` — add rows, edit cells, delete rows

## UX

1. Select vehicle from `GET /archive/vehicles` (Diamond Select, searchable).
2. Load rows for selected `vehicleId`.
3. Table shows vehicle header bar + 24 column headers + inline editable cells.
4. Cell save on blur/Enter via sparse `PATCH /archive/rows/:rowId`.
   - Failed PATCH keeps the draft visible with an error mark; user can retry on blur/Enter.
   - Enter + blur is guarded to issue a single PATCH (in-flight commit guard).
5. Add Row → `POST /archive/vehicles/:vehicleId/rows`.
6. Delete row → confirmation dialog → `DELETE /archive/rows/:rowId` (204 No Content).

Vehicle row loads use a request-id guard so a stale vehicle response cannot overwrite the current selection.

6. **Download Excel** (`GET /archive/export`) — exports all current fleet vehicles in one workbook (not only the selected vehicle). Requires `archive.read`. Before download, any dirty editable cell is committed; failed unsaved edits block export.

No operational auto-population.
