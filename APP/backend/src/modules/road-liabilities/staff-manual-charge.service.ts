import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { RoadLiabilityType, StaffRoadChargeCategory } from "@prisma/client";
import {
  acquireSessionAdvisoryLock,
  releaseSessionAdvisoryLock,
} from "src/lib/db/advisory-lock";
import type { Tx } from "src/lib/db/transaction";
import { withTransaction } from "src/lib/db/transaction";
import { runIdempotent, fingerprintIdempotentPayload } from "src/lib/db/idempotency";
import { assertPositiveAedAmount } from "src/modules/contracts/payment/money";
import { ErrorCode } from "src/constants/error-codes";
import { AppError } from "src/lib/errors/app-error";
import { STAFF_MANUAL_SOURCE_KEY } from "src/modules/road-liabilities/road-liability.constants";
import {
  RoadChargeReferenceReason,
  roadChargeReferenceRegistrySchemaOutdatedError,
} from "src/modules/road-liabilities/road-charge-reference.errors";
import { isMissingDatabaseTableError } from "src/lib/db/prisma-error";
import { normalizeRoadChargeReferenceNumber } from "src/modules/road-liabilities/road-charge-reference.normalize";
import { assertReturnedContractEligible } from "src/modules/road-liabilities/staff-returned-contracts.service";
import { createRoadLiabilityCollectionService } from "src/modules/road-liabilities/road-liability-collection.service";
import type { StaffManualChargeInput } from "src/modules/road-liabilities/staff-manual-charge.schema";
import type { z } from "zod";
import { StaffManualChargeResultSchema } from "src/modules/road-liabilities/staff-manual-charge.schema";
import {
  confirmStaffManualReference,
  findStaffManualRegistryByIdempotency,
  releaseStaffManualReference,
  reserveStaffManualReference,
} from "src/modules/road-liabilities/road-charge-reference.service";
import { reconcileStaffManualChargeOutcome } from "src/modules/road-liabilities/staff-manual-outcome.service";
import {
  classifyStaffManualProviderInvocationPhase,
  clearCollectIdempotencyIfProvablyPreProvider,
  clearOrphanStaffManualIdempotencyKey,
  staffManualCollectIdempotencyKey,
  staffManualIdempotencyInflightRef,
  STAFF_MANUAL_IDEMPOTENCY_INFLIGHT_PREFIX,
  STAFF_MANUAL_CHARGE_CONTRACT_LOCK_NS,
  staffManualCollectIdempotencyScope,
  staffManualChargeIdempotencyScope,
  type StaffManualRecoveryState,
} from "src/modules/road-liabilities/staff-manual-idempotency-recovery";
import { createContractPaymentService } from "src/modules/contracts/payment/contract-payment.service";

type StaffManualChargeResult = z.infer<typeof StaffManualChargeResultSchema>;
type StaffManualChargeStatus = StaffManualChargeResult["status"];

function normalizeStaffManualChargeStatus(status: string): StaffManualChargeStatus {
  if (
    status === "succeeded" ||
    status === "processing" ||
    status === "failed" ||
    status === "requires_action" ||
    status === "blocked"
  ) {
    return status;
  }
  return "processing";
}

function mapCategoryToLiabilityType(category: StaffRoadChargeCategory): RoadLiabilityType {
  return category === "SALIK" ? "SALIK_TOLL" : "RTA_VIOLATION";
}

function staffObservationFingerprint(contractId: string, idempotencyKey: string): string {
  return createHash("sha256")
    .update(`staff-manual:${contractId}:${idempotencyKey}`)
    .digest("hex");
}

async function createStaffManualProvisionalLiability(
  tx: Tx,
  contractId: string,
  input: StaffManualChargeInput,
  actorUserId: number,
  idempotencyKey: string,
): Promise<string> {
  assertPositiveAedAmount(input.amountAed);

  const contract = await assertReturnedContractEligible(tx, contractId);
  const now = new Date();
  const fingerprint = staffObservationFingerprint(contractId, idempotencyKey);
  const externalEventId = `staff:${idempotencyKey}`;

  const existingObs = await tx.roadLiabilityObservation.findUnique({
    where: { ingestionFingerprint: fingerprint },
    include: { liability: true },
  });
  if (existingObs?.liabilityId) {
    await reserveStaffManualReference(tx, {
      chargeCategory: input.chargeCategory,
      referenceNumber: input.referenceNumber,
      idempotencyKey,
      actorUserId,
      roadLiabilityId: existingObs.liabilityId,
    });
    return existingObs.liabilityId;
  }

  const liability = await tx.roadLiability.create({
    data: {
      type: mapCategoryToLiabilityType(input.chargeCategory),
      vehicleId: contract.vehicleId,
      occurredAt: now,
      amount: input.amountAed,
      currency: "AED",
      authoritativeSourceKey: STAFF_MANUAL_SOURCE_KEY,
      confirmationStatus: "CONFIRMED",
      attributionStatus: "MATCHED",
      attributedContractId: contract.id,
      collectionStatus: "OPEN",
      confirmedAt: now,
      staffChargeCategory: input.chargeCategory,
      staffEnteredByUserId: actorUserId,
    },
  });

  await tx.roadLiabilityObservation.create({
    data: {
      sourceKey: STAFF_MANUAL_SOURCE_KEY,
      authoritative: false,
      externalEventId,
      ingestionFingerprint: fingerprint,
      eventType: mapCategoryToLiabilityType(input.chargeCategory),
      vehicleId: contract.vehicleId,
      occurredAt: now,
      amount: input.amountAed,
      currency: "AED",
      externalReference: input.referenceNumber,
      liabilityId: liability.id,
      receivedAt: now,
    },
  });

  await reserveStaffManualReference(tx, {
    chargeCategory: input.chargeCategory,
    referenceNumber: input.referenceNumber,
    idempotencyKey,
    actorUserId,
    roadLiabilityId: liability.id,
  });

  return liability.id;
}

async function finalizeStaffManualSuccess(
  prisma: FastifyInstance["prisma"],
  roadLiabilityId: string,
  input: StaffManualChargeInput,
  actorUserId: number,
  idempotencyKey: string,
): Promise<void> {
  await withTransaction(prisma, async (tx) => {
    const registry = await findStaffManualRegistryByIdempotency(tx, {
      chargeCategory: input.chargeCategory,
      referenceNumber: input.referenceNumber,
      idempotencyKey,
    });
    const now = new Date();
    await tx.roadLiability.update({
      where: { id: roadLiabilityId },
      data: {
        staffChargeDescription: input.referenceNumber,
        staffEnteredAt: now,
        staffEnteredByUserId: actorUserId,
      },
    });
    if (registry) {
      await confirmStaffManualReference(tx, { registryId: registry.id, roadLiabilityId });
    }
  });
}

async function finalizeStaffManualDefinitiveFailure(
  prisma: FastifyInstance["prisma"],
  roadLiabilityId: string,
  idempotencyKey: string,
  input: StaffManualChargeInput,
): Promise<void> {
  const registry = await findStaffManualRegistryByIdempotency(prisma, {
    chargeCategory: input.chargeCategory,
    referenceNumber: input.referenceNumber,
    idempotencyKey,
  });
  await withTransaction(prisma, async (tx) => {
    await tx.roadLiability.update({
      where: { id: roadLiabilityId },
      data: { collectionStatus: "VOID" },
    });
    if (registry) {
      await releaseStaffManualReference(tx, { registryId: registry.id });
    } else {
      await releaseStaffManualReference(tx, { roadLiabilityId });
    }
  });
}

function mapCollectionViewToStaffStatus(
  operationalState: string | null | undefined,
): StaffManualChargeStatus {
  if (operationalState === "paid") return "succeeded";
  if (operationalState === "failed") return "failed";
  if (operationalState === "requires_action") return "requires_action";
  return "processing";
}

export function createStaffManualChargeService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const collection = createRoadLiabilityCollectionService(fastify);
  const contractPayments = createContractPaymentService(prisma);

  async function reconcileInFlightStaffManualPayments(roadLiabilityId: string): Promise<void> {
    const charge = await prisma.roadLiabilityCustomerCharge.findUnique({
      where: { roadLiabilityId },
      select: { id: true },
    });
    if (!charge) return;
    const inFlight = await prisma.contractPayment.findMany({
      where: {
        purpose: "ROAD_LIABILITY",
        targetId: charge.id,
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });
    for (const payment of inFlight) {
      if (payment.providerReference) {
        await contractPayments.reconcilePaymentWithProvider(payment.id);
      }
    }
  }

  async function buildDedupedStaffManualResult(
    roadLiabilityId: string,
    recoveryState: StaffManualRecoveryState,
  ): Promise<StaffManualChargeResult> {
    await reconcileStaffManualChargeOutcome(prisma, { roadLiabilityId });
    const view = await collection.getCollection(roadLiabilityId);
    const status = mapCollectionViewToStaffStatus(view.operationalState);
    const paid = view.operationalState === "paid";
    return {
      roadLiabilityId,
      status,
      operationalState: view.operationalState ?? null,
      invoicePending: paid,
      failure: view.failure ?? null,
      recoveryState,
    };
  }

  async function applySyncStaffManualFinalization(
    roadLiabilityId: string,
    collectStatus: string,
    input: StaffManualChargeInput,
    actorUserId: number,
    idempotencyKey: string,
  ): Promise<void> {
    const status = normalizeStaffManualChargeStatus(collectStatus);
    if (status === "succeeded") {
      await finalizeStaffManualSuccess(prisma, roadLiabilityId, input, actorUserId, idempotencyKey);
    } else if (status === "failed") {
      await finalizeStaffManualDefinitiveFailure(prisma, roadLiabilityId, idempotencyKey, input);
    }
  }

  async function resolveStaffManualRoadLiabilityIdForDedupe(
    idempotencyKey: string,
    obsFingerprint: string,
  ): Promise<string | null> {
    const obs = await prisma.roadLiabilityObservation.findUnique({
      where: { ingestionFingerprint: obsFingerprint },
      select: { liabilityId: true },
    });
    if (obs?.liabilityId) return obs.liabilityId;

    const registry = await prisma.roadChargeReferenceRegistry.findFirst({
      where: {
        staffManualIdempotencyKey: idempotencyKey,
        provenance: "STAFF_MANUAL",
        status: { in: ["RESERVED", "CONFIRMED"] },
        roadLiabilityId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { roadLiabilityId: true },
    });
    return registry?.roadLiabilityId ?? null;
  }

  async function handleDedupedStaffManualCharge(
    contractId: string,
    input: StaffManualChargeInput,
    actorUserId: number,
    idempotencyKey: string,
  ): Promise<StaffManualChargeResult | "orphan_cleared_retry"> {
    const obsFingerprint = staffObservationFingerprint(contractId, idempotencyKey);

    const deadline = Date.now() + 12_000;
    let orphanClearAttempted = false;

    while (Date.now() < deadline) {
      const roadLiabilityId = await resolveStaffManualRoadLiabilityIdForDedupe(
        idempotencyKey,
        obsFingerprint,
      );
      if (roadLiabilityId) {
        const phase = await classifyStaffManualProviderInvocationPhase(prisma, roadLiabilityId);

        if (phase === "PROVEN_PRE_PROVIDER") {
          const staffChargeKey = await prisma.idempotencyKey.findUnique({
            where: {
              scope_key: {
                scope: staffManualChargeIdempotencyScope(contractId),
                key: idempotencyKey,
              },
            },
          });
          if (staffChargeKey?.resultRef?.startsWith(STAFF_MANUAL_IDEMPOTENCY_INFLIGHT_PREFIX)) {
            await new Promise((resolve) => setTimeout(resolve, 25));
            continue;
          }
          const collectKey = await prisma.idempotencyKey.findUnique({
            where: {
              scope_key: {
                scope: staffManualCollectIdempotencyScope(roadLiabilityId),
                key: staffManualCollectIdempotencyKey(idempotencyKey),
              },
            },
          });
          if (!collectKey) {
            await new Promise((resolve) => setTimeout(resolve, 25));
            continue;
          }
          await clearCollectIdempotencyIfProvablyPreProvider(
            prisma,
            roadLiabilityId,
            staffManualCollectIdempotencyKey(idempotencyKey),
          );
          const collectResult = await collection.collectOffSession(
            roadLiabilityId,
            { customerChargeAmount: input.amountAed },
            actorUserId,
            staffManualCollectIdempotencyKey(idempotencyKey),
          );
          await applySyncStaffManualFinalization(
            roadLiabilityId,
            collectResult.status,
            input,
            actorUserId,
            idempotencyKey,
          );
          return {
            roadLiabilityId,
            status: normalizeStaffManualChargeStatus(collectResult.status),
            operationalState: collectResult.operationalState,
            failure: collectResult.failure ?? null,
            invoicePending: collectResult.status === "succeeded",
            recoveryState: "collection_resumed",
          };
        }

        if (phase === "POSSIBLY_SENT") {
          await reconcileInFlightStaffManualPayments(roadLiabilityId);
          const result = await buildDedupedStaffManualResult(roadLiabilityId, "awaiting_provider");
          const stillInFlight = result.status === "processing" || result.status === "requires_action";
          const charge = await prisma.roadLiabilityCustomerCharge.findUnique({
            where: { roadLiabilityId },
            include: {
              offSessionAttempts: { orderBy: { createdAt: "desc" }, take: 1 },
            },
          });
          const hasProviderRef =
            charge?.offSessionAttempts.some((a) => a.providerReference != null) ?? false;
          if (stillInFlight && !hasProviderRef) {
            return { ...result, recoveryState: "manual_review" };
          }
          return result;
        }

        return buildDedupedStaffManualResult(roadLiabilityId, "none");
      }

      if (!orphanClearAttempted && Date.now() > deadline - 9_000) {
        orphanClearAttempted = true;
        const cleared = await clearOrphanStaffManualIdempotencyKey(
          prisma,
          contractId,
          idempotencyKey,
          obsFingerprint,
          fingerprintIdempotentPayload({ contractId, ...input }),
        );
        if (cleared) {
          return "orphan_cleared_retry";
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new AppError({
      code: ErrorCode.CONFLICT,
      message: "Staff manual charge idempotency could not be recovered",
      context: { reason: "STAFF_MANUAL_IDEMPOTENCY_UNRESOLVED" },
    });
  }

  async function manualChargeAndCollect(
    contractId: string,
    input: StaffManualChargeInput,
    actorUserId: number,
    idempotencyKey: string,
    options?: { allowOrphanIdempotencyRetry?: boolean },
  ): Promise<StaffManualChargeResult> {
    const fingerprint = fingerprintIdempotentPayload({ contractId, ...input });

    await acquireSessionAdvisoryLock(prisma, STAFF_MANUAL_CHARGE_CONTRACT_LOCK_NS, contractId);
    try {
      return await manualChargeAndCollectUnderContractLock(
        contractId,
        input,
        actorUserId,
        idempotencyKey,
        fingerprint,
        options,
      );
    } finally {
      await releaseSessionAdvisoryLock(prisma, STAFF_MANUAL_CHARGE_CONTRACT_LOCK_NS, contractId);
    }
  }

  async function manualChargeAndCollectUnderContractLock(
    contractId: string,
    input: StaffManualChargeInput,
    actorUserId: number,
    idempotencyKey: string,
    fingerprint: string,
    options?: { allowOrphanIdempotencyRetry?: boolean },
  ): Promise<StaffManualChargeResult> {
    const idempotencyClaimed = await prisma.idempotencyKey.findUnique({
      where: {
        scope_key: { scope: staffManualChargeIdempotencyScope(contractId), key: idempotencyKey },
      },
    });
    if (!idempotencyClaimed) {
      const referenceNormalized = normalizeRoadChargeReferenceNumber(input.referenceNumber);
      const activeRef = await prisma.roadChargeReferenceRegistry.findFirst({
        where: {
          chargeCategory: input.chargeCategory,
          referenceNormalized,
          status: { in: ["RESERVED", "CONFIRMED"] },
        },
      });
      if (activeRef) {
        if (activeRef.status === "CONFIRMED") {
          throw new AppError({
            code: ErrorCode.CONFLICT,
            message: "Reference already used",
            context: { reason: RoadChargeReferenceReason.ALREADY_USED },
          });
        }
        if (activeRef.staffManualIdempotencyKey !== idempotencyKey) {
          throw new AppError({
            code: ErrorCode.CONFLICT,
            message: "Reference in progress",
            context: { reason: RoadChargeReferenceReason.IN_PROGRESS },
          });
        }
      }
    }

    let outcome;
    try {
      outcome = await runIdempotent(
        prisma,
        {
          scope: staffManualChargeIdempotencyScope(contractId),
          key: idempotencyKey,
          fingerprint,
          resultRef: staffManualIdempotencyInflightRef(fingerprint),
        },
        async () => {
          const roadLiabilityId = await withTransaction(prisma, async (tx) =>
            createStaffManualProvisionalLiability(tx, contractId, input, actorUserId, idempotencyKey),
          );
          const collectResult = await collection.collectOffSession(
            roadLiabilityId,
            { customerChargeAmount: input.amountAed },
            actorUserId,
            staffManualCollectIdempotencyKey(idempotencyKey),
          );
          return { roadLiabilityId, collectResult };
        },
      );
    } catch (err) {
      if (isMissingDatabaseTableError(err, "road_charge_reference_registry")) {
        throw roadChargeReferenceRegistrySchemaOutdatedError();
      }
      if (
        err instanceof AppError &&
        (err.context?.reason === RoadChargeReferenceReason.ALREADY_USED ||
          err.context?.reason === RoadChargeReferenceReason.IN_PROGRESS)
      ) {
        await prisma.idempotencyKey.deleteMany({
          where: { scope: staffManualChargeIdempotencyScope(contractId), key: idempotencyKey },
        });
      } else {
        const obs = await prisma.roadLiabilityObservation.findUnique({
          where: { ingestionFingerprint: staffObservationFingerprint(contractId, idempotencyKey) },
          select: { liabilityId: true },
        });
        if (!obs?.liabilityId) {
          await prisma.idempotencyKey.deleteMany({
            where: { scope: staffManualChargeIdempotencyScope(contractId), key: idempotencyKey },
          });
        }
      }
      throw err;
    }

    if (outcome.deduped || !outcome.result) {
      const deduped = await handleDedupedStaffManualCharge(
        contractId,
        input,
        actorUserId,
        idempotencyKey,
      );
      if (deduped === "orphan_cleared_retry") {
        if (options?.allowOrphanIdempotencyRetry) {
          throw new AppError({
            code: ErrorCode.CONFLICT,
            message: "Staff manual charge idempotency could not be recovered",
            context: { reason: "STAFF_MANUAL_IDEMPOTENCY_UNRESOLVED" },
          });
        }
        const retried = await manualChargeAndCollectUnderContractLock(
          contractId,
          input,
          actorUserId,
          idempotencyKey,
          fingerprint,
          { allowOrphanIdempotencyRetry: true },
        );
        return {
          ...retried,
          recoveryState:
            retried.recoveryState === "none" ? "orphan_idempotency_cleared" : retried.recoveryState,
        };
      }
      return deduped;
    }

    const result = outcome.result;
    const status = normalizeStaffManualChargeStatus(result.collectResult.status);

    await applySyncStaffManualFinalization(
      result.roadLiabilityId,
      result.collectResult.status,
      input,
      actorUserId,
      idempotencyKey,
    );

    return {
      roadLiabilityId: result.roadLiabilityId,
      status,
      operationalState: result.collectResult.operationalState,
      failure: result.collectResult.failure ?? null,
      invoicePending: result.collectResult.status === "succeeded",
      recoveryState: "none",
    };
  }

  return { manualChargeAndCollect };
}
