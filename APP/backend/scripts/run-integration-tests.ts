/**
 * Runs each integration test file in its own Node process with a fresh
 * haidara_test reset, so suites cannot pollute one another.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const integrationDir = path.join(backendRoot, "tests", "integration");
const files = readdirSync(integrationDir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort();

if (process.env.RUN_INTEGRATION !== "true" || !process.env.TEST_DATABASE_URL) {
  console.error("RUN_INTEGRATION=true and TEST_DATABASE_URL are required");
  process.exit(1);
}

let failures = 0;
for (const file of files) {
  console.log(`\n=== ${file} ===`);
  const prepare = spawnSync("npm", ["run", "test:integration:prepare"], {
    cwd: backendRoot,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (prepare.status !== 0) {
    failures += 1;
    continue;
  }
  const test = spawnSync(
    "node",
    ["--import", "tsx", "--test", path.join("tests", "integration", file)],
    { cwd: backendRoot, stdio: "inherit", env: process.env },
  );
  if (test.status !== 0) failures += 1;
}

process.exit(failures > 0 ? 1 : 0);
