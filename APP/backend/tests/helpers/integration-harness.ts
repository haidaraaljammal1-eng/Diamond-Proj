/**
 * Shared guards and helpers for backend integration tests.
 * All destructive reset paths must call {@link assertTestDatabaseUrl} first.
 */

export const INTEGRATION_ENABLED =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

/** Bind Prisma to the disposable integration database for this process. */
export function bindIntegrationDatabase(): void {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL is required for integration tests");
  }
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

/** Fail closed unless the URL clearly targets the disposable test database. */
export function assertTestDatabaseUrl(databaseUrl: string): void {
  if (!/haidara_test(?:\?|$)/i.test(databaseUrl)) {
    throw new Error(
      `Integration cleanup is restricted to haidara_test; refusing: ${databaseUrl}`,
    );
  }
}

/** Suffix run-scoped labels for master-data rows keyed by normalizedName. */
export function uniqueFixtureName(run: string, label: string): string {
  return `${label} ${run}`;
}
