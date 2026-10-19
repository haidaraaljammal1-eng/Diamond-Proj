/**
 * Shared guards and helpers for backend integration tests.
 * All destructive reset paths must call {@link assertTestDatabaseUrl} first.
 */
import {
  assertTestDatabaseUrl,
  extractPostgresDatabaseName,
} from "src/lib/db/integration-database-guard";
import { assertRbacE2eDatabaseUrl } from "./rbac-e2e-database";

export { assertTestDatabaseUrl, extractPostgresDatabaseName };

export const INTEGRATION_ENABLED =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

/** Bind Prisma to the disposable integration database for this process. */
export function bindIntegrationDatabase(): void {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL is required for integration tests");
  }
  assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  assertIntegrationEnvMatchesProcessDatabase();
}

/**
 * Fastify Prisma reads the parsed `env` object, not `process.env` after load.
 * If application modules imported `src/config/env` before {@link bindIntegrationDatabase},
 * integration tests would still write to the development database.
 */
export function assertIntegrationEnvMatchesProcessDatabase(): void {
  const expected = process.env.DATABASE_URL;
  if (!expected) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { env } = require("src/config/env") as { env: { DATABASE_URL: string } };
    const effective = extractPostgresDatabaseName(env.DATABASE_URL);
    const bound = extractPostgresDatabaseName(expected);
    if (effective !== bound) {
      throw new Error(
        `Integration database binding mismatch: env module uses "${effective}" but TEST_DATABASE_URL binds "${bound}". ` +
          "Start tests via scripts/run-integration-file.ts (or set DATABASE_URL before any src/ import).",
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Integration database binding mismatch")) {
      throw error;
    }
    // env module not loaded yet — process.env binding is sufficient for a fresh process.
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
    DIAMOND_INTEGRATION_SUBPROCESS: "true",
    TEST_DATABASE_URL: testDatabaseUrl,
    DATABASE_URL: testDatabaseUrl,
  };
}

/** Suffix run-scoped labels for master-data rows keyed by normalizedName. */
export function uniqueFixtureName(run: string, label: string): string {
  return `${label} ${run}`;
}
