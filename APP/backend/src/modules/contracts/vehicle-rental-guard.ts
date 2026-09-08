import type { PrismaClient } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";
import {
  BLOCKING_CONTRACT_STATUSES,
  VEHICLE_RENTAL_LOCK_NS,
} from "src/modules/contracts/contracts.constants";
import { contractError } from "src/modules/contracts/contracts.errors";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";

type Db = PrismaClient | Tx;

export async function findBlockingContract(
  db: Db,
  vehicleId: number,
  exceptContractId?: string,
) {
  return db.contract.findFirst({
    where: {
      vehicleId,
      status: { in: [...BLOCKING_CONTRACT_STATUSES] },
      ...(exceptContractId ? { id: { not: exceptContractId } } : {}),
    },
    select: { id: true, status: true, contractNumber: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export async function assertVehicleFreeForRental(
  tx: Tx,
  vehicleId: number,
  exceptContractId?: string,
): Promise<void> {
  await acquireAdvisoryLock(tx, VEHICLE_RENTAL_LOCK_NS, vehicleId);
  const vehicle = await tx.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, isActive: true, operationalStatus: true },
  });
  if (!vehicle || !vehicle.isActive) throw contractError.vehicleNotAvailable();
  if (vehicle.operationalStatus === "SERVICE") throw contractError.vehicleNotAvailable();

  const blocking = await findBlockingContract(tx, vehicleId, exceptContractId);
  if (blocking) throw contractError.vehicleAlreadyRented();
}

export async function vehicleHasBlockingContract(
  db: Db,
  vehicleId: number,
): Promise<boolean> {
  const row = await findBlockingContract(db, vehicleId);
  return row !== null;
}
