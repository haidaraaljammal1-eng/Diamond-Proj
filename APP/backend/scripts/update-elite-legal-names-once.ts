import dotenv from "dotenv";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const ELITE_EN = "DIAMOND ELITE CAR RENTAL L.L.C";
const ELITE_AR = "دايموند إليت لتأجير السيارات ش.ذ.م.م";

async function main() {
  const dbMatch = url.match(/\/([^/?]+)(\?|$)/);
  const dbName = dbMatch?.[1] ?? "UNKNOWN";
  console.log("DB_NAME:", dbName);
  if (dbName !== "diamond") {
    console.error("ABORT: DATABASE_URL must target database 'diamond'");
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const select = { code: true, legalNameEn: true, legalNameAr: true } as const;
  const before = await prisma.operatingCompany.findMany({
    where: { code: { in: ["UNIQUE", "ELITE"] } },
    orderBy: { code: "asc" },
    select,
  });
  console.log("BEFORE:", JSON.stringify(before, null, 2));

  const uniqueBefore = before.find((r) => r.code === "UNIQUE");
  if (!uniqueBefore) throw new Error("UNIQUE row missing");

  await prisma.operatingCompany.update({
    where: { code: "ELITE" },
    data: { legalNameEn: ELITE_EN, legalNameAr: ELITE_AR },
  });

  const after = await prisma.operatingCompany.findMany({
    where: { code: { in: ["UNIQUE", "ELITE"] } },
    orderBy: { code: "asc" },
    select,
  });
  console.log("AFTER:", JSON.stringify(after, null, 2));

  const uniqueAfter = after.find((r) => r.code === "UNIQUE");
  const eliteAfter = after.find((r) => r.code === "ELITE");
  const uniqueUnchanged =
    uniqueBefore.legalNameEn === uniqueAfter?.legalNameEn &&
    uniqueBefore.legalNameAr === uniqueAfter?.legalNameAr;
  console.log("UNIQUE_UNCHANGED:", uniqueUnchanged ? "PASS" : "FAIL");
  console.log(
    "ELITE_OK:",
    eliteAfter?.legalNameEn === ELITE_EN && eliteAfter?.legalNameAr === ELITE_AR ? "PASS" : "FAIL",
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
