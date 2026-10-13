import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { RoadLiabilityType, StaffRoadChargeCategory } from "@prisma/client";
import { withTransaction } from "src/lib/db/transaction";
import { runIdempotent, fingerprintIdempotentPayload } from "src/lib/db/idempotency";
import { assertPositiveAedAmount } from "src/modules/contracts/payment/money";
import {
  STAFF_MANUAL_SOURCE_KEY,
} from "src/modules/road-liabilities/road-liability.constants";
import { assertReturnedContractEligible } from "src/modules/road-liabilities/staff-returned-contracts.service";
import { createRoadLiabilityCollectionService } from "src/modules/road-liabilities/road-liability-collection.service";
import type {
  StaffManualChargeInput,
} from "src/modules/road-liabilities/staff-manual-charge.schema";
import type { z } from "zod";
import { StaffManualChargeResultSchema } from "src/modules/road-liabilities/staff-manual-charge.schema";

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

export function createStaffManualChargeService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const collection = createRoadLiabilityCollectionService(fastify);

  async function createStaffManualLiability(
    contractId: string,
    input: StaffManualChargeInput,
    actorUserId: number,
    idempotencyKey: string,
  ): Promise<string> {
    assertPositiveAedAmount(input.amountAed);

    const contract = await assertReturnedContractEligible(prisma, contractId);
    const now = new Date();
    const fingerprint = staffObservationFingerprint(contractId, idempotencyKey);
    const externalEventId = `staff:${idempotencyKey}`;

    return withTransaction(prisma, async (tx) => {
      const existingObs = await tx.roadLiabilityObservation.findUnique({
        where: { ingestionFingerprint: fingerprint },
        include: { liability: true },
      });
      if (existingObs?.liabilityId) return existingObs.liabilityId;

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
          staffEnteredByUserId: actorUserId,
          staffEnteredAt: now,
          staffChargeCategory: input.chargeCategory,
          staffChargeDescription: null,
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
          liabilityId: liability.id,
          receivedAt: now,
        },
      });

      return liability.id;
    });
  }

  async function manualChargeAndCollect(
    contractId: string,
    input: StaffManualChargeInput,
    actorUserId: number,
    idempotencyKey: string,
  ): Promise<StaffManualChargeResult> {
    const fingerprint = fingerprintIdempotentPayload({ contractId, ...input });

    const outcome = await runIdempotent(
      prisma,
      {
        scope: `staff-manual-charge:${contractId}`,
        key: idempotencyKey,
        fingerprint,
      },
      async () => {
        const roadLiabilityId = await createStaffManualLiability(
          contractId,
          input,
          actorUserId,
          idempotencyKey,
        );
        const collectResult = await collection.collectOffSession(
          roadLiabilityId,
          { customerChargeAmount: input.amountAed },
          actorUserId,
          `${idempotencyKey}:collect`,
        );
        return { roadLiabilityId, collectResult };
      },
    );

    if (outcome.deduped || !outcome.result) {
      const fingerprint = staffObservationFingerprint(contractId, idempotencyKey);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const obs = await prisma.roadLiabilityObservation.findUnique({
          where: { ingestionFingerprint: fingerprint },
        });
        if (obs?.liabilityId) {
          const view = await collection.getCollection(obs.liabilityId);
          const paid = view.operationalState === "paid";
          const status: StaffManualChargeStatus = paid
            ? "succeeded"
            : view.operationalState === "failed"
              ? "failed"
              : view.operationalState === "requires_action"
                ? "requires_action"
                : "processing";
          return {
            roadLiabilityId: obs.liabilityId,
            status,
            operationalState: view.operationalState ?? null,
            invoicePending: paid,
            failure: null,
          };
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      return {
        roadLiabilityId: "",
        status: "processing",
        operationalState: "processing",
        invoicePending: false,
        failure: null,
      };
    }

    const result = outcome.result;
    return {
      roadLiabilityId: result.roadLiabilityId,
      status: normalizeStaffManualChargeStatus(result.collectResult.status),
      operationalState: result.collectResult.operationalState,
      failure: result.collectResult.failure ?? null,
      invoicePending: result.collectResult.status === "succeeded",
    };
  }

  return { manualChargeAndCollect, createStaffManualLiability };
}
