import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ContractStatus, RoadLiabilityType, StaffRoadChargeCategory } from "@prisma/client";
import {
  acquireSessionAdvisoryLock,
  releaseSessionAdvisoryLock,
} from "src/lib/db/advisory-lock";
import { withTransaction, type Tx } from "src/lib/db/transaction";
import { runIdempotent, fingerprintIdempotentPayload } from "src/lib/db/idempotency";
import { assertPositiveAedAmount } from "src/modules/contracts/payment/money";
import { contractError } from "src/modules/contracts/contracts.errors";
import { STAFF_MANUAL_SOURCE_KEY } from "src/modules/road-liabilities/road-liability.constants";
import {
  RoadChargeReferenceReason,
  roadChargeReferenceRegistrySchemaOutdatedError,
} from "src/modules/road-liabilities/road-charge-reference.errors";
import { isMissingDatabaseTableError } from "src/lib/db/prisma-error";
import { normalizeRoadChargeReferenceNumber } from "src/modules/road-liabilities/road-charge-reference.normalize";
import type { StaffManualChargeInput } from "src/modules/road-liabilities/staff-manual-charge.schema";
import {
  confirmStaffManualReference,
  findStaffManualRegistryByIdempotency,
  releaseStaffManualReference,
  acquireRoadChargeReferenceLock,
  reserveStaffManualReference,
} from "src/modules/road-liabilities/road-charge-reference.service";
import { createRoadLiabilityCustomerChargeService } from "src/modules/road-liabilities/road-liability-customer-charge.service";
import { writeOutboxEvent } from "src/lib/db/outbox";
import {
  ROAD_LIABILITY_OUTBOX_AGGREGATE,
  ROAD_LIABILITY_OUTBOX_EVENT,
} from "src/modules/road-liabilities/road-liability.constants";

const DEFERRED_REGISTER_STATUSES = new Set<ContractStatus>([
  "ACTIVE",
  "RETOUT",
  "REVIEW",
  "CLOSED",
]);

export const STAFF_DEFERRED_CHARGE_CONTRACT_LOCK_NS = "staff_deferred_charge_contract";

export function staffDeferredChargeIdempotencyScope(contractId: string): string {
  return `staff-deferred-charge:${contractId}`;
}

function mapCategoryToLiabilityType(category: StaffRoadChargeCategory): RoadLiabilityType {
  return category === "SALIK" ? "SALIK_TOLL" : "RTA_VIOLATION";
}

function staffDeferredObservationFingerprint(contractId: string, idempotencyKey: string): string {
  return createHash("sha256")
    .update(`staff-deferred:${contractId}:${idempotencyKey}`)
    .digest("hex");
}

function resolveStaffDeferredOccurredAt(
  contract: {
    status: ContractStatus;
    carOut: { occurredAt: Date } | null;
    carIn: { occurredAt: Date } | null;
  },
  now: Date,
): Date {
  if (contract.status === "CLOSED" && contract.carOut && contract.carIn) {
    const out = contract.carOut.occurredAt.getTime();
    const inAt = contract.carIn.occurredAt.getTime();
    if (inAt > out) {
      return new Date(Math.min(inAt - 60_000, Math.max(out + 60_000, now.getTime())));
    }
  }
  return now;
}

export function canRegisterDeferredRoadCharge(status: ContractStatus): boolean {
  return DEFERRED_REGISTER_STATUSES.has(status);
}

async function assertDeferredContractEligible(
  tx: Tx,
  contractId: string,
): Promise<{
  id: string;
  status: ContractStatus;
  vehicleId: number;
  companyId: number;
  carOut: { occurredAt: Date } | null;
  carIn: { occurredAt: Date } | null;
}> {
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    select: {
      id: true,
      status: true,
      vehicleId: true,
      companyId: true,
      carOut: { select: { occurredAt: true } },
      carIn: { select: { occurredAt: true } },
    },
  });
  if (!contract) throw contractError.notFound();
  if (!canRegisterDeferredRoadCharge(contract.status)) {
    throw contractError.roadLiabilityNotChargeable();
  }
  return contract;
}

async function createDeferredLiability(
  tx: Tx,
  contract: Awaited<ReturnType<typeof assertDeferredContractEligible>>,
  input: StaffManualChargeInput,
  actorUserId: number,
  idempotencyKey: string,
  now: Date,
): Promise<string> {
  assertPositiveAedAmount(input.amountAed);
  await acquireRoadChargeReferenceLock(tx, input.chargeCategory, input.referenceNumber);
  const fingerprint = staffDeferredObservationFingerprint(contract.id, idempotencyKey);
  const externalEventId = `staff-deferred:${idempotencyKey}`;
  const occurredAt = resolveStaffDeferredOccurredAt(contract, now);

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
      occurredAt,
      amount: input.amountAed,
      currency: "AED",
      authoritativeSourceKey: STAFF_MANUAL_SOURCE_KEY,
      authoritativeExternalReference: input.referenceNumber,
      confirmationStatus: "CONFIRMED",
      attributionStatus: "MATCHED",
      attributedContractId: contract.id,
      collectionStatus: "OPEN",
      confirmedAt: now,
      staffChargeCategory: input.chargeCategory,
      staffChargeDescription: input.referenceNumber,
      staffEnteredByUserId: actorUserId,
      staffEnteredAt: now,
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
      occurredAt,
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

  await writeOutboxEvent(tx, {
    eventType: ROAD_LIABILITY_OUTBOX_EVENT,
    aggregateType: ROAD_LIABILITY_OUTBOX_AGGREGATE,
    aggregateId: liability.id,
    dedupeKey: `${ROAD_LIABILITY_OUTBOX_EVENT}:${liability.id}`,
    payload: {
      liabilityId: liability.id,
      contractId: contract.id,
      amount: input.amountAed,
      type: liability.type,
    },
  });

  return liability.id;
}

export function createStaffDeferredRoadChargeService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const customerCharges = createRoadLiabilityCustomerChargeService(fastify);

  async function register(
    contractId: string,
    input: StaffManualChargeInput,
    actorUserId: number,
    idempotencyKey: string,
  ): Promise<{ roadLiabilityId: string }> {
    const run = async () => {
      await acquireSessionAdvisoryLock(prisma, STAFF_DEFERRED_CHARGE_CONTRACT_LOCK_NS, contractId);
      try {
        const referenceNormalized = normalizeRoadChargeReferenceNumber(input.referenceNumber);
        if (referenceNormalized.length === 0) {
          throw contractError.roadLiabilityNotChargeable();
        }

        const roadLiabilityId = await withTransaction(prisma, async (tx) => {
          const contract = await assertDeferredContractEligible(tx, contractId);
          const now = new Date();
          const liabilityId = await createDeferredLiability(
            tx,
            contract,
            input,
            actorUserId,
            idempotencyKey,
            now,
          );
          const registry = await findStaffManualRegistryByIdempotency(tx, {
            chargeCategory: input.chargeCategory,
            referenceNumber: input.referenceNumber,
            idempotencyKey,
          });
          if (registry) {
            await confirmStaffManualReference(tx, {
              registryId: registry.id,
              roadLiabilityId: liabilityId,
            });
          }
          return liabilityId;
        });

        const contract = await prisma.contract.findUnique({
          where: { id: contractId },
          select: { status: true },
        });
        if (contract?.status === "REVIEW" || contract?.status === "CLOSED") {
          await customerCharges.confirmWithIdempotency(
            roadLiabilityId,
            { customerChargeAmount: input.amountAed },
            actorUserId,
            `${idempotencyKey}:attach`,
          );
        }

        return { roadLiabilityId };
      } catch (err) {
        if (isMissingDatabaseTableError(err, "road_charge_reference_registry")) {
          throw roadChargeReferenceRegistrySchemaOutdatedError();
        }
        const appErr = err as { context?: { reason?: string } };
        if (
          appErr.context?.reason === RoadChargeReferenceReason.ALREADY_USED ||
          appErr.context?.reason === RoadChargeReferenceReason.IN_PROGRESS
        ) {
          throw err;
        }
        throw err;
      } finally {
        await releaseSessionAdvisoryLock(
          prisma,
          STAFF_DEFERRED_CHARGE_CONTRACT_LOCK_NS,
          contractId,
        );
      }
    };

    const fingerprint = fingerprintIdempotentPayload({ contractId, ...input });
    const outcome = await runIdempotent(
      prisma,
      {
        scope: staffDeferredChargeIdempotencyScope(contractId),
        key: idempotencyKey,
        fingerprint,
        resultRef: fingerprint,
      },
      run,
    );
    if (!outcome.deduped) {
      return outcome.result!;
    }
    const obs = await prisma.roadLiabilityObservation.findUnique({
      where: { ingestionFingerprint: staffDeferredObservationFingerprint(contractId, idempotencyKey) },
      select: { liabilityId: true },
    });
    if (!obs?.liabilityId) {
      throw contractError.roadLiabilityNotChargeable();
    }
    return { roadLiabilityId: obs.liabilityId };
  }

  return { register };
}
