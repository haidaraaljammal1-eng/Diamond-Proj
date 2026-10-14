import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config();
const url = (process.env.DATABASE_URL ?? "").replace("haidara_test", "haidara");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
async function main() {
  const ids = [567, 568, 569, 572, 573, 576, 577, 580, 581, 604, 617];
  for (const vid of ids) {
    const c = await prisma.contract.findMany({
      where: { vehicleId: vid },
      select: { id: true, status: true, contractNumber: true },
    });
    const gps = await prisma.vehicleGpsBinding.count({ where: { vehicleId: vid, isActive: true } });
    console.log(vid, "gps", gps, JSON.stringify(c));
  }
  await prisma.$disconnect();
}
main();
