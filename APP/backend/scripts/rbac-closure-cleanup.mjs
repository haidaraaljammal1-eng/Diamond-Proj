import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const PREFIX = "RBAC_CERT";
const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/haidara_test?schema=public";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const db = (await prisma.$queryRaw`SELECT current_database()::text AS db`)[0].db;
if (db !== "haidara_test") {
  throw new Error(`Refusing cleanup on ${db}`);
}
const certVehicles = await prisma.vehicle.findMany({
  where: { plateNumber: { startsWith: PREFIX } },
  select: { id: true },
});
const vehicleIds = certVehicles.map((v) => v.id);
if (vehicleIds.length > 0) {
  await prisma.contract.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
  await prisma.maintenanceOrder.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
  await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
}
await prisma.manualExpense.deleteMany({
  where: { description: { startsWith: PREFIX } },
});
await prisma.user.deleteMany({ where: { email: { contains: "closure.test" } } });
await prisma.rolePermission.deleteMany({ where: { role: { key: { startsWith: PREFIX } } } });
await prisma.role.deleteMany({ where: { key: { startsWith: PREFIX } } });
console.log("RBAC_CERT cleanup complete on haidara_test");
await prisma.$disconnect();
