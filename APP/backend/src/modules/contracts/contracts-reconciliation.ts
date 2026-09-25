import type {
  ContractInspectionAngle,
  ContractReconciliationLine,
  ContractReconciliationLineType,
  ContractStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { writeOutboxEvent } from "src/lib/db/outbox";
import type { Tx } from "src/lib/db/transaction";
import { isExpired } from "src/lib/security/tokens";
import { FUEL_LEVELS } from "src/modules/contracts/contracts.constants";
import { contractError } from "src/modules/contracts/contracts.errors";
import {
  isManualExternalReconLineType,
  reconciliationTotalsFromLines,
} from "src/modules/contracts/contracts-road-liability-charge";
import { assertStatus, assertTransition } from "src/modules/contracts/contracts-status";
import {
  buildRoadLiabilityChargeProposal,
  COLLECTIBLE_WHERE,
} from "src/modules/road-liabilities/road-liability.mapper";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import type { VehicleImageComparisonPair } from "src/modules/contracts/vehicle-image-comparison";

type Db = PrismaClient | Tx;

export type ReconciliationTotalsBreakdown = {
  damages: number;
  fuel: number;
  late: number;
  other: number;
  salik: number;
  violations: number;
  finalAmount: number;
};

export type ReconciliationImagePair = VehicleImageComparisonPair;

export type ReconciliationRoadLiabilityRead = {
  id: string;
  type: "RTA_VIOLATION" | "SALIK_TOLL" | "SALIK_VIOLATION";
  occurredAt: Date;
  officialAmount: number;
  adminFee: number;
  customerCharge: number;
  collectionStatus: string;
  externalReference: string | null;
  attached: boolean;
  reconciliationLineId: string | null;
};

export type ReconciliationPaymentLinkRead = {
  active: boolean;
  expiresAt: Date | null;
};

export type ReconciliationCollectionRead = {
  paymentStatus: string | null;
  paymentMethod: string | null;
};

export type FullReconciliationRead = {
  contract: {
    contractId: string;
    contractNumber: string;
    status: ContractStatus;
    vehicle: {
      id: number;
      displayName: string;
      plateNumber: string | null;
    };
  };
  custody: {
    mileageOut: number | null;
    mileageIn: number | null;
    mileageDifference: number | null;
    fuelOut: string | null;
    fuelIn: string | null;
    fuelDifference: number | null;
  };
  imagePairs: ReconciliationImagePair[];
  lines: Array<{
    id: string;
    type: ContractReconciliationLineType;
    description: string;
    amount: number;
    roadLiabilityId: string | null;
    externalReference: string | null;
    officialAmountSnapshot: number | null;
    adjustmentAmount: number | null;
    adjustmentReason: string | null;
  }>;
  roadLiabilities: {
    attached: ReconciliationRoadLiabilityRead[];
    available: ReconciliationRoadLiabilityRead[];
  };
  totals: ReconciliationTotalsBreakdown;
  reconciliation: {
    id: string;
    approvedAt: Date | null;
    finalizedAt: Date | null;
    finalizedByUserId: number | null;
    settledAt: Date | null;
    settled: boolean;
  };
  paymentLink: ReconciliationPaymentLinkRead;
  collection: ReconciliationCollectionRead;
};

export type PublicReconciliationRead = {
  contractNumber: string;
  vehicle: { displayName: string; plateNumber: string | null };
  totals: ReconciliationTotalsBreakdown;
  lines: Array<{
    type: ContractReconciliationLineType;
    description: string;
    amount: number;
  }>;
  finalAmount: number;
  payment: {
    required: boolean;
    settled: boolean;
    status: string | null;
    method: string | null;
  };
};

export const FULL_RECONCILIATION_INCLUDE = {
  vehicle: { include: { model: { select: { name: true } } } },
  carOut: { include: { photos: true } },
  carIn: { include: { photos: true } },
  reconciliation: {
    include: {
      lines: { orderBy: { createdAt: "asc" as const } },
      settledPayment: { select: { id: true, status: true, method: true, amount: true, currency: true } },
      finalizedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.ContractInclude;

export type FullReconciliationRow = Prisma.ContractGetPayload<{ include: typeof FULL_RECONCILIATION_INCLUDE }>;

export function isReconciliationFinalized(reconciliation: {
  finalizedAt: Date | null;
  approvedAt?: Date | null;
}): boolean {
  return Boolean(reconciliation.finalizedAt ?? reconciliation.approvedAt);
}

export function isReconciliationSettled(reconciliation: {
  finalAmount: number;
  settledAt: Date | null;
}): boolean {
  return Boolean(reconciliation.settledAt);
}

/** Staff Reconcile action: REVIEW contracts that still need Final Reconciliation work. */
export function canStaffReconcileContract(input: {
  status: ContractStatus;
  reconciliation: { finalAmount: number; settledAt: Date | null } | null;
}): boolean {
  if (input.status !== "REVIEW") return false;
  if (!input.reconciliation) return true;
  return !isReconciliationSettled(input.reconciliation);
}

export function assertReconciliationLinesEditable(
  contractStatus: ContractStatus,
  reconciliation: { finalizedAt: Date | null; settledAt: Date | null } | null,
): void {
  if (contractStatus === "CLOSED") throw contractError.alreadyClosed();
  if (!reconciliation) return;
  if (reconciliation.settledAt) throw contractError.reconciliationLocked();
  if (reconciliation.finalizedAt) throw contractError.reconciliationLocked();
}

/** Creates an empty reconciliation shell for REVIEW + Car-In when staff opens Final Reconciliation. */
export async function ensureReconciliationShellInTx(tx: Tx, contractId: string): Promise<void> {
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    include: { carIn: true, reconciliation: true },
  });
  if (!contract) throw contractError.notFound();
  assertStatus(contract.status, "REVIEW");
  if (!contract.carIn) throw contractError.carInRequired();
  if (contract.reconciliation) return;

  const totals = reconciliationTotalsFromLines([]);
  await tx.contractReconciliation.create({
    data: {
      contractId,
      ...totals,
      depositAmount: 0,
      deductions: 0,
    },
  });
}

export function computeFuelDifference(fuelOut: string | null, fuelIn: string | null): number | null {
  if (!fuelOut || !fuelIn) return null;
  const outIndex = FUEL_LEVELS.indexOf(fuelOut as (typeof FUEL_LEVELS)[number]);
  const inIndex = FUEL_LEVELS.indexOf(fuelIn as (typeof FUEL_LEVELS)[number]);
  if (outIndex < 0 || inIndex < 0) return null;
  // Eighths remaining: IN − OUT (e.g. OUT 8/8, IN 1/8 → −7/8).
  return 8 - inIndex - (8 - outIndex);
}

export function buildReconciliationImagePairs(
  contractId: string,
  outPhotos: ReadonlyArray<{ id: string; angle: ContractInspectionAngle }>,
  inPhotos: ReadonlyArray<{ id: string; angle: ContractInspectionAngle }>,
): ReconciliationImagePair[] {
  const outByAngle = new Map(outPhotos.map((photo) => [photo.angle, photo]));
  const inByAngle = new Map(inPhotos.map((photo) => [photo.angle, photo]));
  const angles = new Set<ContractInspectionAngle>([...outByAngle.keys(), ...inByAngle.keys()]);
  return [...angles]
    .sort((a, b) => a.localeCompare(b))
    .map((angle) => {
      const outPhoto = outByAngle.get(angle);
      const inPhoto = inByAngle.get(angle);
      return {
        angle,
        outPhoto: outPhoto
          ? { id: outPhoto.id, url: `/contracts/${contractId}/car-out/photos/${outPhoto.id}/stream` }
          : null,
        inPhoto: inPhoto
          ? { id: inPhoto.id, url: `/contracts/${contractId}/car-in/photos/${inPhoto.id}/stream` }
          : null,
      };
    });
}

export function computeTotalsBreakdown(
  lines: ReadonlyArray<{ type: ContractReconciliationLineType; amount: number }>,
): ReconciliationTotalsBreakdown {
  const totals: ReconciliationTotalsBreakdown = {
    damages: 0,
    fuel: 0,
    late: 0,
    other: 0,
    salik: 0,
    violations: 0,
    finalAmount: 0,
  };
  for (const line of lines) {
    switch (line.type) {
      case "DAMAGE":
        totals.damages += line.amount;
        break;
      case "FUEL":
        totals.fuel += line.amount;
        break;
      case "LATE":
        totals.late += line.amount;
        break;
      case "OTHER":
        totals.other += line.amount;
        break;
      case "SALIK":
        totals.salik += line.amount;
        break;
      case "VIOLATION":
        totals.violations += line.amount;
        break;
      default:
        break;
    }
    totals.finalAmount += line.amount;
  }
  return totals;
}

function mapRoadLiabilityRead(input: {
  id: string;
  type: "RTA_VIOLATION" | "SALIK_TOLL" | "SALIK_VIOLATION";
  occurredAt: Date;
  amount: number | null;
  collectionStatus: string;
  authoritativeExternalReference: string | null;
  attached: boolean;
  reconciliationLineId: string | null;
  customerChargeAmount?: number;
  adjustmentAmount?: number | null;
}): ReconciliationRoadLiabilityRead | null {
  if (input.amount == null || input.amount <= 0) return null;
  const officialAmount = input.amount;
  const customerCharge = input.customerChargeAmount ?? officialAmount;
  const adminFee = Math.max(0, customerCharge - officialAmount);
  return {
    id: input.id,
    type: input.type,
    occurredAt: input.occurredAt,
    officialAmount,
    adminFee,
    customerCharge,
    collectionStatus: input.collectionStatus,
    externalReference: input.authoritativeExternalReference,
    attached: input.attached,
    reconciliationLineId: input.reconciliationLineId,
  };
}

export async function listPendingRoadLiabilities(
  db: Db,
  contractId: string,
): Promise<Array<{ id: string; type: string; occurredAt: Date; amount: number }>> {
  return db.roadLiability.findMany({
    where: {
      ...COLLECTIBLE_WHERE,
      attributedContractId: contractId,
      reconciliationLine: { is: null },
    },
    select: { id: true, type: true, occurredAt: true, amount: true },
    orderBy: { occurredAt: "asc" },
  }).then((rows) =>
    rows.flatMap((row) => (row.amount != null && row.amount > 0 ? [row as { id: string; type: string; occurredAt: Date; amount: number }] : [])),
  );
}

export async function assertNoPendingRoadLiabilities(db: Db, contractId: string): Promise<void> {
  const pending = await listPendingRoadLiabilities(db, contractId);
  if (pending.length === 0) return;
  throw contractError.roadLiabilitiesReviewRequired(
    pending.map((row) => ({ id: row.id, type: row.type, occurredAt: row.occurredAt.toISOString() })),
  );
}

export async function recalculateReconciliationTotalsInTx(
  tx: Tx,
  reconciliationId: string,
): Promise<{ chargesTotal: number; finalAmount: number }> {
  const lines = await tx.contractReconciliationLine.findMany({
    where: { reconciliationId },
    select: { amount: true },
  });
  const totals = reconciliationTotalsFromLines(lines);
  await tx.contractReconciliation.update({
    where: { id: reconciliationId },
    data: totals,
  });
  return totals;
}

export async function ensureReconciliationFinalizedInTx(
  tx: Tx,
  contractId: string,
  actorUserId: number,
): Promise<void> {
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    include: { carIn: true, reconciliation: { include: { lines: true } } },
  });
  if (!contract) throw contractError.notFound();
  if (contract.status !== "REVIEW") throw contractError.paymentNotAllowed();
  if (!contract.carIn) throw contractError.carInRequired();
  if (!contract.reconciliation) throw contractError.reconciliationRequired();

  if (contract.reconciliation.finalizedAt) return;

  await assertNoPendingRoadLiabilities(tx, contractId);
  const totals = await recalculateReconciliationTotalsInTx(tx, contract.reconciliation.id);
  const now = new Date();
  await tx.contractReconciliation.update({
    where: { id: contract.reconciliation.id },
    data: {
      ...totals,
      finalizedAt: now,
      finalizedByUserId: actorUserId,
      approvedAt: now,
      approvedByUserId: actorUserId,
    },
  });
}

export async function finalizeReconciliationAndCloseInTx(
  tx: Tx,
  contractId: string,
  actorUserId?: number | null,
): Promise<{ closed: boolean }> {
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    include: { carIn: true, reconciliation: true },
  });
  if (!contract) throw contractError.notFound();
  if (contract.status === "CLOSED") return { closed: false };

  const reconciliation = contract.reconciliation;
  if (!reconciliation) throw contractError.reconciliationRequired();
  if (!isReconciliationFinalized(reconciliation)) throw contractError.reconciliationRequired();
  if (reconciliation.finalAmount > 0 && !reconciliation.settledAt) {
    throw contractError.reconciliationPaymentRequired();
  }
  assertTransition(contract.status, "CLOSED");
  if (!contract.carIn) throw contractError.carInRequired();

  const now = new Date();
  await tx.contract.update({
    where: { id: contractId },
    data: { status: "CLOSED", closedAt: now, revision: { increment: 1 } },
  });
  await writeOutboxEvent(tx, {
    eventType: "contract.closed",
    aggregateType: "contract",
    aggregateId: contractId,
    dedupeKey: `contract.closed:${contractId}:reconciliation_close`,
    payload: { contractId, vehicleId: contract.vehicleId, actorUserId: actorUserId ?? null },
  });
  return { closed: true };
}

export async function settleReconciliationWithoutPaymentInTx(
  tx: Tx,
  reconciliationId: string,
): Promise<void> {
  const reconciliation = await tx.contractReconciliation.findUnique({ where: { id: reconciliationId } });
  if (!reconciliation) throw contractError.notFound();
  if (!reconciliation.settledAt) {
    await tx.contractReconciliation.update({
      where: { id: reconciliationId },
      data: { settledAt: new Date() },
    });
    await settleRoadLiabilitiesForReconciliation(tx, reconciliationId);
  }
}

export async function settleRoadLiabilitiesForReconciliation(tx: Tx, reconciliationId: string): Promise<void> {
  const lines = await tx.contractReconciliationLine.findMany({
    where: { reconciliationId, roadLiabilityId: { not: null } },
    select: { roadLiabilityId: true },
  });
  const ids = lines.map((line) => line.roadLiabilityId).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return;
  await tx.roadLiability.updateMany({
    where: { id: { in: ids } },
    data: { collectionStatus: "SETTLED" },
  });
}

export async function loadActiveReconciliationPaymentLink(
  db: Db,
  contractId: string,
): Promise<ReconciliationPaymentLinkRead> {
  const link = await db.contractLink.findFirst({
    where: {
      contractId,
      type: "RECONCILIATION",
      revokedAt: null,
    },
    orderBy: { createdAt: "desc" },
    select: { expiresAt: true },
  });
  if (!link || isExpired(link.expiresAt)) {
    return { active: false, expiresAt: null };
  }
  return { active: true, expiresAt: link.expiresAt };
}

export async function loadReconciliationCollectionStatus(
  db: Db,
  reconciliationId: string,
): Promise<ReconciliationCollectionRead> {
  const payment = await db.contractPayment.findFirst({
    where: { purpose: "RECONCILIATION", targetId: reconciliationId },
    orderBy: { createdAt: "desc" },
    select: { status: true, method: true },
  });
  return {
    paymentStatus: payment?.status ?? null,
    paymentMethod: payment?.method ?? null,
  };
}

export async function loadRoadLiabilitiesForRead(
  db: Db,
  contractId: string,
  reconciliationId: string | null,
): Promise<{ attached: ReconciliationRoadLiabilityRead[]; available: ReconciliationRoadLiabilityRead[] }> {
  const [availableRows, attachedRows] = await Promise.all([
    db.roadLiability.findMany({
      where: {
        ...COLLECTIBLE_WHERE,
        attributedContractId: contractId,
        reconciliationLine: { is: null },
      },
      orderBy: { occurredAt: "asc" },
    }),
    reconciliationId
      ? db.contractReconciliationLine.findMany({
          where: { reconciliationId, roadLiabilityId: { not: null } },
          include: { roadLiability: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const available = availableRows.flatMap((row) => {
    const mapped = mapRoadLiabilityRead({
      id: row.id,
      type: row.type,
      occurredAt: row.occurredAt,
      amount: row.amount,
      collectionStatus: row.collectionStatus,
      authoritativeExternalReference: row.authoritativeExternalReference,
      attached: false,
      reconciliationLineId: null,
      customerChargeAmount: row.amount ?? undefined,
    });
    return mapped ? [mapped] : [];
  });

  const attached = attachedRows.flatMap((line) => {
    const liability = line.roadLiability;
    if (!liability || !line.roadLiabilityId) return [];
    const mapped = mapRoadLiabilityRead({
      id: liability.id,
      type: liability.type,
      occurredAt: liability.occurredAt,
      amount: line.officialAmountSnapshot ?? liability.amount,
      collectionStatus: liability.collectionStatus,
      authoritativeExternalReference: liability.authoritativeExternalReference,
      attached: true,
      reconciliationLineId: line.id,
      customerChargeAmount: line.amount,
      adjustmentAmount: line.adjustmentAmount,
    });
    return mapped ? [mapped] : [];
  });

  return { attached, available };
}

export function buildFullReconciliationRead(row: FullReconciliationRow): FullReconciliationRead | null {
  if (!row.reconciliation) return null;
  const mileageOut = row.carOut?.mileageOut ?? null;
  const mileageIn = row.carIn?.mileageIn ?? null;
  const fuelOut = row.carOut?.fuelOut ?? null;
  const fuelIn = row.carIn?.fuelIn ?? null;
  const lines = row.reconciliation.lines.map((line) => ({
    id: line.id,
    type: line.type,
    description: line.description,
    amount: line.amount,
    roadLiabilityId: line.roadLiabilityId,
    externalReference: line.externalReference,
    officialAmountSnapshot: line.officialAmountSnapshot,
    adjustmentAmount: line.adjustmentAmount,
    adjustmentReason: line.adjustmentReason,
  }));

  return {
    contract: {
      contractId: row.id,
      contractNumber: row.contractNumber,
      status: row.status,
      vehicle: {
        id: row.vehicle.id,
        displayName: vehicleDisplayName({
          vehicleName: row.vehicle.vehicleName,
          modelName: row.vehicle.model?.name ?? null,
          modelYear: row.vehicle.modelYear,
          plateNumber: row.vehicle.plateNumber,
        }),
        plateNumber: row.vehicle.plateNumber,
      },
    },
    custody: {
      mileageOut,
      mileageIn,
      mileageDifference: mileageOut != null && mileageIn != null ? mileageIn - mileageOut : null,
      fuelOut,
      fuelIn,
      fuelDifference: computeFuelDifference(fuelOut, fuelIn),
    },
    imagePairs: buildReconciliationImagePairs(
      row.id,
      row.carOut?.photos ?? [],
      row.carIn?.photos ?? [],
    ),
    lines,
    roadLiabilities: { attached: [], available: [] },
    totals: computeTotalsBreakdown(lines),
    reconciliation: {
      id: row.reconciliation.id,
      approvedAt: row.reconciliation.approvedAt,
      finalizedAt: row.reconciliation.finalizedAt,
      finalizedByUserId: row.reconciliation.finalizedByUserId,
      settledAt: row.reconciliation.settledAt,
      settled: isReconciliationSettled(row.reconciliation),
    },
    paymentLink: { active: false, expiresAt: null },
    collection: { paymentStatus: null, paymentMethod: null },
  };
}

export async function assembleFullReconciliationRead(
  db: Db,
  row: FullReconciliationRow,
): Promise<FullReconciliationRead | null> {
  const base = buildFullReconciliationRead(row);
  if (!base) return null;
  const reconciliationId = row.reconciliation?.id ?? null;
  const [roadLiabilities, paymentLink, collection] = await Promise.all([
    loadRoadLiabilitiesForRead(db, row.id, reconciliationId),
    loadActiveReconciliationPaymentLink(db, row.id),
    reconciliationId
      ? loadReconciliationCollectionStatus(db, reconciliationId)
      : Promise.resolve({ paymentStatus: null, paymentMethod: null }),
  ]);
  base.roadLiabilities = roadLiabilities;
  base.paymentLink = paymentLink;
  base.collection = collection;
  return base;
}

export function buildPublicReconciliationRead(
  row: FullReconciliationRow,
  full: FullReconciliationRead,
): PublicReconciliationRead {
  const payment = row.reconciliation?.settledPayment ?? null;
  return {
    contractNumber: row.contractNumber,
    vehicle: {
      displayName: full.contract.vehicle.displayName,
      plateNumber: full.contract.vehicle.plateNumber,
    },
    totals: full.totals,
    lines: full.lines.map((line) => ({
      type: line.type,
      description: line.description,
      amount: line.amount,
    })),
    finalAmount: full.totals.finalAmount,
    payment: {
      required: full.totals.finalAmount > 0,
      settled: full.reconciliation.settled,
      status: payment?.status ?? null,
      method: payment?.method ?? null,
    },
  };
}

export function assertManualReconciliationLineType(type: ContractReconciliationLineType): void {
  if (isManualExternalReconLineType(type)) throw contractError.roadLiabilityRequired();
}

export async function persistManualReconciliationLinesInTx(
  tx: Tx,
  contractId: string,
  manualLines: ReadonlyArray<{
    type: ContractReconciliationLineType;
    description: string;
    amount: number;
    externalReference?: string | null;
    sourceDomain?: string | null;
  }>,
): Promise<void> {
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    include: { reconciliation: true },
  });
  if (!contract) throw contractError.notFound();
  assertReconciliationLinesEditable(contract.status, contract.reconciliation);

  for (const line of manualLines) {
    assertManualReconciliationLineType(line.type);
  }

  const preservedLiabilityLines = contract.reconciliation
    ? await tx.contractReconciliationLine.findMany({
        where: { reconciliationId: contract.reconciliation.id, roadLiabilityId: { not: null } },
      })
    : [];
  const totals = reconciliationTotalsFromLines([...preservedLiabilityLines, ...manualLines]);

  if (contract.reconciliation) {
    await tx.contractReconciliationLine.deleteMany({
      where: { reconciliationId: contract.reconciliation.id, roadLiabilityId: null },
    });
    await tx.contractReconciliation.update({
      where: { id: contract.reconciliation.id },
      data: {
        ...totals,
        depositAmount: 0,
        deductions: 0,
        lines: { create: [...manualLines] },
      },
    });
  } else {
    await tx.contractReconciliation.create({
      data: {
        contractId,
        ...totals,
        depositAmount: 0,
        deductions: 0,
        lines: { create: [...manualLines] },
      },
    });
  }
}

export type FinalReconciliationDetail = {
  custody: FullReconciliationRead["custody"];
  imagePairs: ReconciliationImagePair[];
  lines: FullReconciliationRead["lines"];
  totals: ReconciliationTotalsBreakdown;
  settlement: {
    method: string | null;
    paymentId: string | null;
    paymentStatus: string | null;
    settledAt: Date | null;
  };
  finalizedAt: Date | null;
  finalizedBy: { id: number; name: string } | null;
};

export function buildFinalReconciliationDetail(row: FullReconciliationRow): FinalReconciliationDetail | null {
  const full = buildFullReconciliationRead(row);
  if (!full) return null;
  const payment = row.reconciliation?.settledPayment ?? null;
  return {
    custody: full.custody,
    imagePairs: full.imagePairs,
    lines: full.lines,
    totals: full.totals,
    settlement: {
      method: payment?.method ?? (full.reconciliation.settled && full.totals.finalAmount === 0 ? "NONE" : null),
      paymentId: payment?.id ?? null,
      paymentStatus: payment?.status ?? null,
      settledAt: row.reconciliation?.settledAt ?? null,
    },
    finalizedAt: row.reconciliation?.finalizedAt ?? row.reconciliation?.approvedAt ?? null,
    finalizedBy: row.reconciliation?.finalizedBy
      ? { id: row.reconciliation.finalizedBy.id, name: row.reconciliation.finalizedBy.name ?? "" }
      : row.reconciliation?.approvedBy
        ? { id: row.reconciliation.approvedBy.id, name: row.reconciliation.approvedBy.name ?? "" }
        : null,
  };
}
