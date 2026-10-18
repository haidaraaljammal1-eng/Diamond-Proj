import type { ContractPayment, PrismaClient } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";
import { withTransaction } from "src/lib/db/transaction";
import { STAFF_MANUAL_SOURCE_KEY } from "src/modules/road-liabilities/road-liability.constants";
import { isStaffManualProvisionalCollectible } from "src/modules/road-liabilities/road-liability.mapper";
import {
  confirmStaffManualReference,
  releaseStaffManualReference,
} from "src/modules/road-liabilities/road-charge-reference.service";

type Db = PrismaClient | Tx;

export type StaffManualOutcomeReconcileResult =
  | { action: "none" }
  | { action: "finalized_success" }
  | { action: "finalized_failure" };

async function runInTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (typeof (db as PrismaClient).$transaction === "function") {
    return withTransaction(db as PrismaClient, fn);
  }
  return fn(db as Tx);
}

type ReconcileParams = {
  paymentId?: string;
  roadLiabilityId?: string;
  payment?: Pick<ContractPayment, "id" | "purpose" | "status" | "targetId">;
};

async function loadStaffManualContext(tx: Tx, params: ReconcileParams) {
  const paymentId = params.paymentId ?? params.payment?.id;
  let roadLiabilityId = params.roadLiabilityId;
  let payment: ContractPayment | null = null;

  if (paymentId) {
    payment = await tx.contractPayment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.purpose !== "ROAD_LIABILITY") return null;
    const charge = await tx.roadLiabilityCustomerCharge.findUnique({
      where: { id: payment.targetId },
    });
    if (!charge) return null;
    roadLiabilityId = charge.roadLiabilityId;
  }

  if (!roadLiabilityId) return null;

  const liability = await tx.roadLiability.findUnique({ where: { id: roadLiabilityId } });
  if (!liability || liability.authoritativeSourceKey !== STAFF_MANUAL_SOURCE_KEY) return null;

  const charge = await tx.roadLiabilityCustomerCharge.findUnique({
    where: { roadLiabilityId },
  });

  if (!payment && charge?.contractPaymentId) {
    payment = await tx.contractPayment.findUnique({ where: { id: charge.contractPaymentId } });
  }
  if (!payment && charge) {
    payment = await tx.contractPayment.findFirst({
      where: {
        purpose: "ROAD_LIABILITY",
        targetId: charge.id,
        status: { in: ["CONFIRMED", "FAILED"] },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  const registry = await tx.roadChargeReferenceRegistry.findFirst({
    where: {
      roadLiabilityId,
      provenance: "STAFF_MANUAL",
      status: { in: ["RESERVED", "CONFIRMED"] },
    },
  });

  const observation = await tx.roadLiabilityObservation.findFirst({
    where: { liabilityId: roadLiabilityId, sourceKey: STAFF_MANUAL_SOURCE_KEY },
    orderBy: { receivedAt: "desc" },
  });

  return { liability, charge, payment, registry, observation };
}

async function reconcileStaffManualChargeOutcomeInTx(
  tx: Tx,
  params: ReconcileParams,
): Promise<StaffManualOutcomeReconcileResult> {
  const ctx = await loadStaffManualContext(tx, params);
  if (!ctx) return { action: "none" };

  const { liability, charge, payment, registry, observation } = ctx;
  const referenceNumber =
    observation?.externalReference ?? registry?.referenceNumber ?? liability.staffChargeDescription;

  if (
    liability.collectionStatus === "SETTLED" &&
    payment?.status === "CONFIRMED" &&
    charge?.contractPaymentId === payment.id &&
    registry?.status === "RESERVED"
  ) {
    const now = new Date();
    await tx.roadLiability.update({
      where: { id: liability.id },
      data: {
        staffChargeDescription: referenceNumber ?? liability.staffChargeDescription,
        staffEnteredAt: liability.staffEnteredAt ?? now,
        staffEnteredByUserId: liability.staffEnteredByUserId,
      },
    });
    if (registry) {
      await confirmStaffManualReference(tx, {
        registryId: registry.id,
        roadLiabilityId: liability.id,
      });
    }
    return { action: "finalized_success" };
  }

  if (
    registry?.status === "RESERVED" &&
    payment?.status === "FAILED" &&
    isStaffManualProvisionalCollectible(liability)
  ) {
    const confirmedWinner = await tx.contractPayment.findFirst({
      where: {
        purpose: "ROAD_LIABILITY",
        targetId: charge?.id ?? "",
        status: "CONFIRMED",
      },
    });
    if (confirmedWinner) return { action: "none" };

    await tx.roadLiability.update({
      where: { id: liability.id },
      data: { collectionStatus: "VOID" },
    });
    await releaseStaffManualReference(tx, { registryId: registry.id });
    return { action: "finalized_failure" };
  }

  if (
    liability.collectionStatus === "SETTLED" &&
    liability.staffEnteredAt != null &&
    registry?.status === "CONFIRMED"
  ) {
    return { action: "none" };
  }

  if (liability.collectionStatus === "VOID" && registry?.status === "RELEASED") {
    return { action: "none" };
  }

  return { action: "none" };
}

/** Idempotent staff-manual registry + display finalization from trusted payment outcomes. */
export async function reconcileStaffManualChargeOutcome(
  db: Db,
  params: ReconcileParams,
): Promise<StaffManualOutcomeReconcileResult> {
  return runInTx(db, (tx) => reconcileStaffManualChargeOutcomeInTx(tx, params));
}
