import type {
  PrismaClient,
  RoadChargeReferenceProvenance,
  RoadChargeReferenceRegistryStatus,
  StaffRoadChargeCategory,
} from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import {
  roadChargeReferenceAlreadyUsedError,
  roadChargeReferenceInProgressError,
} from "src/modules/road-liabilities/road-charge-reference.errors";
import { normalizeRoadChargeReferenceNumber } from "src/modules/road-liabilities/road-charge-reference.normalize";

type Db = PrismaClient | Tx;

export const ROAD_CHARGE_REFERENCE_LOCK_NS = "road_charge_reference";

export function roadChargeReferenceLockEntity(
  chargeCategory: StaffRoadChargeCategory,
  referenceNumber: string,
): string {
  return `${chargeCategory}:${normalizeRoadChargeReferenceNumber(referenceNumber)}`;
}

export async function acquireRoadChargeReferenceLock(
  tx: Tx,
  chargeCategory: StaffRoadChargeCategory,
  referenceNumber: string,
): Promise<void> {
  await acquireAdvisoryLock(
    tx,
    ROAD_CHARGE_REFERENCE_LOCK_NS,
    roadChargeReferenceLockEntity(chargeCategory, referenceNumber),
  );
}

export interface ReserveStaffManualReferenceInput {
  chargeCategory: StaffRoadChargeCategory;
  referenceNumber: string;
  idempotencyKey: string;
  actorUserId: number;
  roadLiabilityId: string;
}

export async function reserveStaffManualReference(
  db: Db,
  input: ReserveStaffManualReferenceInput,
): Promise<{ registryId: string; replay: boolean }> {
  const referenceNormalized = normalizeRoadChargeReferenceNumber(input.referenceNumber);
  if (referenceNormalized.length === 0) {
    throw roadChargeReferenceAlreadyUsedError();
  }

  const existing = await db.roadChargeReferenceRegistry.findFirst({
    where: {
      chargeCategory: input.chargeCategory,
      referenceNormalized,
      status: { in: ["RESERVED", "CONFIRMED"] },
    },
  });

  if (existing) {
    if (existing.status === "CONFIRMED") {
      throw roadChargeReferenceAlreadyUsedError();
    }
    if (
      existing.status === "RESERVED" &&
      existing.staffManualIdempotencyKey === input.idempotencyKey &&
      existing.roadLiabilityId === input.roadLiabilityId
    ) {
      return { registryId: existing.id, replay: true };
    }
    if (existing.status === "RESERVED") {
      throw roadChargeReferenceInProgressError();
    }
  }

  try {
    const created = await db.roadChargeReferenceRegistry.create({
      data: {
        chargeCategory: input.chargeCategory,
        referenceNumber: input.referenceNumber,
        referenceNormalized,
        status: "RESERVED",
        provenance: "STAFF_MANUAL",
        roadLiabilityId: input.roadLiabilityId,
        staffManualIdempotencyKey: input.idempotencyKey,
        reservedByUserId: input.actorUserId,
      },
    });
    return { registryId: created.id, replay: false };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await db.roadChargeReferenceRegistry.findFirst({
      where: {
        chargeCategory: input.chargeCategory,
        referenceNormalized,
        status: { in: ["RESERVED", "CONFIRMED"] },
      },
    });
    if (!raced) throw err;
    if (raced.status === "CONFIRMED") throw roadChargeReferenceAlreadyUsedError();
    if (
      raced.staffManualIdempotencyKey === input.idempotencyKey &&
      raced.roadLiabilityId === input.roadLiabilityId
    ) {
      return { registryId: raced.id, replay: true };
    }
    throw roadChargeReferenceInProgressError();
  }
}

export async function confirmStaffManualReference(
  db: Db,
  params: { registryId: string; roadLiabilityId: string },
): Promise<void> {
  const now = new Date();
  await db.roadChargeReferenceRegistry.updateMany({
    where: {
      id: params.registryId,
      roadLiabilityId: params.roadLiabilityId,
      status: "RESERVED",
    },
    data: {
      status: "CONFIRMED",
      confirmedAt: now,
    },
  });
}

export async function releaseStaffManualReference(
  db: Db,
  params: { registryId?: string; roadLiabilityId?: string },
): Promise<void> {
  const now = new Date();
  const where =
    params.registryId != null
      ? { id: params.registryId, status: "RESERVED" as RoadChargeReferenceRegistryStatus }
      : {
          roadLiabilityId: params.roadLiabilityId,
          status: "RESERVED" as RoadChargeReferenceRegistryStatus,
          provenance: "STAFF_MANUAL" as RoadChargeReferenceProvenance,
        };
  await db.roadChargeReferenceRegistry.updateMany({
    where,
    data: {
      status: "RELEASED",
      releasedAt: now,
    },
  });
}

export async function registerProviderAuthoritativeReference(
  db: Db,
  input: {
    chargeCategory: StaffRoadChargeCategory;
    referenceNumber: string;
    roadLiabilityId: string;
  },
): Promise<void> {
  const referenceNormalized = normalizeRoadChargeReferenceNumber(input.referenceNumber);
  if (referenceNormalized.length === 0) return;

  const existing = await db.roadChargeReferenceRegistry.findFirst({
    where: {
      chargeCategory: input.chargeCategory,
      referenceNormalized,
      status: { in: ["RESERVED", "CONFIRMED"] },
    },
  });
  if (existing) {
    if (existing.status === "CONFIRMED" && existing.roadLiabilityId === input.roadLiabilityId) {
      return;
    }
    if (existing.status === "CONFIRMED" || existing.status === "RESERVED") {
      throw roadChargeReferenceAlreadyUsedError();
    }
  }

  try {
    await db.roadChargeReferenceRegistry.create({
      data: {
        chargeCategory: input.chargeCategory,
        referenceNumber: input.referenceNumber,
        referenceNormalized,
        status: "CONFIRMED",
        provenance: "PROVIDER_AUTHORITATIVE",
        roadLiabilityId: input.roadLiabilityId,
        confirmedAt: new Date(),
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await db.roadChargeReferenceRegistry.findFirst({
      where: {
        chargeCategory: input.chargeCategory,
        referenceNormalized,
        status: { in: ["RESERVED", "CONFIRMED"] },
      },
    });
    if (raced?.roadLiabilityId === input.roadLiabilityId) return;
    throw roadChargeReferenceAlreadyUsedError();
  }
}

export async function findStaffManualRegistryByIdempotency(
  db: Db,
  input: {
    chargeCategory: StaffRoadChargeCategory;
    referenceNumber: string;
    idempotencyKey: string;
  },
) {
  const referenceNormalized = normalizeRoadChargeReferenceNumber(input.referenceNumber);
  return db.roadChargeReferenceRegistry.findFirst({
    where: {
      chargeCategory: input.chargeCategory,
      referenceNormalized,
      staffManualIdempotencyKey: input.idempotencyKey,
      provenance: "STAFF_MANUAL",
      status: { in: ["RESERVED", "CONFIRMED"] },
    },
  });
}
