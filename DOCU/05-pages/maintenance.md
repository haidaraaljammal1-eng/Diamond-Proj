# Maintenance Center — Frontend

Diamond HTML Demo (`demo.html` → Maintenance Center / مركز الصيانة) is the visual and UX source of truth. Backend contract: [maintenance-backend.md](./maintenance-backend.md).

## Route / Permission

- `/ar/maintenance`
- `/en/maintenance`

Navigation rail entry `maintenance` → `/maintenance`, placed in the main operational group after Fleet and GPS (Demo rail order). Page access and sidebar visibility: `maintenance.read`. Mutating actions: `maintenance.manage`. Unauthorized users do not see the nav item; the page and Backend still require the permission.

## Architecture

```
MaintenancePage
  → MaintenanceScreen
    → useMaintenanceList() / useMaintenanceDetail() / useMaintenanceActions()
      → maintenance.store.ts
        → maintenance.api.ts
          → Central API Client
            → Fastify Backend
```

UI state (add/edit/detail/complete/cancel dialogs, notices) stays in the screen — not in the store.

## Module

`APP/frontend/src/modules/maintenance/`

| Area | Files |
| --- | --- |
| API | `api/maintenance.api.ts` |
| Store | `stores/maintenance.store.ts`, `stores/available-maintenance-vehicles.store.ts` |
| Hooks | `hooks/use-maintenance.ts`, `hooks/use-available-maintenance-vehicles.ts` |
| Screen | `components/maintenance-screen/` |
| KPIs / filters / cards | `components/maintenance-kpis/`, `maintenance-filters/`, `maintenance-card/`, `maintenance-grid/` |
| History | `components/maintenance-history/` |
| Detail | `components/maintenance-detail/` |
| Add / edit | `forms/add-maintenance/`, `forms/edit-maintenance/` |
| Lifecycle confirm | `forms/lifecycle/` |

## Endpoints used

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/maintenance` | Active list (status chips) and history (`status=completed`). Each row includes the Vehicle projection (name, plate, year, color, primary image). |
| GET | `/maintenance/summary` | KPI counts including `totalCost` |
| GET | `/maintenance/:id` | Full order detail — only when the user opens one record |

| POST | `/maintenance` | Add vehicle (`startMode` `now` \| `scheduled`) |
| PATCH | `/maintenance/:id` | Edit active fields including `cost` |
| POST | `/maintenance/:id/start` | Scheduled → in service |
| POST | `/maintenance/:id/ready` | In service → ready for pickup |
| POST | `/maintenance/:id/complete` | Ready → completed, vehicle AVAILABLE |
| POST | `/maintenance/:id/cancel` | Cancel scheduled |
| GET | `/vehicles?status=available&active=true&search=&companyId=` | Vehicle selector |

List rows include the Vehicle projection from a single Prisma `include` on `GET /maintenance`. Cards and history do **not** call `GET /maintenance/:id` per row. Detail is fetched only when a staff member opens one order.

## UI rules

- OVERDUE is a derived `overdue` flag / list filter, not a persisted status.
- History is completed `MaintenanceOrder` rows (`GET /maintenance?status=completed`). No separate history entity.
- Completed records are view-only (no Edit / lifecycle).
- Cost is a single optional AED field; it can be empty at create and patched later.
- Vehicle selector submits `vehicleId` and shows plate prominently.
- Confirm complete/cancel with the shared `Dialog`. No `alert()` / `confirm()`.

## Operating company

The company shown on a maintenance order comes from the order's Vehicle
projection on `GET /maintenance` — never a second lookup, and never a
`MaintenanceOrder` field, which does not exist.

- Shared `CompanyIdentity` renders it on the card head (beside the vehicle name),
  in the detail dialog as a **Company** row, and under the plate in the completed
  history table. The container owns the layout; the shared component keeps its own
  `display`.
- The toolbar adds a Company filter (All Companies / UNIQUE / ELITE) built from
  the authoritative `useOperatingCompanies()` chain — no module-local
  `["UNIQUE", "ELITE"]` array. It sends `companyId` to the Backend and composes
  with the status chips, search, type and sort. Clear Filters returns it to All
  Companies.
- The Add Maintenance vehicle picker shows the company on each option and keeps
  it in the selected-vehicle summary, and its own company filter narrows the same
  server-side `GET /vehicles` query. The vehicle name stays dominant.
- Labels reuse the shared `OperatingCompanies` i18n namespace
  (`company`, `all`, `loading`); the company name itself is backend
  `displayName` and is never translated.

Company identity is not a lifecycle state: it never renders as, or beside, the
maintenance status chip as if it were the same kind of value. See
[operating-companies.md](../00-system-overview/operating-companies.md).
