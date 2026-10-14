/**
 * Shared guards and helpers for backend integration tests.
 * All destructive reset paths must call {@link assertTestDatabaseUrl} first.
 */
import { assertRbacE2eDatabaseUrl } from "./rbac-e2e-database";

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

/**
 * Integration or RBAC E2E disposable DB — never operational `diamond` / `haidara`.
 * When `RBAC_E2E_DATABASE_URL` is set, it must be used exclusively (no fallback).
 */
export function resolveDisposableDatabaseUrl(
  source: NodeJS.ProcessEnv = process.env,
): string {
  const explicitE2e = source.RBAC_E2E_DATABASE_URL?.trim();
  if (explicitE2e) {
    assertRbacE2eDatabaseUrl(explicitE2e);
    return explicitE2e;
  }
  const explicitTest = source.TEST_DATABASE_URL?.trim();
  if (explicitTest) {
    assertTestDatabaseUrl(explicitTest);
    return explicitTest;
  }
  const devUrl = source.DATABASE_URL ?? "";
  if (!devUrl) {
    throw new Error("DATABASE_URL or TEST_DATABASE_URL or RBAC_E2E_DATABASE_URL is required");
  }
  if (source.RBAC_E2E_STRICT === "true") {
    throw new Error(
      "RBAC_E2E_STRICT=true forbids falling back to DATABASE_URL; set RBAC_E2E_DATABASE_URL",
    );
  }
  const derived = devUrl.replace(/\/([^/?]+)(\?|$)/, "/haidara_test$2");
  assertTestDatabaseUrl(derived);
  return derived;
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
