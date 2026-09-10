import type { MaintenanceOrderStatus } from "@prisma/client";

export const MAINTENANCE_VEHICLE_LOCK_NS = "vehicle_maintenance";

/** Active maintenance blocks another active order for the same vehicle. */
export const ACTIVE_MAINTENANCE_STATUSES: MaintenanceOrderStatus[] = [
  "SCHEDULED",
  "IN_SERVICE",
  "READY_FOR_PICKUP",
];
