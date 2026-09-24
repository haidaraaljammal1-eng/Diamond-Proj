/**
 * Runs each integration test file in its own Node process with a fresh
 * haidara_test reset, so suites cannot pollute one another.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { buildIntegrationProcessEnv } from "../tests/helpers/integration-harness";

const backendRoot = process.cwd();
const integrationDir = path.join(backendRoot, "tests", "integration");
const files = readdirSync(integrationDir)
  .filter((name) => name.endsWith(".test.ts"))
  .sort();

let integrationEnv: NodeJS.ProcessEnv;
try {
  integrationEnv = buildIntegrationProcessEnv(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

let failures = 0;
for (const file of files) {
  console.log(`\n=== ${file} ===`);
  const prepare = spawnSync("npm", ["run", "test:integration:prepare"], {
    cwd: backendRoot,
    stdio: "inherit",
    shell: true,
    env: integrationEnv,
  });
  if (prepare.status !== 0) {
    failures += 1;
    continue;
  }
  const test = spawnSync(
    "npx",
    [
      "tsx",
      "--import",
      "./tests/helpers/integration-bootstrap.ts",
      "--test",
      path.join("tests", "integration", file),
    ],
    { cwd: backendRoot, stdio: "inherit", env: integrationEnv, shell: true },
  );
  if (test.status !== 0) failures += 1;
}

process.exit(failures > 0 ? 1 : 0);
