/**
 * Fail-closed guards so integration / test processes cannot open Prisma against
 * operational `haidara` (or other non-disposable databases).
 */

const DISPOSABLE_INTEGRATION_DB = "haidara_test";

const FORBIDDEN_OPERATIONAL_DB_NAMES = new Set(["haidara", "diamond"]);

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

export function isIntegrationTestProcess(): boolean {
  return process.env.RUN_INTEGRATION === "true" || process.env.DIAMOND_INTEGRATION_SUBPROCESS === "true";
}

/** Refuse unless the URL targets the disposable integration database exactly. */
export function assertTestDatabaseUrl(databaseUrl: string): void {
  const dbName = extractPostgresDatabaseName(databaseUrl);
  if (dbName !== DISPOSABLE_INTEGRATION_DB) {
    throw new Error(
      `Integration database guard: expected ${DISPOSABLE_INTEGRATION_DB}; refusing ${dbName}`,
    );
  }
}

/**
 * Called at Prisma client initialization. Integration subprocesses must never
 * connect to operational databases even if `src/config/env` was loaded early.
 */
export function assertPrismaDatabaseUrlAllowed(databaseUrl: string): void {
  if (!isIntegrationTestProcess()) {
    return;
  }
  const dbName = extractPostgresDatabaseName(databaseUrl);
  if (FORBIDDEN_OPERATIONAL_DB_NAMES.has(dbName)) {
    throw new Error(
      `Prisma refused operational database "${dbName}" during integration tests. ` +
        `Use TEST_DATABASE_URL → ${DISPOSABLE_INTEGRATION_DB} and load tests/helpers/integration-bootstrap.ts before src/config/env.`,
    );
  }
  assertTestDatabaseUrl(databaseUrl);
}
