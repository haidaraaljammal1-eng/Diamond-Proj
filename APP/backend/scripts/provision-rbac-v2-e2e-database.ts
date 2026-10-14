/**
 * Creates a new disposable RBAC V2 E2E database, migrates, and seeds.
 * Never touches haidara_test, diamond, or pre-existing databases.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";
import {
  RBAC_E2E_DATABASE_PREFIX,
  assertRbacE2eDatabaseUrl,
  buildPostgresAdminUrl,
  replaceDatabaseName,
} from "../tests/helpers/rbac-e2e-database";
import { extractPostgresDatabaseName } from "../tests/helpers/integration-harness";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const backendRoot = path.resolve(__dirname, "..");
const localDir = path.join(backendRoot, ".local");
const manifestPath = path.join(localDir, "rbac-v2-e2e.manifest.json");

async function main(): Promise<void> {
  const templateUrl = process.env.DATABASE_URL ?? "";
  if (!templateUrl) {
    console.error("DATABASE_URL missing (read host/credentials only)");
    process.exit(1);
  }

  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const dbName = `${RBAC_E2E_DATABASE_PREFIX}${suffix}`.toLowerCase();
  const e2eUrl = replaceDatabaseName(templateUrl, dbName);
  assertRbacE2eDatabaseUrl(e2eUrl);

  const adminUrl = buildPostgresAdminUrl(templateUrl);
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  const exists = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [dbName],
  );
  if ((exists.rowCount ?? 0) > 0) {
    await admin.end();
    throw new Error(`Refusing to reuse existing database: ${dbName}`);
  }
  if (!/^[a-z0-9_]+$/.test(dbName)) {
    throw new Error("Invalid generated database name");
  }
  await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const deployEnv = {
    ...process.env,
    DATABASE_URL: e2eUrl,
    RBAC_E2E_DATABASE_URL: e2eUrl,
  };
  // Fresh E2E DB: `db push` avoids historical migration ordering issues on empty DB.
  const push = spawnSync(
    "npx",
    ["prisma", "db", "push", "--accept-data-loss"],
    {
      cwd: backendRoot,
      env: deployEnv,
      stdio: "inherit",
      shell: true,
    },
  );
  if (push.status !== 0) process.exit(push.status ?? 1);

  const seed = spawnSync("npx", ["tsx", "prisma/seed.ts"], {
    cwd: backendRoot,
    env: deployEnv,
    stdio: "inherit",
    shell: true,
  });
  if (seed.status !== 0) process.exit(seed.status ?? 1);

  fs.mkdirSync(localDir, { recursive: true });
  const manifest = {
    databaseName: dbName,
    databaseUrlRedacted: e2eUrl.replace(/:\/\/([^:]+):([^@]+)@/, "://***:***@"),
    host: new URL(e2eUrl.replace(/^postgresql:/, "http:")).hostname,
    schema: "public",
    createdAt: new Date().toISOString(),
    distinctFromDevelopment: extractPostgresDatabaseName(templateUrl) !== dbName,
  };
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ ...manifest, databaseUrl: e2eUrl }, null, 2),
    "utf8",
  );
  process.stdout.write(`${e2eUrl}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
