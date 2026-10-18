/**
 * Read-only smoke: registry table reachable; no REFERENCE_REGISTRY_SCHEMA_OUTDATED path.
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
  const registryCount = await prisma.roadChargeReferenceRegistry.count();
  const sample = await prisma.roadChargeReferenceRegistry.findMany({ take: 5 });

  const { buildApp } = await import("src/app");
  const app = await buildApp({ logger: false });
  await app.ready();
  const health = await app.inject({ method: "GET", url: "/health" });
  await app.close();

  console.log(
    JSON.stringify(
      {
        registryCount,
        registrySample: sample.map((r) => ({
          category: r.chargeCategory,
          ref: r.referenceNormalized,
          status: r.status,
          provenance: r.provenance,
        })),
        healthStatusCode: health.statusCode,
        healthOk: health.statusCode === 200,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
  if (health.statusCode !== 200) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
