import type { PrismaClient } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";
import { normalizePlateNumber } from "src/lib/master-data/code";

type Db = PrismaClient | Tx;

/**
 * Resolve a Diamond Vehicle from provider-neutral identifiers.
 * Never creates Vehicle records. Unresolved identifiers stay unmatched.
 */
export function createVehicleMatchService(prisma: Db) {
  async function matchVehicle(input: {
    vehicleId?: number | null;
    plateNumber?: string | null;
    externalVehicleRef?: string | null;
  }): Promise<{ vehicleId: number | null; plateNumberNormalized: string | null }> {
    const plateNumberNormalized = input.plateNumber
      ? normalizePlateNumber(input.plateNumber)
      : null;

    if (input.vehicleId != null) {
      const byId = await prisma.vehicle.findUnique({
        where: { id: input.vehicleId },
        select: { id: true, plateNumber: true },
      });
      if (byId) {
        return {
          vehicleId: byId.id,
          plateNumberNormalized: plateNumberNormalized ?? byId.plateNumber,
        };
      }
    }

    if (plateNumberNormalized) {
      const byPlate = await prisma.vehicle.findUnique({
        where: { plateNumber: plateNumberNormalized },
        select: { id: true, plateNumber: true },
      });
      if (byPlate) {
        return { vehicleId: byPlate.id, plateNumberNormalized: byPlate.plateNumber };
      }
    }

    const externalRef = input.externalVehicleRef?.trim() || null;
    if (externalRef) {
      const byExternal = await prisma.vehicle.findUnique({
        where: { externalId: externalRef },
        select: { id: true, plateNumber: true },
      });
      if (byExternal) {
        return {
          vehicleId: byExternal.id,
          plateNumberNormalized: plateNumberNormalized ?? byExternal.plateNumber,
        };
      }
    }

    return { vehicleId: null, plateNumberNormalized };
  }

  return { matchVehicle };
}
