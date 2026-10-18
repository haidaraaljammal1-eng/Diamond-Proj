/**
 * Read-only report of staff-manual reference / payment / finalization mismatches.
 * Does not repair data. Use isolated DB (5433) or production read replica only with ops approval.
 *
 * Usage:
 *   DATABASE_URL=postgresql://postgres@localhost:5433/haidara_test?schema=public npx tsx scripts/diagnose-staff-manual-reference-inconsistencies.ts
 */
import { STAFF_MANUAL_SOURCE_KEY } from "src/modules/road-liabilities/road-liability.constants";

async function openPrisma() {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const url = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL or TEST_DATABASE_URL required");
  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

async function main() {
  const prisma = await openPrisma();

  const staffLiabilities = await prisma.roadLiability.findMany({
    where: { authoritativeSourceKey: STAFF_MANUAL_SOURCE_KEY },
    select: {
      id: true,
      collectionStatus: true,
      staffEnteredAt: true,
      staffChargeDescription: true,
      staffChargeCategory: true,
      attributedContractId: true,
    },
  });

  const discrepancies: Record<string, unknown>[] = [];

  for (const liability of staffLiabilities) {
    const registry = await prisma.roadChargeReferenceRegistry.findFirst({
      where: {
        roadLiabilityId: liability.id,
        provenance: "STAFF_MANUAL",
        status: { in: ["RESERVED", "CONFIRMED", "RELEASED"] },
      },
    });

    const charge = await prisma.roadLiabilityCustomerCharge.findUnique({
      where: { roadLiabilityId: liability.id },
      select: { id: true, operationalState: true, contractPaymentId: true },
    });

    const payments = charge
      ? await prisma.contractPayment.findMany({
          where: { purpose: "ROAD_LIABILITY", targetId: charge.id },
          select: { id: true, status: true, providerReference: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const confirmed = payments.find((p) => p.status === "CONFIRMED");
    const failed = payments.filter((p) => p.status === "FAILED");
    const inFlight = payments.filter((p) => p.status === "PROCESSING" || p.status === "PENDING");

    if (
      liability.collectionStatus === "SETTLED" &&
      registry?.status === "RESERVED"
    ) {
      discrepancies.push({
        kind: "SETTLED_LIABILITY_RESERVED_REFERENCE",
        roadLiabilityId: liability.id,
        registryId: registry.id,
        contractId: liability.attributedContractId,
      });
    }

    if (
      failed.length > 0 &&
      registry?.status === "RESERVED" &&
      liability.collectionStatus === "OPEN" &&
      !confirmed
    ) {
      discrepancies.push({
        kind: "FAILED_PAYMENT_STILL_RESERVED",
        roadLiabilityId: liability.id,
        registryId: registry.id,
        failedPaymentIds: failed.map((p) => p.id),
      });
    }

    if (
      liability.collectionStatus === "SETTLED" &&
      confirmed &&
      liability.staffEnteredAt == null
    ) {
      discrepancies.push({
        kind: "MISSING_STAFF_FINALIZATION_AFTER_CONFIRMED_COLLECTION",
        roadLiabilityId: liability.id,
        paymentId: confirmed.id,
        registryStatus: registry?.status ?? null,
      });
    }

    if (inFlight.length > 0 && registry?.status === "RESERVED" && !confirmed) {
      discrepancies.push({
        kind: "UNRESOLVED_IN_FLIGHT_PAYMENT",
        roadLiabilityId: liability.id,
        paymentIds: inFlight.map((p) => p.id),
        operationalState: charge?.operationalState ?? null,
        providerReferences: inFlight.map((p) => p.providerReference),
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    staffManualLiabilityCount: staffLiabilities.length,
    discrepancyCount: discrepancies.length,
    discrepancies,
  };

  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
