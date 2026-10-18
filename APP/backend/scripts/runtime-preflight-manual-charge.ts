/** Runtime preflight for manual charge smoke (no secrets in output). */
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
  const { env } = await import("src/config/env");
  const prisma = await openPrisma();
  const db = await prisma.$queryRaw<{ db: string; port: number }[]>`
    SELECT current_database() as db, inet_server_port()::int as port
  `;
  const registryExists = await prisma.$queryRaw<{ ok: boolean }[]>`
    SELECT to_regclass('public.road_charge_reference_registry') IS NOT NULL as ok
  `;
  const registryCount = registryExists[0]?.ok
    ? await prisma.roadChargeReferenceRegistry.count()
    : -1;

  const stripeKey = env.STRIPE_SECRET_KEY ?? "";
  const paymentAudit = {
    paymentProvider: env.PAYMENT_PROVIDER,
    diamondSimulationEnabled: env.DIAMOND_SIMULATION_ENABLED,
    stripeConfigured: stripeKey.length > 0,
    stripeKeyPrefix: stripeKey.startsWith("sk_test_")
      ? "sk_test_"
      : stripeKey.startsWith("sk_live_")
        ? "sk_live_"
        : stripeKey.length > 0
          ? "other"
          : "none",
    liveChargingRisk: stripeKey.startsWith("sk_live_"),
  };

  console.log(
    JSON.stringify(
      {
        database: db[0],
        registryTable: registryExists[0]?.ok,
        registryRowCount: registryCount,
        nodeEnv: env.NODE_ENV,
        paymentAudit,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
  if (!registryExists[0]?.ok) process.exit(1);
  if (paymentAudit.liveChargingRisk) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
