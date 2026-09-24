/**
 * Loaded before each integration test file so direct `node --test` runs cannot
 * accidentally inherit a development DATABASE_URL.
 */
import { buildIntegrationProcessEnv } from "./integration-harness";

if (process.env.RUN_INTEGRATION === "true") {
  const env = buildIntegrationProcessEnv(process.env);
  process.env.DATABASE_URL = env.DATABASE_URL!;
  process.env.TEST_DATABASE_URL = env.TEST_DATABASE_URL!;
}
