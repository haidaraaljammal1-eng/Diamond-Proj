import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const gps = await prisma.vehicleGpsBinding.count({ where: { isActive: true } });
  const renewals = await prisma.contractRenewal.count({
    where: { contractId: "80acdb7e-00ef-478a-a8df-200f5323022c" },
  });
  const invoices = await prisma.invoice.count({
    where: { contractId: "80acdb7e-00ef-478a-a8df-200f5323022c" },
  });
  const mig = await prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM _prisma_migrations
    WHERE migration_name = '20261013210000_contract_renewal_duration'
  `;
  console.log(JSON.stringify({ gps, renewals, invoices, migrationApplied: mig.length === 1 }, null, 2));
  await prisma.$disconnect();
}
main();
