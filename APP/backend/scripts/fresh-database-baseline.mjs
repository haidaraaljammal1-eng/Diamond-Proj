/**
 * Initializes an allowlisted empty PostgreSQL database from the sealed
 * Phase 1 baseline, then applies only migrations created after that boundary.
 *
 * Historical migration SQL is not executed and is not edited. Its result is
 * prisma/baseline/schema.sql plus prisma/baseline/supplemental.sql.
 * Later migration directories run through `prisma migrate deploy`.
 * This script refuses haidara and haidara_test.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import pg from "pg";

const require = createRequire(import.meta.url);
const {
  APPROVED_COMPANIES,
  HISTORICAL_WRONG_LEGAL_NAMES,
  assertFreshDatabaseTarget,
  assertMigrationHistory,
  driftPreservesCustomSql,
  loadBoundary,
  splitMigrations,
  verifySnapshotFiles,
} = require("./fresh-database-baseline-lib.cjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "prisma", "schema");
const migrationsDir = path.join(root, "prisma", "migrations");
const baselineDir = path.join(root, "prisma", "baseline");
const frozenSchemaPath = path.join(baselineDir, "schema.sql");
const supplementalPath = path.join(baselineDir, "supplemental.sql");
const boundaryPath = path.join(baselineDir, "boundary.json");
const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");

const REQUIRED_INDEXES = [
  "invoices_contractId_one_current_idx",
  "contract_payment_attempts_one_active_per_payment_idx",
  "whatsapp_connections_one_current",
  "vehicle_gps_bindings_active_device_key",
];

function redact(text) {
  return String(text).replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgresql://***@");
}

function prismaEnv(databaseUrl) {
  return { ...process.env, DATABASE_URL: databaseUrl };
}

function runPrisma(args, databaseUrl, input) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    cwd: root,
    env: prismaEnv(databaseUrl),
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const detail = redact(`${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim());
    throw new Error(`prisma ${args.join(" ")} failed\n${detail}`);
  }
  return result.stdout ?? "";
}

function migrationDirectoryNames() {
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() && fs.existsSync(path.join(migrationsDir, entry.name, "migration.sql")),
    )
    .map((entry) => entry.name)
    .sort();
}

function migrationBytes(names) {
  const bytes = new Map();
  for (const name of names) {
    bytes.set(name, fs.readFileSync(path.join(migrationsDir, name, "migration.sql")));
  }
  return bytes;
}

async function publicTables(client) {
  const result = await client.query(
    `SELECT c.relname AS name
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY c.relname`,
  );
  return result.rows.map((row) => row.name);
}

async function readHistory(client) {
  const result = await client.query(
    `SELECT migration_name, checksum, finished_at, rolled_back_at
     FROM "_prisma_migrations"
     ORDER BY migration_name`,
  );
  return result.rows;
}

async function upsertCompanies(client) {
  for (const company of APPROVED_COMPANIES) {
    await client.query(
      `INSERT INTO "operating_companies"
         ("code", "displayName", "legalNameAr", "legalNameEn", "accentColor", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT ("code") DO UPDATE
         SET "displayName" = EXCLUDED."displayName",
             "legalNameAr" = EXCLUDED."legalNameAr",
             "legalNameEn" = EXCLUDED."legalNameEn",
             "accentColor" = EXCLUDED."accentColor",
             "updatedAt" = CURRENT_TIMESTAMP`,
      [company.code, company.displayName, company.legalNameAr, company.legalNameEn, company.accentColor],
    );
  }
}

async function assertCompanies(client) {
  const result = await client.query(
    `SELECT "code", "legalNameEn" FROM "operating_companies" ORDER BY "code"`,
  );
  const byCode = new Map(result.rows.map((row) => [row.code, row.legalNameEn]));
  for (const company of APPROVED_COMPANIES) {
    if (byCode.get(company.code) !== company.legalNameEn) {
      throw new Error(`Company ${company.code} legal name is not the approved value`);
    }
  }
  for (const wrong of HISTORICAL_WRONG_LEGAL_NAMES) {
    if (result.rows.some((row) => row.legalNameEn === wrong)) {
      throw new Error("Historical company legal name is still present");
    }
  }
}

async function assertIndexes(client) {
  const result = await client.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[])`,
    [REQUIRED_INDEXES],
  );
  const present = new Set(result.rows.map((row) => row.indexname));
  const missing = REQUIRED_INDEXES.filter((name) => !present.has(name));
  if (missing.length > 0) throw new Error(`Missing indexes: ${missing.join(", ")}`);
}

function assertDrift(databaseUrl) {
  const drift = spawnSync(
    process.execPath,
    [
      prismaCli,
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      schemaPath,
      "--exit-code",
      "--script",
    ],
    {
      cwd: root,
      env: prismaEnv(databaseUrl),
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (drift.status === 2) {
    if (!driftPreservesCustomSql(drift.stdout ?? "")) {
      throw new Error(
        `Schema drift changes objects outside the custom-SQL preservation policy:\n${redact(drift.stdout ?? "")}`,
      );
    }
    return;
  }
  if (drift.status !== 0) {
    throw new Error(
      `prisma migrate diff failed\n${redact(drift.stdout ?? "")}\n${redact(drift.stderr ?? "")}`,
    );
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const databaseName = assertFreshDatabaseTarget(
    databaseUrl,
    process.env.DIAMOND_FRESH_DATABASE_CONFIRM,
  );
  const boundary = loadBoundary(boundaryPath);
  verifySnapshotFiles(boundary, {
    schemaPath: frozenSchemaPath,
    supplementalPath,
    migrationsDir,
  });
  const names = migrationDirectoryNames();
  const split = splitMigrations(names, boundary);
  const bytes = migrationBytes(names);

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const current = await client.query("SELECT current_database() AS name");
    if (current.rows[0]?.name !== databaseName) {
      throw new Error("Connected database does not match the confirmed name");
    }

    const tables = await publicTables(client);
    const hasHistory = tables.includes("_prisma_migrations");
    if (!hasHistory && tables.length > 0) {
      throw new Error(
        `Database ${databaseName} has tables but no migration history. Refusing to mark missing history as applied.`,
      );
    }

    if (!hasHistory) {
      runPrisma(["db", "execute", "--stdin"], databaseUrl, fs.readFileSync(frozenSchemaPath, "utf8"));
      runPrisma(["db", "execute", "--stdin"], databaseUrl, fs.readFileSync(supplementalPath, "utf8"));
      await assertIndexes(client);
      for (const name of split.sealed) {
        runPrisma(["migrate", "resolve", "--applied", name], databaseUrl);
      }
      assertMigrationHistory(await readHistory(client), split.sealed, [], bytes);
    } else {
      assertMigrationHistory(await readHistory(client), split.sealed, split.future, bytes);
    }

    await upsertCompanies(client);
    await assertCompanies(client);
    await assertIndexes(client);
  } finally {
    await client.end();
  }

  runPrisma(["migrate", "deploy"], databaseUrl);

  const verify = new pg.Client({ connectionString: databaseUrl });
  await verify.connect();
  try {
    assertMigrationHistory(
      await readHistory(verify),
      [...split.sealed, ...split.future],
      [],
      bytes,
    );
    await assertCompanies(verify);
    await assertIndexes(verify);
  } finally {
    await verify.end();
  }

  assertDrift(databaseUrl);
  console.log(
    `fresh-baseline-ok database=${databaseName} boundary=${split.sealed.length} future=${split.future.length}`,
  );
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : error));
  process.exit(1);
});
