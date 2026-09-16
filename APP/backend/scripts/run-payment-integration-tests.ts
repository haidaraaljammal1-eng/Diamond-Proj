import { spawnSync } from "node:child_process";
import { env } from "src/config/env";

const explicit = process.env.TEST_DATABASE_URL?.trim();
const derived = env.DATABASE_URL.replace(/\/haidara(\?|$)/, "/haidara_test$1");
const testUrl = explicit || derived;

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
  ["--import", "tsx", "--test-concurrency=1", "--test", ...files],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      RUN_INTEGRATION: "true",
      TEST_DATABASE_URL: testUrl,
      DATABASE_URL: testUrl,
    },
  },
);

process.exit(result.status ?? 1);
