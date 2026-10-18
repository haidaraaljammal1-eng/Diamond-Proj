/**
 * Read-only audit of Traffic/Salik reference numbers before registry migration.
 * Usage: DATABASE_URL=postgresql://postgres:postgres@localhost:5432/diamond npx tsx scripts/audit-road-charge-references-readonly.ts
 */
import { STAFF_MANUAL_SOURCE_KEY } from "src/modules/road-liabilities/road-liability.constants";
import {
  normalizeRoadChargeReferenceNumber,
  roadLiabilityTypeToChargeCategory,
} from "src/modules/road-liabilities/road-charge-reference.normalize";

async function openPrisma() {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const pool = new Pool({ connectionString: url });
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

type RefRow = {
  source: "staff_manual" | "provider";
  liabilityId: string;
  category: string;
  referenceNumber: string;
  referenceNormalized: string;
  collectionStatus: string;
  companyHint: string | null;
};

async function main() {
  const prisma = await openPrisma();

  const liabilities = await prisma.roadLiability.findMany({
    where: {
      OR: [
        {
          authoritativeSourceKey: STAFF_MANUAL_SOURCE_KEY,
          staffChargeDescription: { not: null },
          staffChargeCategory: { not: null },
        },
        {
          confirmationStatus: "CONFIRMED",
          authoritativeExternalReference: { not: null },
          authoritativeSourceKey: { not: null, notIn: [STAFF_MANUAL_SOURCE_KEY, "GPS_INFERENCE"] },
        },
      ],
    },
    select: {
      id: true,
      type: true,
      collectionStatus: true,
      authoritativeSourceKey: true,
      authoritativeExternalReference: true,
      staffChargeCategory: true,
      staffChargeDescription: true,
      attributedContractId: true,
      attributedContract: {
        select: { contractNumber: true, company: { select: { code: true } } },
      },
    },
  });

  const rows: RefRow[] = [];
  for (const l of liabilities) {
    const companyHint = l.attributedContract?.company?.code ?? null;
    if (
      l.authoritativeSourceKey === STAFF_MANUAL_SOURCE_KEY &&
      l.staffChargeDescription &&
      l.staffChargeCategory
    ) {
      rows.push({
        source: "staff_manual",
        liabilityId: l.id,
        category: l.staffChargeCategory,
        referenceNumber: l.staffChargeDescription,
        referenceNormalized: normalizeRoadChargeReferenceNumber(l.staffChargeDescription),
        collectionStatus: l.collectionStatus,
        companyHint,
      });
      continue;
    }
    const category = roadLiabilityTypeToChargeCategory(l.type);
    const ref = l.authoritativeExternalReference;
    if (category && ref) {
      rows.push({
        source: "provider",
        liabilityId: l.id,
        category,
        referenceNumber: ref,
        referenceNormalized: normalizeRoadChargeReferenceNumber(ref),
        collectionStatus: l.collectionStatus,
        companyHint,
      });
    }
  }

  const byCategory = new Map<string, Map<string, RefRow[]>>();
  for (const row of rows) {
    if (!byCategory.has(row.category)) byCategory.set(row.category, new Map());
    const m = byCategory.get(row.category)!;
    if (!m.has(row.referenceNormalized)) m.set(row.referenceNormalized, []);
    m.get(row.referenceNormalized)!.push(row);
  }

  const duplicates: Array<{
    category: string;
    referenceNormalized: string;
    count: number;
    liabilityIds: string[];
  }> = [];
  for (const [category, m] of byCategory) {
    for (const [ref, group] of m) {
      if (group.length > 1) {
        duplicates.push({
          category,
          referenceNormalized: ref,
          count: group.length,
          liabilityIds: group.map((g) => g.liabilityId),
        });
      }
    }
  }

  const settledStaff = rows.filter(
    (r) => r.source === "staff_manual" && r.collectionStatus === "SETTLED",
  );
  const providerConfirmed = rows.filter((r) => r.source === "provider");

  console.log(
    JSON.stringify(
      {
        totalReferenceRows: rows.length,
        staffManualWithReference: rows.filter((r) => r.source === "staff_manual").length,
        providerWithReference: providerConfirmed.length,
        eligibleStaffBackfillSettled: settledStaff.length,
        duplicateGroupsWithinCategory: duplicates.length,
        duplicates,
        sampleRows: rows.slice(0, 20),
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
  if (duplicates.length > 0) {
    console.error("AUDIT: duplicate normalized references within category — review before backfill");
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
