/**
 * Fail-closed guards for the disposable RBAC V2 E2E database.
 * Never targets operational `diamond`, `haidara`, or owner `haidara_test`.
 */
import { extractPostgresDatabaseName } from "./integration-harness";

export const RBAC_E2E_DATABASE_PREFIX = "diamond_rbac_v2_e2e_";

/** Exact names that must never be used as disposable E2E targets. */
export const FORBIDDEN_OPERATIONAL_DATABASES = new Set([
  "diamond",
  "haidara",
  "haidara_test",
  "postgres",
  "template0",
  "template1",
]);

export function isRbacE2eDatabaseName(dbName: string): boolean {
  const normalized = dbName.trim().toLowerCase();
  if (!normalized.startsWith(RBAC_E2E_DATABASE_PREFIX)) return false;
  const suffix = normalized.slice(RBAC_E2E_DATABASE_PREFIX.length);
  return /^[a-z0-9_]+$/.test(suffix) && suffix.length >= 6;
}

export function assertRbacE2eDatabaseUrl(databaseUrl: string): void {
  const dbName = extractPostgresDatabaseName(databaseUrl);
  if (FORBIDDEN_OPERATIONAL_DATABASES.has(dbName.toLowerCase())) {
    throw new Error(
      `RBAC E2E refuses operational database name "${dbName}"`,
    );
  }
  if (!isRbacE2eDatabaseName(dbName)) {
    throw new Error(
      `RBAC E2E database must match ${RBAC_E2E_DATABASE_PREFIX}<suffix>; refusing: ${dbName}`,
    );
  }
}

export function replaceDatabaseName(
  databaseUrl: string,
  nextDatabaseName: string,
): string {
  const normalized = databaseUrl.trim();
  const withScheme =
    normalized.startsWith("postgres://") || normalized.startsWith("postgresql://")
      ? normalized
      : `postgresql://${normalized}`;
  const parsed = new URL(withScheme);
  parsed.pathname = `/${encodeURIComponent(nextDatabaseName)}`;
  return parsed.toString();
}

export function buildPostgresAdminUrl(databaseUrl: string): string {
  return replaceDatabaseName(databaseUrl, "postgres");
}
