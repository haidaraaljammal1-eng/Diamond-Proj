import type { Prisma, PrismaClient } from "@prisma/client";

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
  unpaidRoadLiabilitiesCount: number;
  unpaidRoadLiabilitiesTotal: number;
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

  const unpaidRoadLiabilities = await prisma.roadLiability.findMany({
    where: {
      collectionStatus: "OPEN",
      customerCharge: {
        is: {
          operationalState: { not: "PAID" },
        },
      },
    },
    select: {
      customerCharge: {
        select: { customerChargeAmount: true },
      },
    },
  });

  const overdueRentals = await prisma.contract.count({
    where: {
      status: "ACTIVE",
      endAt: { lt: new Date() },
    },
  });

  const unpaidContractsTotal = unpaidContracts.reduce((sum, row) => sum + row.agreedAmount, 0);
  const unpaidRoadLiabilitiesTotal = unpaidRoadLiabilities.reduce(
    (sum, row) => sum + (row.customerCharge?.customerChargeAmount ?? 0),
    0,
  );

  return {
    unpaidContractsCount: unpaidContracts.length,
    unpaidContractsTotal,
    unpaidRoadLiabilitiesCount: unpaidRoadLiabilities.length,
    unpaidRoadLiabilitiesTotal,
    overdueRentalsCount: overdueRentals,
    outstandingFinancialTotal: unpaidContractsTotal + unpaidRoadLiabilitiesTotal,
    currency,
  };
}

export function attentionMonitorHasOutstandingCases(snapshot: AttentionMonitorSnapshot): boolean {
  return (
    snapshot.unpaidContractsCount > 0 ||
    snapshot.unpaidRoadLiabilitiesCount > 0 ||
    snapshot.overdueRentalsCount > 0
  );
}
