import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const v = await prisma.vehicle.findMany({
    where: { vehicleName: { startsWith: "QA-RENEWAL" } },
    select: { id: true, vehicleName: true, operationalStatus: true },
  });
  console.log(JSON.stringify(v));
  await prisma.$disconnect();
}
main();
