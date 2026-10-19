import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const runId = process.env.RBAC_BROWSER_RUN_ID?.trim();
if (!runId) {
  console.error("RBAC_BROWSER_RUN_ID required");
  process.exit(1);
}
const PREFIX = `RBAC_BROW_${runId}`;
const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/haidara_test?schema=public";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const db = (await prisma.$queryRaw`SELECT current_database()::text AS db`)[0].db;
if (db !== "haidara_test") throw new Error(`Refusing cleanup on ${db}`);

const vehicles = await prisma.vehicle.findMany({
  where: { plateNumber: { startsWith: PREFIX } },
  select: { id: true },
});
const vehicleIds = vehicles.map((v) => v.id);
if (vehicleIds.length) {
  await prisma.contract.deleteMany({
    where: { OR: [{ vehicleId: { in: vehicleIds } }, { contractNumber: { startsWith: PREFIX } }] },
  });
  await prisma.maintenanceOrder.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
  await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
}

const certUsers = await prisma.user.findMany({
  where: { email: { contains: `@cert.browser.test` } },
  select: { id: true, email: true },
});
const runUsers = certUsers.filter((u) => u.email.includes(PREFIX.toLowerCase()));
const userIds = runUsers.map((u) => u.id);
if (userIds.length) {
  const expenses = await prisma.manualExpense.findMany({
    where: { createdByUserId: { in: userIds } },
    select: { id: true },
  });
  const expenseIds = expenses.map((e) => e.id);
  if (expenseIds.length) {
    await prisma.financialLedgerEntry.deleteMany({
      where: { manualExpenseId: { in: expenseIds } },
    });
    await prisma.manualExpense.deleteMany({ where: { id: { in: expenseIds } } });
  }
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

await prisma.rolePermission.deleteMany({ where: { role: { key: { startsWith: PREFIX } } } });
await prisma.role.deleteMany({ where: { key: { startsWith: PREFIX } } });

console.log(`Cleanup complete for ${PREFIX} on haidara_test`);
await prisma.$disconnect();
