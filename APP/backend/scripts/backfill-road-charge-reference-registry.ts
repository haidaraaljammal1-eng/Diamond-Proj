/**
 * Idempotent backfill of CONFIRMED registry rows from settled staff manual and
 * provider-authoritative liabilities. Run only against isolated integration DB (5433).
 *
 * Usage:
 *   DATABASE_URL=postgresql://postgres@localhost:5433/haidara_test?schema=public npx tsx scripts/backfill-road-charge-reference-registry.ts
 */
import { registerProviderAuthoritativeReference } from "src/modules/road-liabilities/road-charge-reference.service";
import { roadLiabilityTypeToChargeCategory } from "src/modules/road-liabilities/road-charge-reference.normalize";

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
  const staffSettled = await prisma.roadLiability.findMany({
    where: {
      authoritativeSourceKey: "STAFF_MANUAL",
      collectionStatus: "SETTLED",
      staffChargeDescription: { not: null },
      staffChargeCategory: { not: null },
    },
    select: {
      id: true,
      staffChargeDescription: true,
      staffChargeCategory: true,
    },
  });

  let staffInserted = 0;
  for (const row of staffSettled) {
    if (!row.staffChargeDescription || !row.staffChargeCategory) continue;
    const existing = await prisma.roadChargeReferenceRegistry.findFirst({
      where: {
        chargeCategory: row.staffChargeCategory,
        referenceNormalized: row.staffChargeDescription.trim(),
        status: "CONFIRMED",
      },
    });
    if (existing) continue;
    try {
      await prisma.roadChargeReferenceRegistry.create({
        data: {
          chargeCategory: row.staffChargeCategory,
          referenceNumber: row.staffChargeDescription,
          referenceNormalized: row.staffChargeDescription.trim(),
          status: "CONFIRMED",
          provenance: "STAFF_MANUAL",
          roadLiabilityId: row.id,
          confirmedAt: new Date(),
        },
      });
      staffInserted += 1;
    } catch {
      // conflict — report only
      console.warn(
        `staff conflict: ${row.staffChargeCategory} ${row.staffChargeDescription} liability=${row.id}`,
      );
    }
  }

  const providerRows = await prisma.roadLiability.findMany({
    where: {
      confirmationStatus: "CONFIRMED",
      authoritativeExternalReference: { not: null },
      authoritativeSourceKey: { not: null, notIn: ["STAFF_MANUAL", "GPS_INFERENCE"] },
    },
    select: {
      id: true,
      type: true,
      authoritativeExternalReference: true,
    },
  });

  let providerInserted = 0;
  for (const row of providerRows) {
    const ref = row.authoritativeExternalReference?.trim();
    if (!ref) continue;
    const chargeCategory = roadLiabilityTypeToChargeCategory(row.type);
    if (!chargeCategory) continue;
    try {
      await registerProviderAuthoritativeReference(prisma, {
        chargeCategory,
        referenceNumber: ref,
        roadLiabilityId: row.id,
      });
      providerInserted += 1;
    } catch {
      console.warn(`provider conflict: ${chargeCategory} ${ref} liability=${row.id}`);
    }
  }

  console.log(
    JSON.stringify({ staffInserted, providerInserted, staffCandidates: staffSettled.length, providerCandidates: providerRows.length }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
