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

interface FileRunResult {
  file: string;
  status: "pass" | "fail" | "prepare_failed";
  tests: number;
  pass: number;
  fail: number;
  skip: number;
}

function parseNodeTestSummary(output: string): Pick<FileRunResult, "tests" | "pass" | "fail" | "skip"> {
  const read = (label: string): number => {
    const match = output.match(new RegExp(`ℹ ${label}\\s+(\\d+)`, "m"));
    return match ? Number.parseInt(match[1]!, 10) : 0;
  };
  return {
    tests: read("tests"),
    pass: read("pass"),
    fail: read("fail"),
    skip: read("skip"),
  };
}

async function runPrepare(env: NodeJS.ProcessEnv, maxAttempts = 3): Promise<{ ok: boolean; output: string }> {
  let combined = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const prepare = spawnSync("npm", ["run", "test:integration:prepare"], {
      cwd: backendRoot,
      stdio: "pipe",
      shell: true,
      env,
      encoding: "utf8",
    });
    const chunk = `${prepare.stdout ?? ""}${prepare.stderr ?? ""}`;
    combined += chunk;
    if (prepare.status === 0) {
      if (attempt > 1) {
        process.stdout.write(`prepare succeeded on attempt ${attempt}\n`);
      }
      return { ok: true, output: combined };
    }
    const retryable =
      /deadlock|could not obtain lock|connection terminated|foreign key constraint|P2003|user_roles_roleId_fkey|role_permissions_roleId_fkey|vehicles_companyId_fkey/i.test(
        chunk,
      );
    if (retryable && attempt < maxAttempts) {
      process.stdout.write(`prepare attempt ${attempt} failed (retryable); retrying...\n`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
      continue;
    }
    process.stdout.write(chunk);
    return { ok: false, output: combined };
  }
  return { ok: false, output: combined };
}

async function main(): Promise<void> {
  let integrationEnv: NodeJS.ProcessEnv;
  try {
    integrationEnv = buildIntegrationProcessEnv(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const results: FileRunResult[] = [];

  for (const file of files) {
    console.log(`\n=== ${file} ===`);
    const prepare = await runPrepare(integrationEnv);
    if (!prepare.ok) {
      results.push({
        file,
        status: "prepare_failed",
        tests: 0,
        pass: 0,
        fail: 0,
        skip: 0,
      });
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
      { cwd: backendRoot, stdio: "pipe", env: integrationEnv, shell: true, encoding: "utf8" },
    );
    const output = `${test.stdout ?? ""}${test.stderr ?? ""}`;
    process.stdout.write(output);
    const summary = parseNodeTestSummary(output);
    results.push({
      file,
      status: test.status === 0 ? "pass" : "fail",
      ...summary,
    });
  }

  const discoveredFiles = files.length;
  const executedFiles = results.filter((row) => row.status !== "prepare_failed").length;
  const prepareFailedFiles = results.filter((row) => row.status === "prepare_failed").length;
  const failedFiles = results.filter((row) => row.status === "fail").length;
  const totalTests = results.reduce((sum, row) => sum + row.tests, 0);
  const totalPass = results.reduce((sum, row) => sum + row.pass, 0);
  const totalFail = results.reduce((sum, row) => sum + row.fail, 0);
  const totalSkip = results.reduce((sum, row) => sum + row.skip, 0);

  console.log("\n=== Integration sweep summary ===");
  console.log(`discovered files: ${discoveredFiles}`);
  console.log(`executed files:   ${executedFiles}`);
  console.log(`prepare failed:   ${prepareFailedFiles}`);
  console.log(`test failures:    ${failedFiles}`);
  console.log(`tests total:      ${totalTests}`);
  console.log(`pass:             ${totalPass}`);
  console.log(`fail:             ${totalFail}`);
  console.log(`skip:             ${totalSkip}`);
  console.log("\nPer file:");
  for (const row of results) {
    const status =
      row.status === "prepare_failed"
        ? "PREPARE_FAIL"
        : row.fail > 0
          ? "FAIL"
          : row.skip > 0
            ? "PASS*"
            : "PASS";
    console.log(
      `  ${row.file.padEnd(48)} ${status.padEnd(12)} tests=${String(row.tests).padStart(3)} pass=${String(row.pass).padStart(3)} fail=${String(row.fail).padStart(2)} skip=${String(row.skip).padStart(2)}`,
    );
  }

  const exitFailures = prepareFailedFiles + failedFiles;
  process.exit(exitFailures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
