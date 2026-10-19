import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import {
  assertPrismaDatabaseUrlAllowed,
  assertTestDatabaseUrl,
} from "src/lib/db/integration-database-guard";

test("assertTestDatabaseUrl rejects operational haidara", () => {
  assert.throws(
    () => assertTestDatabaseUrl("postgresql://localhost:5432/haidara"),
    /haidara_test/,
  );
});

test("assertPrismaDatabaseUrlAllowed blocks haidara when RUN_INTEGRATION", () => {
  const prevRun = process.env.RUN_INTEGRATION;
  const prevSub = process.env.DIAMOND_INTEGRATION_SUBPROCESS;
  process.env.RUN_INTEGRATION = "true";
  process.env.DIAMOND_INTEGRATION_SUBPROCESS = "true";
  try {
    assert.throws(
      () => assertPrismaDatabaseUrlAllowed("postgresql://localhost:5432/haidara"),
      /Prisma refused operational database/,
    );
    assertPrismaDatabaseUrlAllowed("postgresql://localhost:5432/haidara_test");
  } finally {
    process.env.RUN_INTEGRATION = prevRun;
    process.env.DIAMOND_INTEGRATION_SUBPROCESS = prevSub;
  }
});

test("integration bootstrap binds env before src/config/env loads", () => {
  const backendRoot = path.resolve(__dirname, "../..");
  const bootstrap = pathToFileURL(
    path.join(backendRoot, "tests/helpers/integration-bootstrap.ts"),
  ).href;
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--import",
      bootstrap,
      "-e",
      "import { env } from 'src/config/env'; import { extractPostgresDatabaseName } from 'src/lib/db/integration-database-guard'; console.log(extractPostgresDatabaseName(env.DATABASE_URL));",
    ],
    {
      cwd: backendRoot,
      env: {
        ...process.env,
        RUN_INTEGRATION: "true",
        TEST_DATABASE_URL: "postgresql://localhost:5432/haidara_test?schema=public",
        DATABASE_URL: "postgresql://localhost:5432/haidara?schema=public",
      },
      encoding: "utf8",
    },
  );
  assert.equal(child.status, 0, child.stderr || child.stdout);
  assert.equal(child.stdout.trim(), "haidara_test");
});

test("buildApp refuses haidara under RUN_INTEGRATION without bootstrap", () => {
  const backendRoot = path.resolve(__dirname, "../..");
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      "process.env.RUN_INTEGRATION='true'; process.env.DIAMOND_INTEGRATION_SUBPROCESS='true'; (async () => { const { buildApp } = await import('src/app'); await buildApp(); })().catch((e) => { console.error(e.message); process.exit(2); });",
    ],
    {
      cwd: backendRoot,
      env: {
        ...process.env,
        RUN_INTEGRATION: "true",
        DIAMOND_INTEGRATION_SUBPROCESS: "true",
        TEST_DATABASE_URL: "postgresql://localhost:5432/haidara_test?schema=public",
      },
      encoding: "utf8",
      timeout: 60_000,
    },
  );
  assert.notEqual(child.status, 0);
  assert.match(`${child.stderr}${child.stdout}`, /Prisma refused operational|Integration database guard/);
});
