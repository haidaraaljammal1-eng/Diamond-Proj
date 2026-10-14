import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config();
const url = (process.env.DATABASE_URL ?? "").replace("haidara_test", "haidara");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const db = await prisma.$queryRaw<[{ current_database: string }]>`SELECT current_database()`;
  const v = await prisma.vehicle.findUnique({
    where: { id: 628 },
    select: { id: true, vehicleName: true, plateNumber: true, operationalStatus: true },
  });
  const contracts = await prisma.contract.findMany({
    where: { vehicleId: 628 },
    select: { id: true, status: true, contractNumber: true },
  });
  const gps = await prisma.vehicleGpsBinding.count({ where: { vehicleId: 628, isActive: true } });
  const migrations = await prisma.$queryRaw<
    { migration_name: string; finished_at: Date | null }[]
  >`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC NULLS LAST LIMIT 8`;
  console.log(JSON.stringify({ db: db[0], vehicle: v, contracts, gps, migrations }, null, 2));
  await prisma.$disconnect();
}
main();
