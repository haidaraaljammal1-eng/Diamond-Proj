/**
 * Clears all rows from the disposable integration database, then re-runs the base seed.
 * Refuses to run unless TEST_DATABASE_URL targets haidara_test exactly.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertTestDatabaseUrl } from "../tests/helpers/integration-harness";

const url = process.env.TEST_DATABASE_URL ?? "";
if (!url) {
  console.error("TEST_DATABASE_URL is required");
  process.exit(1);
}
assertTestDatabaseUrl(url);
process.env.DATABASE_URL = url;

/** Serialize integration resets so parallel prepares cannot truncate mid-seed. */
const INTEGRATION_RESET_LOCK_KEY = 0x48414944; // "HAID"

async function withIntegrationResetLock<T>(
  prisma: PrismaClient,
  fn: () => Promise<T>,
): Promise<T> {
  await prisma.$executeRawUnsafe(`SELECT pg_advisory_lock(${INTEGRATION_RESET_LOCK_KEY})`);
  try {
    return await fn();
  } finally {
    await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(${INTEGRATION_RESET_LOCK_KEY})`);
  }
}

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

function isRetryableSeedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /deadlock|could not obtain lock|connection terminated|foreign key constraint|P2003/i.test(
    message,
  );
}

async function seedWithRetry(maxAttempts = 3): Promise<void> {
  const { runBaseSeed } = await import("../prisma/seed/index");
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await runBaseSeed();
      if (attempt > 1) {
        console.log(`Base seed succeeded on attempt ${attempt}`);
      }
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableSeedError(error) || attempt === maxAttempts) {
        throw error;
      }
      console.warn(`Base seed attempt ${attempt} failed (retryable); retrying...`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

async function main(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });
  try {
    await withIntegrationResetLock(prisma, async () => {
      await truncateIntegrationDatabase(prisma);
      await seedWithRetry();
    });
    console.log("Integration database reset complete (haidara_test).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
