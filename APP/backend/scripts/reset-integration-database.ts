/**
 * Clears all rows from the disposable integration database, then re-runs the base seed.
 * Refuses to run unless TEST_DATABASE_URL targets haidara_test.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertTestDatabaseUrl } from "../tests/helpers/integration-harness";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
if (!url) {
  console.error("TEST_DATABASE_URL is required");
  process.exit(1);
}
assertTestDatabaseUrl(url);
process.env.DATABASE_URL = url;

async function truncateIntegrationDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE r RECORD;
    BEGIN
      FOR r IN (
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename <> '_prisma_migrations'
      ) LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;
  `);
}

async function main(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });
  try {
    await truncateIntegrationDatabase(prisma);
    const { runBaseSeed } = await import("../prisma/seed/index");
    await runBaseSeed();
    console.log("Integration database reset complete (haidara_test).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
