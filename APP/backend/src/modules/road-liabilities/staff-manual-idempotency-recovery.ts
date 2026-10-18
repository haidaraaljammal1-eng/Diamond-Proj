import type { PrismaClient } from "@prisma/client";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import type { Tx } from "src/lib/db/transaction";
import { withTransaction } from "src/lib/db/transaction";
import { STAFF_MANUAL_SOURCE_KEY } from "src/modules/road-liabilities/road-liability.constants";
import { isStaffManualProvisionalCollectible } from "src/modules/road-liabilities/road-liability.mapper";

export type StaffManualProviderInvocationPhase =
  | "PROVEN_PRE_PROVIDER"
  | "POSSIBLY_SENT"
  | "TERMINAL";

export type StaffManualRecoveryState =
  | "none"
  | "orphan_idempotency_cleared"
  | "collection_resumed"
  | "awaiting_provider"
  | "manual_review";

export function staffManualChargeIdempotencyScope(contractId: string): string {
  return `staff-manual-charge:${contractId}`;
}

export function staffManualCollectIdempotencyKey(staffIdempotencyKey: string): string {
  return `${staffIdempotencyKey}:collect`;
}

export function staffManualCollectIdempotencyScope(roadLiabilityId: string): string {
  return `road-liability:off-session:${roadLiabilityId}`;
}

const STAFF_MANUAL_RECOVERY_LOCK_NS = "staff_manual_charge_recovery";

/** Serializes staff manual charge + dedupe recovery per contract (short claim tx). */
export const STAFF_MANUAL_CHARGE_CONTRACT_LOCK_NS = "staff_manual_charge_contract";

export const STAFF_MANUAL_IDEMPOTENCY_INFLIGHT_PREFIX = "inflight:";

export function staffManualIdempotencyInflightRef(fingerprint: string): string {
  return `${STAFF_MANUAL_IDEMPOTENCY_INFLIGHT_PREFIX}${fingerprint}`;
}

/** True only when the idempotency row was reserved but the charge effect never started. */
export function canClearOrphanStaffManualIdempotencyKey(
  resultRef: string | null | undefined,
  fingerprint: string,
): boolean {
  return resultRef === fingerprint;
}

export async function markStaffManualIdempotencyInflight(
  prisma: PrismaClient,
  contractId: string,
  idempotencyKey: string,
  fingerprint: string,
): Promise<void> {
  await prisma.idempotencyKey.updateMany({
    where: {
      scope: staffManualChargeIdempotencyScope(contractId),
      key: idempotencyKey,
      resultRef: fingerprint,
    },
    data: { resultRef: staffManualIdempotencyInflightRef(fingerprint) },
  });
}

/**
 * Classifies whether off-session collection may have reached Stripe.
 * Missing providerReference alone is treated as POSSIBLY_SENT once a payment or
 * off-session attempt row exists.
 */
export async function classifyStaffManualProviderInvocationPhase(
  db: PrismaClient | Tx,
  roadLiabilityId: string,
): Promise<StaffManualProviderInvocationPhase> {
  const liability = await db.roadLiability.findUnique({
    where: { id: roadLiabilityId },
    select: {
      authoritativeSourceKey: true,
      collectionStatus: true,
      staffEnteredAt: true,
      confirmationStatus: true,
    },
  });
  if (!liability || liability.authoritativeSourceKey !== STAFF_MANUAL_SOURCE_KEY) {
    return "TERMINAL";
  }

  if (liability.collectionStatus === "SETTLED" || liability.collectionStatus === "VOID") {
    return "TERMINAL";
  }

  const charge = await db.roadLiabilityCustomerCharge.findUnique({
    where: { roadLiabilityId },
    select: { id: true, operationalState: true },
  });

  if (!charge) {
    return "PROVEN_PRE_PROVIDER";
  }

  const payments = await db.contractPayment.findMany({
    where: { purpose: "ROAD_LIABILITY", targetId: charge.id },
    select: { id: true, status: true, providerReference: true },
    orderBy: { createdAt: "desc" },
  });

  const attempts = await db.contractPaymentOffSessionAttempt.findMany({
    where: { customerChargeId: charge.id },
    select: { id: true, status: true, providerReference: true },
    orderBy: { createdAt: "desc" },
  });

  if (payments.some((p) => p.status === "CONFIRMED")) {
    return "TERMINAL";
  }

  const blockingChargeStates = new Set(["PROCESSING", "REQUIRES_ACTION", "MANUAL_PENDING", "PAYMENT_LINK_READY"]);
  if (charge.operationalState && blockingChargeStates.has(charge.operationalState)) {
    return "POSSIBLY_SENT";
  }

  if (attempts.length > 0) {
    return "POSSIBLY_SENT";
  }

  if (payments.some((p) => p.status === "PENDING" || p.status === "PROCESSING")) {
    return "POSSIBLY_SENT";
  }

  if (payments.some((p) => p.providerReference != null)) {
    return "POSSIBLY_SENT";
  }

  const failedOnly =
    payments.length > 0 && payments.every((p) => p.status === "FAILED" || p.status === "CANCELLED");
  if (failedOnly && charge.operationalState === "FAILED") {
    return "TERMINAL";
  }

  if (
    isStaffManualProvisionalCollectible({
      authoritativeSourceKey: STAFF_MANUAL_SOURCE_KEY,
      confirmationStatus: liability.confirmationStatus,
      staffEnteredAt: liability.staffEnteredAt,
      collectionStatus: liability.collectionStatus,
    })
  ) {
    return "PROVEN_PRE_PROVIDER";
  }

  return "POSSIBLY_SENT";
}

/** Removes staff idempotency row only when no observation exists for this key. */
export async function clearOrphanStaffManualIdempotencyKey(
  prisma: PrismaClient,
  contractId: string,
  idempotencyKey: string,
  observationFingerprint: string,
  requestFingerprint: string,
): Promise<boolean> {
  return withTransaction(prisma, async (tx) => {
    await acquireAdvisoryLock(tx, STAFF_MANUAL_RECOVERY_LOCK_NS, contractId);
    const obs = await tx.roadLiabilityObservation.findUnique({
      where: { ingestionFingerprint: observationFingerprint },
    });
    if (obs?.liabilityId) return false;

    const registryForKey = await tx.roadChargeReferenceRegistry.findFirst({
      where: {
        staffManualIdempotencyKey: idempotencyKey,
        provenance: "STAFF_MANUAL",
        status: { in: ["RESERVED", "CONFIRMED"] },
      },
    });
    if (registryForKey) return false;

    const keyRow = await tx.idempotencyKey.findUnique({
      where: {
        scope_key: { scope: staffManualChargeIdempotencyScope(contractId), key: idempotencyKey },
      },
    });
    if (!keyRow) return false;
    if (!canClearOrphanStaffManualIdempotencyKey(keyRow.resultRef, requestFingerprint)) {
      return false;
    }

    const deleted = await tx.idempotencyKey.deleteMany({
      where: {
        scope: staffManualChargeIdempotencyScope(contractId),
        key: idempotencyKey,
      },
    });
    return deleted.count > 0;
  });
}

/** Drops collect idempotency reservation only when provider invocation is provably pre-provider. */
export async function clearCollectIdempotencyIfProvablyPreProvider(
  prisma: PrismaClient,
  roadLiabilityId: string,
  collectIdempotencyKey: string,
): Promise<boolean> {
  const phase = await classifyStaffManualProviderInvocationPhase(prisma, roadLiabilityId);
  if (phase !== "PROVEN_PRE_PROVIDER") return false;

  return withTransaction(prisma, async (tx) => {
    await acquireAdvisoryLock(tx, STAFF_MANUAL_RECOVERY_LOCK_NS, roadLiabilityId);
    const phaseLocked = await classifyStaffManualProviderInvocationPhase(tx, roadLiabilityId);
    if (phaseLocked !== "PROVEN_PRE_PROVIDER") return false;

    const deleted = await tx.idempotencyKey.deleteMany({
      where: {
        scope: staffManualCollectIdempotencyScope(roadLiabilityId),
        key: collectIdempotencyKey,
      },
    });
    return deleted.count > 0;
  });
}
