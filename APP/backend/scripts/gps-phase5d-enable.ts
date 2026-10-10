import dotenv from "dotenv";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const ELITE_ID = "49e321e3-62d2-41be-87cd-3ccd9ec7be45";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("haidara") || url.includes("haidara_test")) throw new Error("wrong db");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const before = await prisma.gpsProviderAccount.findUniqueOrThrow({ where: { id: ELITE_ID } });
  if (!before.secretEncrypted?.trim()) throw new Error("no credentials");
  await prisma.gpsProviderAccount.update({ where: { id: ELITE_ID }, data: { enabled: true } });
  const after = await prisma.gpsProviderAccount.findUniqueOrThrow({ where: { id: ELITE_ID } });
  console.log(JSON.stringify({ enabled: after.enabled, providerKey: after.providerKey, accountKey: after.accountKey }));
  await prisma.$disconnect();
}
void main();
