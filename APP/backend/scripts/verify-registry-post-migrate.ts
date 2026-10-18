async function openPrisma() {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const pool = new Pool({ connectionString: url });
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

async function main() {
  const prisma = await openPrisma();

  const counts = await prisma.$queryRaw<
    {
      liabilities: number;
      payments: number;
      invoices: number;
      contracts: number;
      registry: number;
    }[]
  >`
    SELECT
      (SELECT count(*)::int FROM road_liabilities) as liabilities,
      (SELECT count(*)::int FROM contract_payments) as payments,
      (SELECT count(*)::int FROM invoices) as invoices,
      (SELECT count(*)::int FROM contracts) as contracts,
      (SELECT count(*)::int FROM road_charge_reference_registry) as registry
  `;

  const indexes = await prisma.$queryRaw<
    { indexname: string; indexdef: string }[]
  >`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'road_charge_reference_registry'
    ORDER BY indexname
  `;

  const enums = await prisma.$queryRaw<{ typname: string }[]>`
    SELECT typname FROM pg_type
    WHERE typname IN ('RoadChargeReferenceRegistryStatus', 'RoadChargeReferenceProvenance')
    ORDER BY typname
  `;

  const fks = await prisma.$queryRaw<
    { conname: string; pg_get_constraintdef: string }[]
  >`
    SELECT c.conname, pg_get_constraintdef(c.oid) as pg_get_constraintdef
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'road_charge_reference_registry' AND c.contype = 'f'
  `;

  console.log(JSON.stringify({ counts: counts[0], enums, indexes, foreignKeys: fks }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
