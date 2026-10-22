/**
 * Loaded via `node --import` BEFORE integration test files so `src/config/env`
 * and Prisma never parse a development DATABASE_URL.
 */
import { buildIntegrationProcessEnv } from "./integration-harness";

if (process.env.RUN_INTEGRATION === "true") {
  const env = buildIntegrationProcessEnv(process.env);
  process.env.DATABASE_URL = env.DATABASE_URL!;
  process.env.TEST_DATABASE_URL = env.TEST_DATABASE_URL!;
  process.env.DIAMOND_INTEGRATION_SUBPROCESS = "true";
  // Must run before test files import `src/config/env` (pino-pretty worker breaks inject on Windows).
  process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";
  process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
  process.env.RATE_LIMIT_AUTH_MAX = process.env.RATE_LIMIT_AUTH_MAX ?? "10000";
  process.env.RATE_LIMIT_GLOBAL_MAX = process.env.RATE_LIMIT_GLOBAL_MAX ?? "100000";
}
