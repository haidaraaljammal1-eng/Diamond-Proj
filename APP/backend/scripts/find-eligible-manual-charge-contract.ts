/** Find contracts eligible for staff manual charge smoke (read-only). */
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
  const contracts = await prisma.contract.findMany({
    where: {
      status: { in: ["ACTIVE", "REVIEW", "RETOUT"] },
      collectionMode: "ELECTRONIC",
    },
    select: {
      id: true,
      contractNumber: true,
      status: true,
      customer: { select: { name: true } },
      vehicle: { select: { plateNumber: true, vehicleName: true } },
      company: { select: { code: true } },
      paymentAuthorizations: {
        where: { status: "ACTIVE" },
        take: 1,
        select: { id: true },
      },
      carInEvents: { orderBy: { occurredAt: "desc" }, take: 1, select: { occurredAt: true } },
    },
    take: 15,
    orderBy: { updatedAt: "desc" },
  });
  const eligible = contracts
    .filter((c) => c.paymentAuthorizations.length > 0)
    .map((c) => ({
      id: c.id,
      contractNumber: c.contractNumber,
      status: c.status,
      company: c.company?.code,
      carInAt: c.carInEvents[0]?.occurredAt ?? null,
      hasCard: true,
    }));
  console.log(JSON.stringify({ eligibleCount: eligible.length, eligible }, null, 2));
  await prisma.$disconnect();
}

main();
