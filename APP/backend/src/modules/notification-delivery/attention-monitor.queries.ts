import type { Prisma, PrismaClient } from "@prisma/client";
import { AWAITING_PAYMENT_RENEWAL_FILTER } from "src/modules/contracts/contracts-renewal-collection";
import { COLLECTIBLE_WHERE } from "src/modules/road-liabilities/road-liability.mapper";
import { STAFF_MANUAL_SOURCE_KEY } from "src/modules/road-liabilities/road-liability.constants";

/** Matches Finance Collected: trusted Stripe CARD or explicit CASH collections. */
const TRUSTED_RENTAL_PAYMENT: Prisma.ContractPaymentWhereInput = {
  purpose: "RENTAL",
  status: "CONFIRMED",
  confirmedAt: { not: null },
  OR: [
    { method: "CARD", provider: "stripe" },
    { method: "CASH", provider: null },
  ],
};

export interface AttentionMonitorSnapshot {
  unpaidContractsCount: number;
  unpaidContractsTotal: number;
  unpaidDeferredViolationsCount: number;
  unpaidDeferredViolationsTotal: number;
  unpaidPostCloseViolationsCount: number;
  unpaidPostCloseViolationsTotal: number;
  awaitingRenewalsCount: number;
  awaitingRenewalsTotal: number;
  overdueRentalsCount: number;
  outstandingFinancialTotal: number;
  currency: string;
}

export async function loadAttentionMonitorSnapshot(
  prisma: PrismaClient,
): Promise<AttentionMonitorSnapshot> {
  const currency = "AED";

  const unpaidContracts = await prisma.contract.findMany({
    where: {
      status: "SIGNED",
      NOT: {
        payments: {
          some: TRUSTED_RENTAL_PAYMENT,
        },
      },
    },
    select: { agreedAmount: true },
  });

  const unpaidDeferredViolations = await prisma.roadLiability.findMany({
    where: {
      ...COLLECTIBLE_WHERE,
      authoritativeSourceKey: STAFF_MANUAL_SOURCE_KEY,
      OR: [
        { customerCharge: { is: null } },
        {
          customerCharge: {
            is: {
              destinationType: "DIRECT_COLLECTION",
              operationalState: { not: "PAID" },
            },
          },
        },
      ],
      NOT: {
        customerCharge: {
          is: {
            destinationType: { in: ["RECONCILIATION", "POST_CLOSE_RECEIVABLE"] },
          },
        },
      },
    },
    select: { amount: true },
  });

  const unpaidPostCloseViolations = await prisma.contractPostCloseReceivable.findMany({
    where: { status: "OPEN", amount: { gt: 0 } },
    select: { amount: true },
  });

  const awaitingRenewals = await prisma.contractRenewal.findMany({
    where: AWAITING_PAYMENT_RENEWAL_FILTER,
    select: { additionalAmount: true },
  });

  const overdueRentals = await prisma.contract.count({
    where: {
      status: "ACTIVE",
      endAt: { lt: new Date() },
    },
  });

  const unpaidContractsTotal = unpaidContracts.reduce((sum, row) => sum + row.agreedAmount, 0);
  const unpaidDeferredViolationsTotal = unpaidDeferredViolations.reduce(
    (sum, row) => sum + (row.amount ?? 0),
    0,
  );
  const unpaidPostCloseViolationsTotal = unpaidPostCloseViolations.reduce(
    (sum, row) => sum + row.amount,
    0,
  );
  const awaitingRenewalsTotal = awaitingRenewals.reduce((sum, row) => sum + row.additionalAmount, 0);

  return {
    unpaidContractsCount: unpaidContracts.length,
    unpaidContractsTotal,
    unpaidDeferredViolationsCount: unpaidDeferredViolations.length,
    unpaidDeferredViolationsTotal,
    unpaidPostCloseViolationsCount: unpaidPostCloseViolations.length,
    unpaidPostCloseViolationsTotal,
    awaitingRenewalsCount: awaitingRenewals.length,
    awaitingRenewalsTotal,
    overdueRentalsCount: overdueRentals,
    outstandingFinancialTotal:
      unpaidContractsTotal +
      unpaidDeferredViolationsTotal +
      unpaidPostCloseViolationsTotal +
      awaitingRenewalsTotal,
    currency,
  };
}

export function attentionMonitorHasOutstandingCases(snapshot: AttentionMonitorSnapshot): boolean {
  return (
    snapshot.unpaidContractsCount > 0 ||
    snapshot.unpaidDeferredViolationsCount > 0 ||
    snapshot.unpaidPostCloseViolationsCount > 0 ||
    snapshot.awaitingRenewalsCount > 0 ||
    snapshot.overdueRentalsCount > 0
  );
}
