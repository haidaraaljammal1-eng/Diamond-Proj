import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const explicit = process.env.TEST_DATABASE_URL?.trim();
const derived = (process.env.DATABASE_URL ?? "").replace(/\/haidara(\?|$)/, "/haidara_test$1").replace(
  /\/diamond(\?|$)/,
  "/haidara_test$1",
);
const testUrl = explicit || derived;
const bootstrap = pathToFileURL(
  path.join(__dirname, "../tests/helpers/integration-bootstrap.ts"),
).href;

if (!/\/haidara_test(?:\?|$)/.test(testUrl)) {
  console.error("TEST_DATABASE_URL must point at haidara_test");
  process.exit(1);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: tsx scripts/run-payment-integration-tests.ts <test files...>");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--import", bootstrap, "--test-concurrency=1", "--test", ...files],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      RUN_INTEGRATION: "true",
      DIAMOND_INTEGRATION_SUBPROCESS: "true",
      TEST_DATABASE_URL: testUrl,
      DATABASE_URL: "postgresql://localhost:5432/haidara?schema=public",
    },
  },
);

process.exit(result.status ?? 1);
