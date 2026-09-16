import type { FastifyInstance } from "fastify";
import type { ContractStatus } from "@prisma/client";
import { acquireAdvisoryLocks } from "src/lib/db/advisory-lock";
import { withTransaction, type Tx } from "src/lib/db/transaction";
import { runIdempotent, fingerprintIdempotentPayload } from "src/lib/db/idempotency";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import {
  CONTRACT_RECONCILE_LOCK_NS,
  ROAD_LIABILITY_CHARGE_LOCK_NS,
} from "src/modules/contracts/contracts.constants";
import { contractError } from "src/modules/contracts/contracts.errors";
import {
  deriveCustomerChargeAdjustment,
  mapRoadLiabilityTypeToReconLineType,
  reconciliationTotalsFromLines,
  ROAD_LIABILITY_RECON_SOURCE_DOMAIN,
  roadLiabilityReconDescription,
} from "src/modules/contracts/contracts-road-liability-charge";
import {
  buildRoadLiabilityChargeProposal,
  isChargeableRoadLiability,
} from "src/modules/road-liabilities/road-liability.mapper";
import { roadLiabilityNotFoundError } from "src/modules/road-liabilities/road-liability.errors";
import type { ConfirmRoadLiabilityChargeSchema } from "src/modules/contracts/contracts.schema";
import type { z } from "zod";
import type { RoadLiabilityCustomerChargeReview } from "src/modules/road-liabilities/road-liability.schema";

type ConfirmInput = z.infer<typeof ConfirmRoadLiabilityChargeSchema>;

function throwChargeAdjustmentError(
  reason: "INVALID_CUSTOMER_CHARGE" | "CUSTOMER_CHARGE_BELOW_OFFICIAL" | "ADJUSTMENT_REASON_REQUIRED",
): never {
  if (reason === "CUSTOMER_CHARGE_BELOW_OFFICIAL") throw contractError.customerChargeBelowOfficial();
  if (reason === "ADJUSTMENT_REASON_REQUIRED") throw contractError.adjustmentReasonRequired();
  throw contractError.invalidCustomerCharge();
}

function destinationForStatus(
  status: ContractStatus,
): "RECONCILIATION" | "POST_CLOSE_RECEIVABLE" | null {
  if (status === "REVIEW") return "RECONCILIATION";
  if (status === "CLOSED") return "POST_CLOSE_RECEIVABLE";
  return null;
}

function lockedFromCharge(charge: {
  destinationType: "RECONCILIATION" | "POST_CLOSE_RECEIVABLE";
  officialAmountSnapshot: number;
  customerChargeAmount: number;
  adjustmentAmount: number;
  adjustmentReason: string | null;
  adjustmentNote: string | null;
  confirmedAt: Date;
  reconciliationLineId: string | null;
  postCloseReceivable: { id: string } | null;
}): RoadLiabilityCustomerChargeReview {
  return {
    state: "LOCKED",
    destination: charge.destinationType,
    officialAmount: charge.officialAmountSnapshot,
    currency: "AED",
    suggestedCustomerChargeAmount: charge.customerChargeAmount,
    minimumCustomerChargeAmount: charge.officialAmountSnapshot,
    customerChargeAmount: charge.customerChargeAmount,
    adjustmentAmount: charge.adjustmentAmount,
    adjustmentReason: charge.adjustmentReason,
    adjustmentNote: charge.adjustmentNote,
    confirmedAt: charge.confirmedAt,
    reconciliationLineId: charge.reconciliationLineId,
    postCloseReceivableId: charge.postCloseReceivable?.id ?? null,
    reasonCode: null,
  };
}

export function createRoadLiabilityCustomerChargeService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function loadCharge(tx: Tx | typeof prisma, roadLiabilityId: string) {
    return tx.roadLiabilityCustomerCharge.findUnique({
      where: { roadLiabilityId },
      include: { postCloseReceivable: { select: { id: true } } },
    });
  }

  async function getReview(roadLiabilityId: string): Promise<RoadLiabilityCustomerChargeReview> {
    const liability = await prisma.roadLiability.findUnique({
      where: { id: roadLiabilityId },
      include: { attributedContract: { select: { id: true, status: true, carIn: { select: { id: true } } } } },
    });
    if (!liability) throw roadLiabilityNotFoundError();

    const existing = await loadCharge(prisma, roadLiabilityId);
    if (existing) return lockedFromCharge(existing);

    const empty = {
      officialAmount: liability.amount ?? 0,
      currency: liability.currency ?? "AED",
      suggestedCustomerChargeAmount: liability.amount ?? 0,
      minimumCustomerChargeAmount: liability.amount ?? 0,
      customerChargeAmount: null,
      adjustmentAmount: null,
      adjustmentReason: null,
      adjustmentNote: null,
      confirmedAt: null,
      reconciliationLineId: null,
      postCloseReceivableId: null,
    };

    if (liability.confirmationStatus === "PENDING_CONFIRMATION") {
      return { state: "NOT_ELIGIBLE", destination: null, reasonCode: "GPS_PENDING", ...empty };
    }
    if (liability.attributionStatus === "UNMATCHED") {
      return { state: "NOT_ELIGIBLE", destination: null, reasonCode: "UNMATCHED", ...empty };
    }
    if (liability.attributionStatus === "AMBIGUOUS") {
      return { state: "NOT_ELIGIBLE", destination: null, reasonCode: "AMBIGUOUS", ...empty };
    }
    if (!liability.attributedContractId || !liability.attributedContract) {
      return { state: "NOT_ELIGIBLE", destination: null, reasonCode: "NO_CONTRACT", ...empty };
    }
    if (!isChargeableRoadLiability(liability) || liability.amount == null) {
      return { state: "NOT_ELIGIBLE", destination: null, reasonCode: "NOT_CHARGEABLE", ...empty };
    }

    const destination = destinationForStatus(liability.attributedContract.status);
    if (!destination) {
      return { state: "NOT_ELIGIBLE", destination: null, reasonCode: "CONTRACT_NOT_READY", ...empty };
    }
    if (destination === "RECONCILIATION" && !liability.attributedContract.carIn) {
      return { state: "NOT_ELIGIBLE", destination: null, reasonCode: "CONTRACT_NOT_READY", ...empty };
    }

    const proposal = buildRoadLiabilityChargeProposal({ amount: liability.amount });
    return {
      state: "AVAILABLE",
      destination,
      officialAmount: proposal.officialAmount,
      currency: liability.currency ?? "AED",
      suggestedCustomerChargeAmount: proposal.suggestedCustomerChargeAmount,
      minimumCustomerChargeAmount: proposal.minimumCustomerChargeAmount,
      customerChargeAmount: null,
      adjustmentAmount: null,
      adjustmentReason: null,
      adjustmentNote: null,
      confirmedAt: null,
      reconciliationLineId: null,
      postCloseReceivableId: null,
      reasonCode: null,
    };
  }

  async function persistCharge(
    tx: Tx,
    input: {
      liability: {
        id: string;
        type: "RTA_VIOLATION" | "SALIK_TOLL" | "SALIK_VIOLATION";
        amount: number;
        attributedContractId: string;
        authoritativeExternalReference: string | null;
      };
      contract: {
        id: string;
        status: ContractStatus;
        reconciliation: { id: string } | null;
        carIn: { id: string } | null;
      };
      destination: "RECONCILIATION" | "POST_CLOSE_RECEIVABLE";
      derived: Extract<ReturnType<typeof deriveCustomerChargeAdjustment>, { ok: true }>;
      adjustmentNote: string | null;
      actorUserId: number;
    },
  ) {
    const now = new Date();
    const charge = await tx.roadLiabilityCustomerCharge.create({
      data: {
        roadLiabilityId: input.liability.id,
        contractId: input.contract.id,
        destinationType: input.destination,
        officialAmountSnapshot: input.derived.officialAmount,
        customerChargeAmount: input.derived.customerChargeAmount,
        adjustmentAmount: input.derived.adjustmentAmount,
        adjustmentReason: input.derived.adjustmentReason,
        adjustmentNote: input.adjustmentNote,
        confirmedByUserId: input.actorUserId,
        confirmedAt: now,
      },
    });

    if (input.destination === "RECONCILIATION") {
      if (!input.contract.carIn) throw contractError.carInRequired();
      let reconciliationId = input.contract.reconciliation?.id;
      if (!reconciliationId) {
        const created = await tx.contractReconciliation.create({
          data: {
            contractId: input.contract.id,
            chargesTotal: 0,
            depositAmount: 0,
            deductions: 0,
            finalAmount: 0,
          },
        });
        reconciliationId = created.id;
      }
      const line = await tx.contractReconciliationLine.create({
        data: {
          reconciliationId,
          type: mapRoadLiabilityTypeToReconLineType(input.liability.type),
          description: roadLiabilityReconDescription(input.liability.type),
          amount: input.derived.customerChargeAmount,
          externalReference: input.liability.authoritativeExternalReference,
          sourceDomain: ROAD_LIABILITY_RECON_SOURCE_DOMAIN,
          roadLiabilityId: input.liability.id,
          officialAmountSnapshot: input.derived.officialAmount,
          adjustmentAmount: input.derived.adjustmentAmount,
          adjustmentReason: input.derived.adjustmentReason,
          adjustmentNote: input.adjustmentNote,
          confirmedByUserId: input.actorUserId,
          confirmedAt: now,
        },
      });
      await tx.roadLiabilityCustomerCharge.update({
        where: { id: charge.id },
        data: { reconciliationLineId: line.id },
      });
      const allLines = await tx.contractReconciliationLine.findMany({ where: { reconciliationId } });
      await tx.contractReconciliation.update({
        where: { id: reconciliationId },
        data: {
          ...reconciliationTotalsFromLines(allLines),
          depositAmount: 0,
          deductions: 0,
        },
      });
      return;
    }

    await tx.contractPostCloseReceivable.create({
      data: {
        contractId: input.contract.id,
        customerChargeId: charge.id,
        roadLiabilityId: input.liability.id,
        amount: input.derived.customerChargeAmount,
        currency: "AED",
        status: "OPEN",
      },
    });
  }

  function samePayloadLocked(
    existing: { customerChargeAmount: number; adjustmentReason: string | null },
    derived: { customerChargeAmount: number; adjustmentReason: string | null },
  ): boolean {
    return (
      existing.customerChargeAmount === derived.customerChargeAmount &&
      (existing.adjustmentReason ?? null) === derived.adjustmentReason
    );
  }

  async function confirm(
    roadLiabilityId: string,
    input: ConfirmInput,
    actorUserId: number,
    options?: { expectedContractId?: string; expectedDestination?: "RECONCILIATION" | "POST_CLOSE_RECEIVABLE" },
  ) {
    const liability = await prisma.roadLiability.findUnique({ where: { id: roadLiabilityId } });
    if (!liability) throw roadLiabilityNotFoundError();
    if (!liability.attributedContractId) throw contractError.roadLiabilityNotChargeable();
    if (options?.expectedContractId && liability.attributedContractId !== options.expectedContractId) {
      throw contractError.roadLiabilityContractMismatch();
    }
    const contractId = liability.attributedContractId;

    return withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLocks(tx, [
        { namespace: CONTRACT_RECONCILE_LOCK_NS, entityId: contractId },
        { namespace: ROAD_LIABILITY_CHARGE_LOCK_NS, entityId: roadLiabilityId },
      ]);

      const contract = await tx.contract.findUnique({
        where: { id: contractId },
        include: { carIn: true, carOut: true, reconciliation: true },
      });
      if (!contract) throw contractError.notFound();
      if (options?.expectedContractId && contract.id !== options.expectedContractId) {
        throw contractError.roadLiabilityContractMismatch();
      }

      const fresh = await tx.roadLiability.findUnique({ where: { id: roadLiabilityId } });
      if (!fresh) throw roadLiabilityNotFoundError();
      if (fresh.attributedContractId !== contractId) throw contractError.roadLiabilityContractMismatch();
      if (!isChargeableRoadLiability(fresh) || fresh.amount == null) {
        throw contractError.roadLiabilityNotChargeable();
      }

      const destination = destinationForStatus(contract.status);
      if (!destination) throw contractError.roadLiabilityNotChargeable();
      if (options?.expectedDestination && destination !== options.expectedDestination) {
        throw contractError.roadLiabilityNotChargeable();
      }
      if (destination === "RECONCILIATION" && !contract.carIn) throw contractError.carInRequired();
      if (destination === "POST_CLOSE_RECEIVABLE") {
        if (!contract.carOut || !contract.carIn) throw contractError.roadLiabilityNotChargeable();
        const occurred = fresh.occurredAt.getTime();
        if (
          occurred < contract.carOut.occurredAt.getTime() ||
          occurred >= contract.carIn.occurredAt.getTime()
        ) {
          throw contractError.roadLiabilityNotChargeable();
        }
      }

      const derived = deriveCustomerChargeAdjustment({
        officialAmount: fresh.amount,
        customerChargeAmount: input.customerChargeAmount,
        adjustmentReason: input.adjustmentReason,
      });
      if (!derived.ok) throwChargeAdjustmentError(derived.reason);

      const existing = await loadCharge(tx, roadLiabilityId);
      if (existing) {
        if (samePayloadLocked(existing, derived)) return lockedFromCharge(existing);
        throw contractError.roadLiabilityAlreadyCharged();
      }

      try {
        await persistCharge(tx, {
          liability: {
            id: fresh.id,
            type: fresh.type,
            amount: fresh.amount,
            attributedContractId: contractId,
            authoritativeExternalReference: fresh.authoritativeExternalReference,
          },
          contract,
          destination,
          derived,
          adjustmentNote: input.adjustmentNote?.trim() || null,
          actorUserId,
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const raced = await loadCharge(tx, roadLiabilityId);
        if (raced && samePayloadLocked(raced, derived)) return lockedFromCharge(raced);
        throw contractError.roadLiabilityAlreadyCharged();
      }

      const created = await loadCharge(tx, roadLiabilityId);
      if (!created) throw contractError.roadLiabilityAlreadyCharged();
      return lockedFromCharge(created);
    });
  }

  async function confirmWithIdempotency(
    roadLiabilityId: string,
    input: ConfirmInput,
    actorUserId: number,
    idempotencyKey?: string,
    options?: { expectedContractId?: string; expectedDestination?: "RECONCILIATION" | "POST_CLOSE_RECEIVABLE" },
  ) {
    const run = () => confirm(roadLiabilityId, input, actorUserId, options);
    if (!idempotencyKey) return run();
    const outcome = await runIdempotent(
      prisma,
      {
        scope: `road-liability:confirm-charge:${roadLiabilityId}`,
        key: idempotencyKey,
        fingerprint: fingerprintIdempotentPayload({
          customerChargeAmount: input.customerChargeAmount,
          adjustmentReason: input.adjustmentReason ?? null,
          adjustmentNote: input.adjustmentNote ?? null,
        }),
      },
      run,
    );
    if (outcome.deduped) return getReview(roadLiabilityId);
    return outcome.result!;
  }

  async function confirmForContract(
    contractId: string,
    roadLiabilityId: string,
    input: ConfirmInput,
    actorUserId: number,
    idempotencyKey?: string,
  ) {
    return confirmWithIdempotency(roadLiabilityId, input, actorUserId, idempotencyKey, {
      expectedContractId: contractId,
      expectedDestination: "RECONCILIATION",
    });
  }

  return { getReview, confirmWithIdempotency, confirmForContract };
}
