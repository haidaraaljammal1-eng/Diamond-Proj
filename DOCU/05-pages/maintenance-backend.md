# Maintenance Center — Backend

Workshop maintenance orders for Diamond fleet vehicles. TARS, contracts, payments, and public rental are out of scope.

## Model

`MaintenanceOrder` (`maintenance_orders`):

| Field | Notes |
| --- | --- |
| `vehicleId` | Authoritative vehicle reference — never `vehicleName` or plate |
| `status` | `SCHEDULED`, `IN_SERVICE`, `READY_FOR_PICKUP`, `COMPLETED`, `CANCELLED` |
| `maintenanceType` | `MECHANICAL`, `ELECTRICAL`, `TIRES`, `AIR_CONDITIONING`, `BODY`, `PERIODIC`, `OTHER` |
| `issueDescription` | Required staff description of what happened |
| `scheduledAt` | Required for scheduled entry; vehicle stays `AVAILABLE` |
| `startedAt` | Set when maintenance physically starts |
| `readyAt` | Set on ready-for-pickup |
| `completedAt` | Set on completion |
| `workshopName`, `odometerIn`, `expectedCompletionAt`, `notes` | Optional |
| `cost` | Optional actual known cost in whole AED (`null` until entered) |
| `createdByUserId` | From authenticated staff context |

`OVERDUE` is **not** persisted. API exposes `overdue: boolean` when:

- `status = scheduled` and `scheduledAt < now`, or
- `status` is `in_service` / `ready_for_pickup` and `expectedCompletionAt < now`.

## Vehicle status interaction

| Maintenance status | `Vehicle.operationalStatus` |
| --- | --- |
| `SCHEDULED` | `AVAILABLE` |
| `IN_SERVICE` | `SERVICE` |
| `READY_FOR_PICKUP` | `SERVICE` |
| `COMPLETED` | `AVAILABLE` |
| `CANCELLED` (from scheduled) | `AVAILABLE` |

New orders require `Vehicle.operationalStatus = AVAILABLE`. Starting a scheduled order re-checks availability — a vehicle that became `RENTED` after scheduling cannot start maintenance.

Manual fleet status changes via `PUT /vehicles/:id` must stay consistent with active maintenance:

- While maintenance is `IN_SERVICE` or `READY_FOR_PICKUP`, the vehicle cannot leave `SERVICE` manually.
- While any active maintenance exists (`SCHEDULED`, `IN_SERVICE`, `READY_FOR_PICKUP`), the vehicle cannot be set to `RENTED`.
- Manual `AVAILABLE` → `SERVICE` without a maintenance order remains allowed (no fabricated order).

## Cost

There is a single optional `cost` field (whole AED, nullable). No estimated/expected cost fields exist.

- Create (`POST /maintenance`): `cost` optional; omit or leave empty → stored as `null`.
- Update (`PATCH /maintenance/:id`): `cost` editable on active orders (`SCHEDULED`, `IN_SERVICE`, `READY_FOR_PICKUP`).
- Completed orders are historical: `PATCH` is rejected once `status = COMPLETED` (or `CANCELLED`).
- List/detail include `cost` when set. Summary exposes `totalCost` (sum of non-null costs; nulls ignored).

## Maintenance history

Completed orders (`status = COMPLETED`) are the maintenance history records. No separate history table is used.

## Permissions

| Key | Purpose |
| --- | --- |
| `maintenance.read` | List, detail, summary |
| `maintenance.manage` | Create, update, lifecycle actions |

Seeded via `PERMISSION_CATALOG`. `system_admin` receives all permissions on bootstrap.

## Routes

Base path: `/maintenance` (admin autoload).

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/maintenance` | `maintenance.read` | List/search/filter orders |
| `GET` | `/maintenance/summary` | `maintenance.read` | KPI counts |
| `GET` | `/maintenance/:id` | `maintenance.read` | Order detail + vehicle projection |
| `POST` | `/maintenance` | `maintenance.manage` | Add vehicle to maintenance |
| `PATCH` | `/maintenance/:id` | `maintenance.manage` | Safe field edits (including `cost` on active orders) |
| `POST` | `/maintenance/:id/start` | `maintenance.manage` | Start scheduled order |
| `POST` | `/maintenance/:id/ready` | `maintenance.manage` | Mark ready for pickup |
| `POST` | `/maintenance/:id/complete` | `maintenance.manage` | Complete and release vehicle |
| `POST` | `/maintenance/:id/cancel` | `maintenance.manage` | Cancel scheduled order |

### Create body (conceptual)

```json
{
  "vehicleId": 42,
  "issueDescription": "Abnormal vibration while braking.",
  "maintenanceType": "mechanical",
  "startMode": "now",
  "scheduledAt": "2026-09-15T09:00:00.000Z",
  "workshopName": "Al Awir Auto Care",
  "odometerIn": 19840,
  "expectedCompletionAt": "2026-09-16T17:00:00.000Z",
  "notes": "Customer reported noise from front wheels.",
  "cost": 850
}
```

- `startMode`: `now` → `IN_SERVICE` + vehicle `SERVICE` in one transaction.
- `startMode`: `scheduled` → requires future `scheduledAt`; vehicle stays `AVAILABLE`.

### Vehicle selector

Reuse `GET /vehicles?status=available&active=true&search=...` for the Add Maintenance dialog. Response cards include `id`, `displayName`, `plateNumber`, `modelYear`, `color`, `operationalStatus`.

## Conflict reasons

| Reason | When |
| --- | --- |
| `VEHICLE_NOT_AVAILABLE_FOR_MAINTENANCE` | Vehicle not `AVAILABLE` for create/start |
| `ACTIVE_MAINTENANCE_EXISTS` | Another active order on same vehicle |
| `MAINTENANCE_INVALID_TRANSITION` | Illegal lifecycle action |
| `MAINTENANCE_SCHEDULED_AT_REQUIRED` | Missing `scheduledAt` for scheduled create |
| `MAINTENANCE_SCHEDULED_AT_MUST_BE_FUTURE` | `scheduledAt` not in the future |
| `MAINTENANCE_COMPLETED_IMMUTABLE` | PATCH on completed/cancelled order |
| `VEHICLE_ACTIVE_MAINTENANCE_BLOCKS_STATUS` | Manual fleet status conflicts with active maintenance |

## Migrations

- `prisma/migrations/20260909233530_maintenance_center/migration.sql`
- `prisma/migrations/20260910120000_maintenance_cost/migration.sql` — adds nullable `cost`

After pulling schema changes locally: `npm run dev:bootstrap` (or `npm run db:migrate` + `npm run db:seed`).
