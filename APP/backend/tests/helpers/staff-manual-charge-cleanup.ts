import type { PrismaClient } from "@prisma/client";
import { assertTestDatabaseUrl } from "./integration-harness";

/**
 * Deletes fixtures created by staff-manual-charge integration tests for one run id.
 * Scoped to explicit contract ids only — never wildcard deletes.
 */
export async function cleanupStaffManualChargeFixtures(
  prisma: PrismaClient,
  contractIds: string[],
): Promise<void> {
  if (contractIds.length === 0) return;
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
  assertTestDatabaseUrl(url);

  const liabilities = await prisma.roadLiability.findMany({
    where: { attributedContractId: { in: contractIds } },
    select: { id: true },
  });
  const liabilityIds = liabilities.map((l) => l.id);

  const charges =
    liabilityIds.length === 0
      ? []
      : await prisma.roadLiabilityCustomerCharge.findMany({
          where: { roadLiabilityId: { in: liabilityIds } },
          select: { id: true },
        });
  const chargeIds = charges.map((c) => c.id);

  const invoices = await prisma.invoice.findMany({
    where: { contractId: { in: contractIds } },
    select: { id: true },
  });
  if (invoices.length > 0) {
    await prisma.invoiceLine.deleteMany({
      where: { invoiceId: { in: invoices.map((i) => i.id) } },
    });
    await prisma.invoice.deleteMany({ where: { id: { in: invoices.map((i) => i.id) } } });
  }

  if (chargeIds.length > 0) {
    await prisma.domainOutboxEvent.deleteMany({
      where: {
        OR: chargeIds.flatMap((id) => [
          { dedupeKey: `road_liability.customer_charge.confirmed:${id}` },
          { aggregateId: id },
        ]),
      },
    });
  }

  await prisma.financialLedgerEntry.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.contractPaymentOffSessionAttempt.deleteMany({
    where: { customerCharge: { contractId: { in: contractIds } } },
  });
  await prisma.contractPaymentAuthorization.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.contractPayment.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.roadLiabilityCustomerCharge.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.roadLiabilityObservation.deleteMany({
    where: { liabilityId: { in: liabilityIds } },
  });
  try {
    await prisma.roadChargeReferenceRegistry.deleteMany({
      where: {
        OR: [
          { roadLiabilityId: { in: liabilityIds } },
          { staffManualIdempotencyKey: { contains: "smc-" } },
          {
            provenance: "STAFF_MANUAL",
            roadLiabilityId: null,
            staffManualIdempotencyKey: { contains: "smc-" },
          },
        ],
      },
    });
  } catch {
    /* registry table may be absent on databases without migration 20261017210000 */
  }
  await prisma.roadLiability.deleteMany({
    where: { id: { in: liabilityIds } },
  });
  for (const contractId of contractIds) {
    await prisma.idempotencyKey.deleteMany({
      where: { scope: `staff-manual-charge:${contractId}` },
    });
  }

  for (const contractId of contractIds) {
    await prisma.contractCarIn.deleteMany({ where: { contractId } });
    await prisma.contractCarOut.deleteMany({ where: { contractId } });
    await prisma.contract.deleteMany({ where: { id: contractId } });
  }
}

/** Removes SMC run-scoped users, customer, and vehicles after contract fixtures are deleted. */
export async function cleanupStaffManualChargeRunArtifacts(
  prisma: PrismaClient,
  input: {
    run: string;
    contractIds: string[];
    customerId?: number;
    vehicleIds?: number[];
    adminEmail?: string;
    readOnlyEmail?: string;
  },
): Promise<void> {
  await cleanupStaffManualChargeFixtures(prisma, input.contractIds);

  try {
    await prisma.roadChargeReferenceRegistry.deleteMany({
      where: { staffManualIdempotencyKey: { contains: input.run } },
    });
  } catch {
    /* registry table may be absent on databases without migration 20261017210000 */
  }

  if (input.customerId != null) {
    const profiles = await prisma.customerPaymentProfile.findMany({
      where: { customerId: input.customerId },
      select: { id: true },
    });
    for (const profile of profiles) {
      await prisma.customerPaymentMethod.deleteMany({ where: { profileId: profile.id } });
      await prisma.customerPaymentProfile.delete({ where: { id: profile.id } });
    }
    await prisma.customer.deleteMany({ where: { id: input.customerId } });
  }

  for (const email of [input.adminEmail, input.readOnlyEmail].filter(Boolean) as string[]) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) continue;
    await prisma.authSession.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }

  if (input.vehicleIds && input.vehicleIds.length > 0) {
    await prisma.vehicle.deleteMany({ where: { id: { in: input.vehicleIds } } });
  }
}
