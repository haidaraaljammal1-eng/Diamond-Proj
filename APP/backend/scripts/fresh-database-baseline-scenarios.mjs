/**
 * Disposable PostgreSQL checks for the sealed baseline boundary.
 * Refuses to start unless DIAMOND_BASELINE_SCENARIOS=1.
 * Creates only diamond_fresh_scn* databases. Never touches haidara.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const PROBE_NAME = "20261015120000_phase1_future_probe";
const REQUIRED_INDEXES = [
  "invoices_contractId_one_current_idx",
  "contract_payment_attempts_one_active_per_payment_idx",
  "whatsapp_connections_one_current",
  "vehicle_gps_bindings_active_device_key",
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "prisma", "migrations");
const probeSource = path.join(root, "prisma", "baseline", "probes", "future-custom.sql");
const probeDir = path.join(migrationsDir, PROBE_NAME);
const baselineScript = path.join(root, "scripts", "fresh-database-baseline.mjs");

function redact(text) {
  return String(text).replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgresql://***@");
}

function assertScenarioName(name) {
  if (!/^diamond_fresh_scn[a-z0-9]+$/.test(name)) {
    throw new Error(`Refusing scenario database name: ${name}`);
  }
}

function databaseUrlFor(name) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

function clearLeftoverProbe() {
  const sqlPath = path.join(probeDir, "migration.sql");
  if (!fs.existsSync(sqlPath)) return;
  const onDisk = fs.readFileSync(sqlPath);
  const probe = fs.readFileSync(probeSource);
  if (!onDisk.equals(probe)) {
    throw new Error("Unexpected migration occupies the synthetic probe name");
  }
  fs.rmSync(probeDir, { recursive: true, force: true });
}

function installProbe() {
  if (fs.existsSync(probeDir)) throw new Error("Synthetic probe directory already exists");
  fs.mkdirSync(probeDir);
  fs.copyFileSync(probeSource, path.join(probeDir, "migration.sql"));
}

function removeProbe() {
  fs.rmSync(probeDir, { recursive: true, force: true });
}

function runBaseline(databaseName) {
  assertScenarioName(databaseName);
  return spawnSync(process.execPath, [baselineScript], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrlFor(databaseName),
      DIAMOND_FRESH_DATABASE_CONFIRM: databaseName,
    },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function expectBaselineOk(databaseName, label) {
  const result = runBaseline(databaseName);
  if (result.status !== 0) {
    throw new Error(
      `${label} baseline failed\n${redact(result.stdout ?? "")}\n${redact(result.stderr ?? "")}`,
    );
  }
  if (!String(result.stdout).includes("fresh-baseline-ok")) {
    throw new Error(`${label} baseline did not report success`);
  }
  return result.stdout;
}

function expectBaselineReject(databaseName, pattern, label) {
  const result = runBaseline(databaseName);
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.status === 0 || !pattern.test(output)) {
    throw new Error(`${label} was not rejected\n${redact(output)}`);
  }
}

async function withAdmin(fn) {
  const admin = new pg.Client({ connectionString: databaseUrlFor("postgres") });
  await admin.connect();
  try {
    const current = await admin.query("SELECT current_database() AS name");
    if (current.rows[0]?.name !== "postgres") {
      throw new Error("Scenario admin connection is not the postgres maintenance database");
    }
    await fn(admin);
  } finally {
    await admin.end();
  }
}

async function recreate(admin, name) {
  assertScenarioName(name);
  await admin.query(
    `SELECT pg_terminate_backend(pid)
     FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [name],
  );
  await admin.query(`DROP DATABASE IF EXISTS ${name}`);
  await admin.query(`CREATE DATABASE ${name}`);
}

async function withDatabase(name, fn) {
  assertScenarioName(name);
  const client = new pg.Client({ connectionString: databaseUrlFor(name) });
  await client.connect();
  try {
    const current = await client.query("SELECT current_database() AS name");
    if (current.rows[0]?.name !== name) throw new Error("Connected to an unexpected database");
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function assertIntegrity(client, { migrations, probe }) {
  const history = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM "_prisma_migrations"
     WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  );
  if (history.rows[0].count !== migrations) {
    throw new Error(`Expected ${migrations} finished migrations, found ${history.rows[0].count}`);
  }
  const companies = await client.query(
    `SELECT code, "legalNameEn", "legalNameAr" FROM operating_companies ORDER BY code`,
  );
  const expected = [
    ["ELITE", "Diamond Elite Car Rental LLC", "شركة دايموند إيليت لتأجير السيارات ذ.م.م ش.ش.و"],
    ["UNIQUE", "Diamond Unique Car Rental CO.L.L.C.S.O.C", "شركة دايموند يونيك لتأجير السيارات ذ.م.م ش.ش.و"],
  ];
  if (companies.rows.length !== expected.length) {
    throw new Error(`Expected ${expected.length} companies, found ${companies.rows.length}`);
  }
  for (const [code, legalNameEn, legalNameAr] of expected) {
    const row = companies.rows.find((item) => item.code === code);
    if (!row || row.legalNameEn !== legalNameEn || row.legalNameAr !== legalNameAr) {
      throw new Error(`Company ${code} does not have the approved legal names`);
    }
  }
  const indexes = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = ANY($1::text[])`,
    [REQUIRED_INDEXES],
  );
  if (indexes.rows.length !== REQUIRED_INDEXES.length) {
    throw new Error(`Expected ${REQUIRED_INDEXES.length} protected indexes`);
  }
  const byName = new Map(indexes.rows.map((row) => [row.indexname, row.indexdef]));
  if (!/WHERE/i.test(byName.get("invoices_contractId_one_current_idx") ?? "")) {
    throw new Error("Invoice partial index is missing its predicate");
  }
  if (!/PREPARING/.test(byName.get("contract_payment_attempts_one_active_per_payment_idx") ?? "")) {
    throw new Error("Payment partial index predicate is missing");
  }
  if (!/\(1\)/.test(byName.get("whatsapp_connections_one_current") ?? "")) {
    throw new Error("WhatsApp expression index is missing");
  }
  const extension = await client.query(`SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'`);
  if (extension.rowCount !== 1) throw new Error("pgcrypto extension is missing");
  const uniqueCode = await client.query(
    `SELECT indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'operating_companies_code_key'`,
  );
  if (!/UNIQUE INDEX/i.test(uniqueCode.rows[0]?.indexdef ?? "") || !/\(code\)/i.test(uniqueCode.rows[0]?.indexdef ?? "")) {
    throw new Error("operating_companies code unique index is missing");
  }
  const constraints = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE contype = 'p')::int AS primary_keys,
       COUNT(*) FILTER (WHERE contype = 'f')::int AS foreign_keys
     FROM pg_constraint
     WHERE connamespace = 'public'::regnamespace`,
  );
  if (constraints.rows[0].primary_keys < 1 || constraints.rows[0].foreign_keys < 1) {
    throw new Error("Schema is missing primary or foreign key constraints");
  }
  const probeRow = await client.query(`SELECT to_regprocedure('diamond_phase1_future_probe()') AS name`);
  if (probe && !probeRow.rows[0]?.name) throw new Error("Future custom function was not created");
  if (!probe && probeRow.rows[0]?.name) throw new Error("Future custom function exists before its migration");
  if (probe) {
    const value = await client.query(`SELECT diamond_phase1_future_probe() AS value`);
    if (Number(value.rows[0]?.value) !== 1) throw new Error("Future custom function did not return 1");
    const steps = await client.query(
      `SELECT applied_steps_count
       FROM "_prisma_migrations"
       WHERE migration_name = $1`,
      [PROBE_NAME],
    );
    if (Number(steps.rows[0]?.applied_steps_count ?? 0) < 1) {
      throw new Error("Future migration was recorded without executing its SQL");
    }
  }
}

async function main() {
  if (process.env.DIAMOND_BASELINE_SCENARIOS !== "1") {
    throw new Error("Refusing to run without DIAMOND_BASELINE_SCENARIOS=1");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const configured = decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.replace(/^\//, ""));
  if (configured === "haidara" || configured === "haidara_test") {
    throw new Error(`Refusing scenario run against ${configured}`);
  }
  clearLeftoverProbe();

  try {
    await withAdmin(async (admin) => {
      await recreate(admin, "diamond_fresh_scn1");
      await recreate(admin, "diamond_fresh_scn2");
    });

    expectBaselineOk("diamond_fresh_scn1", "fresh");
    await withDatabase("diamond_fresh_scn1", (client) =>
      assertIntegrity(client, { migrations: 56, probe: false }),
    );
    const firstTables = await withDatabase("diamond_fresh_scn1", async (client) => {
      const result = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r'`,
      );
      return result.rows[0].count;
    });
    expectBaselineOk("diamond_fresh_scn1", "second");
    await withDatabase("diamond_fresh_scn1", async (client) => {
      await assertIntegrity(client, { migrations: 56, probe: false });
      const result = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r'`,
      );
      if (result.rows[0].count !== firstTables) {
        throw new Error("Second initialization changed the table count");
      }
    });
    console.log("baseline-scenario-ok fresh-and-second");

    expectBaselineOk("diamond_fresh_scn2", "existing-baseline");
    installProbe();
    expectBaselineOk("diamond_fresh_scn2", "upgrade");
    await withDatabase("diamond_fresh_scn2", (client) =>
      assertIntegrity(client, { migrations: 57, probe: true }),
    );
    expectBaselineOk("diamond_fresh_scn2", "upgrade-second");
    await withDatabase("diamond_fresh_scn2", (client) =>
      assertIntegrity(client, { migrations: 57, probe: true }),
    );
    console.log("baseline-scenario-ok future-upgrade");

    await withAdmin(async (admin) => {
      await recreate(admin, "diamond_fresh_scn3");
    });
    expectBaselineOk("diamond_fresh_scn3", "fresh-with-future");
    await withDatabase("diamond_fresh_scn3", (client) =>
      assertIntegrity(client, { migrations: 57, probe: true }),
    );
    console.log("baseline-scenario-ok fresh-after-future-migration");

    removeProbe();

    await withDatabase("diamond_fresh_scn1", async (client) => {
      await client.query(
        `UPDATE "_prisma_migrations"
         SET finished_at = NULL
         WHERE migration_name = '20261014120000_archive_manual_cell_values'`,
      );
    });
    expectBaselineReject("diamond_fresh_scn1", /failed or unfinished/, "unfinished-history");
    console.log("baseline-scenario-ok reject-unfinished");

    await withAdmin(async (admin) => {
      await recreate(admin, "diamond_fresh_scn4");
    });
    expectBaselineOk("diamond_fresh_scn4", "checksum-base");
    const originalChecksum = await withDatabase("diamond_fresh_scn4", async (client) => {
      const saved = await client.query(
        `SELECT checksum FROM "_prisma_migrations" WHERE migration_name = '20260903000000_init'`,
      );
      await client.query(
        `UPDATE "_prisma_migrations"
         SET checksum = $1
         WHERE migration_name = '20260903000000_init'`,
        ["0".repeat(64)],
      );
      return saved.rows[0].checksum;
    });
    expectBaselineReject("diamond_fresh_scn4", /checksum mismatch/, "checksum-mismatch");
    console.log("baseline-scenario-ok reject-checksum");

    await withDatabase("diamond_fresh_scn4", async (client) => {
      await client.query(
        `UPDATE "_prisma_migrations" SET checksum = $1 WHERE migration_name = '20260903000000_init'`,
        [originalChecksum],
      );
      await client.query(
        `DELETE FROM "_prisma_migrations" WHERE migration_name = '20261014120000_archive_manual_cell_values'`,
      );
    });
    expectBaselineReject("diamond_fresh_scn4", /missing from history/, "missing-history");
    console.log("baseline-scenario-ok reject-missing");
  } finally {
    removeProbe();
  }

  if (fs.existsSync(probeDir)) throw new Error("Synthetic probe directory was left in prisma/migrations");
  console.log("baseline-scenario-ok complete");
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : error));
  process.exit(1);
});
