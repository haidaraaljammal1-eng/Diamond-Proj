/**
 * Read-only development DB preflight for migration 20261017210000 (do not migrate from this script).
 */
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
  const identity = await prisma.$queryRaw<
    { db: string; data_dir: string; port: number }[]
  >`SELECT current_database() as db, current_setting('data_directory') as data_dir, inet_server_port()::int as port`;
  console.log(JSON.stringify({ identity: identity[0] }, null, 2));

  const registry = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT to_regclass('public.road_charge_reference_registry') IS NOT NULL as exists
  `;
  console.log(JSON.stringify({ road_charge_reference_registry: registry[0] }, null, 2));

  const counts = await prisma.$queryRaw<
    { liabilities: number; payments: number; staff_manual_liabilities: number }[]
  >`
    SELECT
      (SELECT count(*)::int FROM road_liabilities) as liabilities,
      (SELECT count(*)::int FROM contract_payments) as payments,
      (SELECT count(*)::int FROM road_liabilities WHERE "authoritativeSourceKey" = 'staff_manual') as staff_manual_liabilities
  `;
  console.log(JSON.stringify({ counts: counts[0] }, null, 2));

  if (registry[0]?.exists) {
    const orphanRegistry = await prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int as count
      FROM road_charge_reference_registry
      WHERE "roadLiabilityId" IS NULL AND status IN ('RESERVED', 'CONFIRMED')
    `;
    console.log(JSON.stringify({ active_registry_without_liability: orphanRegistry[0] }, null, 2));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
