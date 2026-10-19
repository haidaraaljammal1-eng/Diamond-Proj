/**
 * Runs integration tests against haidara_test without resetting the database.
 * Usage: npx tsx scripts/run-integration-file.ts <test-file> [more files]
 */
import dotenv from "dotenv";
import path from "node:path";
import { spawn } from "node:child_process";
import { buildIntegrationProcessEnv } from "../tests/helpers/integration-harness";

const integrationBootstrap = path.join(__dirname, "../tests/helpers/integration-bootstrap.ts");

dotenv.config({ override: true });

if (!process.env.TEST_DATABASE_URL && process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/haidara_test";
  process.env.TEST_DATABASE_URL = url.toString();
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("test file required");
  process.exit(1);
}

let env: NodeJS.ProcessEnv;
try {
  env = buildIntegrationProcessEnv();
} catch {
  console.error("refused to start integration tests");
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [
    "--import",
    "tsx",
    "--import",
    integrationBootstrap,
    "--test",
    "--test-concurrency=1",
    ...files,
  ],
  { env, stdio: "inherit" },
);

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
