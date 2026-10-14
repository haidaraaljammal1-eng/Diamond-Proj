import type { PrismaClient } from "@prisma/client";

export async function discoverAffectedContractIds(
  prisma: PrismaClient,
  since: Date | null,
  until: Date,
): Promise<Set<string>> {
  const ids = new Set<string>();

  if (since === null) {
    const acceptances = await prisma.contractAcceptance.findMany({
      select: { contractId: true },
    });
    for (const row of acceptances) ids.add(row.contractId);
    return ids;
  }

  const window = { gt: since, lte: until };

  const newSignings = await prisma.contractAcceptance.findMany({
    where: { createdAt: window },
    select: { contractId: true },
  });
  for (const row of newSignings) ids.add(row.contractId);

  const missingArchive = await prisma.contract.findMany({
    where: {
      acceptance: { isNot: null },
      archiveRows: { none: {} },
    },
    select: { id: true },
  });
  for (const row of missingArchive) ids.add(row.id);

  const contractUpdates = await prisma.contract.findMany({
    where: {
      acceptance: { isNot: null },
      updatedAt: window,
    },
    select: { id: true },
  });
  for (const row of contractUpdates) ids.add(row.id);

  const carOuts = await prisma.contractCarOut.findMany({
    where: { createdAt: window },
    select: { contractId: true },
  });
  for (const row of carOuts) ids.add(row.contractId);

  const carIns = await prisma.contractCarIn.findMany({
    where: { createdAt: window },
    select: { contractId: true },
  });
  for (const row of carIns) ids.add(row.contractId);

  const payments = await prisma.contractPayment.findMany({
    where: {
      purpose: "RENTAL",
      OR: [{ createdAt: window }, { confirmedAt: window }],
    },
    select: { contractId: true },
  });
  for (const row of payments) ids.add(row.contractId);

  const fuelLines = await prisma.contractReconciliationLine.findMany({
    where: {
      type: "FUEL",
      OR: [
        { createdAt: window },
        { reconciliation: { updatedAt: window } },
      ],
    },
    select: { reconciliation: { select: { contractId: true } } },
  });
  for (const row of fuelLines) ids.add(row.reconciliation.contractId);

  const damageLines = await prisma.contractReconciliationLine.findMany({
    where: {
      type: "DAMAGE",
      OR: [
        { createdAt: window },
        { reconciliation: { updatedAt: window } },
      ],
    },
    select: { reconciliation: { select: { contractId: true } } },
  });
  for (const row of damageLines) ids.add(row.reconciliation.contractId);

  const liabilities = await prisma.roadLiability.findMany({
    where: {
      attributionStatus: "MATCHED",
      attributedContractId: { not: null },
      updatedAt: window,
    },
    select: { attributedContractId: true },
  });
  for (const row of liabilities) {
    if (row.attributedContractId) ids.add(row.attributedContractId);
  }

  const charges = await prisma.roadLiabilityCustomerCharge.findMany({
    where: { updatedAt: window },
    select: { contractId: true },
  });
  for (const row of charges) ids.add(row.contractId);

  return ids;
}
