import type { PrismaClient, VehicleOperationalStatus } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";
import { ACTIVE_MAINTENANCE_STATUSES } from "src/modules/maintenance/maintenance.constants";
import { vehicleActiveMaintenanceBlocksStatusError } from "src/modules/maintenance/maintenance.errors";

type Db = PrismaClient | Tx;

/**
 * Blocks fleet manual status changes that would desync Vehicle from an active
 * maintenance order. Maintenance lifecycle actions remain the authority for
 * SERVICE ↔ AVAILABLE during IN_SERVICE / READY_FOR_PICKUP.
 */
export async function assertVehicleOperationalStatusAllowedWithActiveMaintenance(
  db: Db,
  vehicleId: number,
  currentStatus: VehicleOperationalStatus,
  requestedStatus: VehicleOperationalStatus,
): Promise<void> {
  if (currentStatus === requestedStatus) return;

  const active = await db.maintenanceOrder.findFirst({
    where: {
      vehicleId,
      status: { in: ACTIVE_MAINTENANCE_STATUSES },
    },
    select: { status: true },
  });
  if (!active) return;

  if (
    (active.status === "IN_SERVICE" || active.status === "READY_FOR_PICKUP") &&
    requestedStatus !== "SERVICE"
  ) {
    throw vehicleActiveMaintenanceBlocksStatusError(active.status);
  }

  if (requestedStatus === "RENTED") {
    throw vehicleActiveMaintenanceBlocksStatusError(active.status);
  }
}
