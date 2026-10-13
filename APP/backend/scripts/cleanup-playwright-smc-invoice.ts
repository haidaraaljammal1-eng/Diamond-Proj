import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { bindIntegrationDatabase, assertTestDatabaseUrl } from "tests/helpers/integration-harness";
import { cleanupStaffManualChargeRunArtifacts } from "tests/helpers/staff-manual-charge-cleanup";

bindIntegrationDatabase();
assertTestDatabaseUrl(process.env.DATABASE_URL!);

const fixturePath = path.resolve(
  __dirname,
  "../../frontend/e2e/.fixtures/smc-invoice-haidara-test.json",
);

async function main() {
  const raw = await readFile(fixturePath, "utf8");
  const fixture = JSON.parse(raw) as {
    run: string;
    cleanup: {
      contractIds: string[];
      customerId: number;
      vehicleIds: number[];
      adminEmail: string;
    };
  };
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  await cleanupStaffManualChargeRunArtifacts(prisma, {
    run: fixture.run,
    contractIds: fixture.cleanup.contractIds,
    customerId: fixture.cleanup.customerId,
    vehicleIds: fixture.cleanup.vehicleIds,
    adminEmail: fixture.cleanup.adminEmail,
  });
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
