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
}
