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
  assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

/** Parse the database name from a PostgreSQL connection URL. */
export function extractPostgresDatabaseName(databaseUrl: string): string {
  const normalized = databaseUrl.trim();
  if (!normalized) {
    throw new Error("Database URL is empty");
  }
  const withScheme = normalized.startsWith("postgres://") || normalized.startsWith("postgresql://")
    ? normalized
    : `postgresql://${normalized}`;
  const parsed = new URL(withScheme);
  const rawName = parsed.pathname.replace(/^\/+/, "");
  if (!rawName) {
    throw new Error("Database URL is missing a database name");
  }
  return decodeURIComponent(rawName.split("/")[0] ?? "");
}

/**
 * Fail closed unless the URL targets the disposable integration database exactly.
 * Substring matches like `prod_haidara_test` or `haidara` are rejected.
 */
export function assertTestDatabaseUrl(databaseUrl: string): void {
  const dbName = extractPostgresDatabaseName(databaseUrl);
  if (dbName !== "haidara_test") {
    throw new Error(
      `Integration cleanup is restricted to haidara_test; refusing: ${databaseUrl}`,
    );
  }
}

/** Authoritative integration subprocess environment for per-file runs. */
export function buildIntegrationProcessEnv(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const testDatabaseUrl = source.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for integration tests");
  }
  assertTestDatabaseUrl(testDatabaseUrl);
  return {
    ...source,
    RUN_INTEGRATION: "true",
    TEST_DATABASE_URL: testDatabaseUrl,
    DATABASE_URL: testDatabaseUrl,
  };
}

/** Suffix run-scoped labels for master-data rows keyed by normalizedName. */
export function uniqueFixtureName(run: string, label: string): string {
  return `${label} ${run}`;
}
