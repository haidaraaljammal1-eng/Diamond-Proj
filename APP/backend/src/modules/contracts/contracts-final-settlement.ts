import type { ContractPayment } from "@prisma/client";
import type { ContractPaymentAllocationPurpose } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { contractError } from "./contracts.errors";
import { finalizeReconciliationAndCloseInTx, settleRoadLiabilitiesForReconciliation } from "./contracts-reconciliation";
import { listOutstandingOfficeRenewals } from "./contracts-renewal-collection";
import {
  recordTrustedCollectionAllocationLedgers,
} from "src/modules/finance/finance-ledger.service";

type Db = PrismaClient | Tx;

export type FinalSettlementAllocationInput = {
  allocationPurpose: ContractPaymentAllocationPurpose;
  targetId: string;
  amount: number;
};

export function computeSettlementAmounts(reconciliationFinalAmount: number, outstandingRenewalAmount: number) {
  const reconciliationChargesAmount = reconciliationFinalAmount;
  const settlementAmountDue = reconciliationFinalAmount + outstandingRenewalAmount;
  return { reconciliationChargesAmount, outstandingRenewalAmount, settlementAmountDue };
}

export async function buildFinalSettlementAllocations(
  db: Db,
  reconciliationId: string,
  contractId: string,
): Promise<{ allocations: FinalSettlementAllocationInput[]; settlementAmountDue: number }> {
  const reconciliation = await db.contractReconciliation.findUnique({
    where: { id: reconciliationId },
    select: { id: true, contractId: true, finalAmount: true },
  });
  if (!reconciliation || reconciliation.contractId !== contractId) {
    throw contractError.notFound();
  }
  const renewals = await listOutstandingOfficeRenewals(db, contractId);
  const allocations: FinalSettlementAllocationInput[] = [];
  if (reconciliation.finalAmount > 0) {
    allocations.push({
      allocationPurpose: "RECONCILIATION",
      targetId: reconciliation.id,
      amount: reconciliation.finalAmount,
    });
  }
  for (const renewal of renewals) {
    allocations.push({
      allocationPurpose: "RENEWAL",
      targetId: renewal.id,
      amount: renewal.additionalAmount,
    });
  }
  const settlementAmountDue = allocations.reduce((sum, row) => sum + row.amount, 0);
  return { allocations, settlementAmountDue };
}

export async function persistFinalSettlementAllocations(
  tx: Tx,
  paymentId: string,
  allocations: ReadonlyArray<FinalSettlementAllocationInput>,
): Promise<void> {
  for (const row of allocations) {
    try {
      await tx.contractPaymentAllocation.create({
        data: {
          contractPaymentId: paymentId,
          allocationPurpose: row.allocationPurpose,
          targetId: row.targetId,
          amount: row.amount,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
}

export async function ensureFinalSettlementAllocationsForPayment(
  tx: Tx,
  payment: Pick<ContractPayment, "id" | "purpose" | "targetId" | "contractId" | "amount">,
): Promise<void> {
  if (payment.purpose !== "RECONCILIATION") return;
  const existing = await tx.contractPaymentAllocation.findMany({
    where: { contractPaymentId: payment.id },
  });
  if (existing.length > 0) return;
  const { allocations, settlementAmountDue } = await buildFinalSettlementAllocations(
    tx,
    payment.targetId,
    payment.contractId,
  );
  if (settlementAmountDue <= 0) return;
  if (settlementAmountDue !== payment.amount) {
    throw contractError.paymentAmountMismatch();
  }
  await persistFinalSettlementAllocations(tx, payment.id, allocations);
}

async function linkRenewalSettlementFromFinalPayment(
  tx: Tx,
  renewalId: string,
  paymentId: string,
): Promise<void> {
  const renewal = await tx.contractRenewal.findUnique({ where: { id: renewalId } });
  if (!renewal) throw contractError.notFound();
  if (!renewal.appliedAt) throw contractError.paymentNotAllowed();
  if (renewal.settledPaymentId) {
    if (renewal.settledPaymentId === paymentId) return;
    throw contractError.paymentAlreadySettled();
  }
  await tx.contractRenewal.update({
    where: { id: renewalId },
    data: { settledPaymentId: paymentId },
  });
}

export async function applyCombinedFinalSettlementInTx(
  tx: Tx,
  payment: ContractPayment,
): Promise<void> {
  const allocations = await tx.contractPaymentAllocation.findMany({
    where: { contractPaymentId: payment.id },
    orderBy: { createdAt: "asc" },
  });
  if (allocations.length === 0) return;

  const allocationTotal = allocations.reduce((sum, row) => sum + row.amount, 0);
  if (allocationTotal !== payment.amount) {
    throw contractError.paymentAmountMismatch();
  }

  const reconciliation = await tx.contractReconciliation.findUnique({
    where: { id: payment.targetId },
  });
  if (!reconciliation || reconciliation.contractId !== payment.contractId) {
    throw contractError.notFound();
  }

  if (!reconciliation.settledAt) {
    await tx.contractReconciliation.update({
      where: { id: reconciliation.id },
      data: { settledAt: new Date(), settledPaymentId: payment.id },
    });
    await settleRoadLiabilitiesForReconciliation(tx, reconciliation.id);
  }

  for (const row of allocations) {
    if (row.allocationPurpose === "RENEWAL") {
      const renewal = await tx.contractRenewal.findUnique({ where: { id: row.targetId } });
      if (!renewal || renewal.contractId !== payment.contractId) {
        throw contractError.notFound();
      }
      if (renewal.additionalAmount !== row.amount) {
        throw contractError.paymentAmountMismatch();
      }
      await linkRenewalSettlementFromFinalPayment(tx, renewal.id, payment.id);
    }
    if (row.allocationPurpose === "RECONCILIATION" && row.targetId !== reconciliation.id) {
      throw contractError.paymentAmountMismatch();
    }
  }

  await recordTrustedCollectionAllocationLedgers(tx, payment, allocations);
  await finalizeReconciliationAndCloseInTx(tx, reconciliation.contractId, payment.createdByUserId);
}

export async function applyLegacyReconciliationSettlementInTx(
  tx: Tx,
  payment: ContractPayment,
): Promise<void> {
  const reconciliation = await tx.contractReconciliation.findUnique({
    where: { id: payment.targetId },
  });
  if (!reconciliation) throw contractError.notFound();
  if (!reconciliation.settledAt) {
    await tx.contractReconciliation.update({
      where: { id: reconciliation.id },
      data: { settledAt: new Date(), settledPaymentId: payment.id },
    });
    await settleRoadLiabilitiesForReconciliation(tx, reconciliation.id);
  }
  await finalizeReconciliationAndCloseInTx(tx, reconciliation.contractId, payment.createdByUserId);
}
