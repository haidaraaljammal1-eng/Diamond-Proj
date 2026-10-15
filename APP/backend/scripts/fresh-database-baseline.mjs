/**
 * Fresh PostgreSQL initialization when historical migrate replay cannot run.
 *
 * Existing databases (already recorded in _prisma_migrations) use
 * `prisma migrate deploy` only. This script refuses haidara and haidara_test.
 *
 * Empty allowlisted database:
 *   1. Apply the current Prisma schema.
 *   2. Apply supplemental objects Prisma cannot model.
 *   3. Verify those objects exist.
 *   4. Record every historical migration as applied, using Prisma's own checksum.
 *   5. Insert the approved company master rows.
 *   6. Run migrate deploy so a later migration still applies.
 *
 * A second run on a completed baseline does not rebuild the schema.
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
} = require("./fresh-database-baseline-lib.cjs");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "prisma", "schema");
const migrationsDir = path.join(root, "prisma", "migrations");
const supplementalPath = path.join(root, "prisma", "baseline", "supplemental.sql");
const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");

const REQUIRED_INDEXES = [
  "invoices_contractId_one_current_idx",
  "contract_payment_attempts_one_active_per_payment_idx",
  "whatsapp_connections_one_current",
  "vehicle_gps_bindings_active_device_key",
];

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
    const detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    throw new Error(`prisma ${args.join(" ")} failed\n${detail}`);
  }
  return result.stdout ?? "";
}

function migrationNames() {
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(migrationsDir, entry.name, "migration.sql")))
    .map((entry) => entry.name)
    .sort();
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

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const databaseName = assertFreshDatabaseTarget(
    databaseUrl,
    process.env.DIAMOND_FRESH_DATABASE_CONFIRM,
  );
  const names = migrationNames();
  if (names.length === 0) throw new Error("No migration directories found");

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
        `Database ${databaseName} has tables but no migration history. Drop this disposable database and rerun. Refusing to mark missing history as applied.`,
      );
    }

    if (!hasHistory) {
      const schemaSql = runPrisma(
        ["migrate", "diff", "--from-empty", "--to-schema", schemaPath, "--script"],
        databaseUrl,
      );
      if (!schemaSql.trim()) throw new Error("Prisma schema diff was empty");
      runPrisma(["db", "execute", "--stdin"], databaseUrl, schemaSql);
      const supplemental = fs.readFileSync(supplementalPath, "utf8");
      runPrisma(["db", "execute", "--stdin"], databaseUrl, supplemental);
      await assertIndexes(client);
      for (const name of names) {
        runPrisma(["migrate", "resolve", "--applied", name], databaseUrl);
      }
    } else {
      const applied = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM "_prisma_migrations"
         WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`,
      );
      const count = applied.rows[0]?.count ?? 0;
      if (count < names.length) {
        throw new Error(
          `Migration history is incomplete (${count}/${names.length}). Drop this disposable database and rerun. Refusing to resolve over a partial history.`,
        );
      }
    }

    await upsertCompanies(client);
    await assertCompanies(client);
    await assertIndexes(client);
  } finally {
    await client.end();
  }

  runPrisma(["migrate", "deploy"], databaseUrl);
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
    const script = drift.stdout ?? "";
    const statements = script
      .split(";")
      .map((part) => part.replace(/--[^\n]*/g, "").trim())
      .filter(Boolean);
    const allowedDrift =
      /DROP INDEX[\s\S]*"(whatsapp_connections_one_current|contract_payment_attempts_one_active_per_payment_idx)"|DROP EXTENSION[\s\S]*"?pgcrypto"?/i;
    const onlyKnownSupplemental = statements.every((statement) =>
      allowedDrift.test(statement),
    );
    if (!onlyKnownSupplemental) {
      throw new Error(`Schema drift after baseline:\n${script}\n${drift.stderr ?? ""}`);
    }
  } else if (drift.status !== 0) {
    throw new Error(`prisma migrate diff failed\n${drift.stdout ?? ""}\n${drift.stderr ?? ""}`);
  }
  console.log(`fresh-baseline-ok database=${databaseName} migrations=${names.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
