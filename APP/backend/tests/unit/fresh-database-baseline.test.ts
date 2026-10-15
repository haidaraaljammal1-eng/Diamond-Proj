import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { OPERATING_COMPANY_LEGAL_NAME_EN } from "src/modules/operating-companies/operating-company-legal-names";

const nodeRequire = createRequire(__filename);
const lib = nodeRequire("../../scripts/fresh-database-baseline-lib.cjs") as {
  APPROVED_COMPANIES: Array<{ code: string; legalNameEn: string; legalNameAr: string }>;
  HISTORICAL_WRONG_LEGAL_NAMES: string[];
  assertFreshDatabaseTarget: (databaseUrl: string, confirmName: string | undefined) => string;
  assertMigrationHistory: (
    rows: Array<{
      migration_name: string;
      checksum: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>,
    requiredNames: string[],
    optionalNames: string[],
    fileBytesByName: Map<string, Buffer>,
  ) => void;
  canonicalSha256: (bytes: Buffer | string) => string;
  driftPreservesCustomSql: (script: string) => boolean;
  loadBoundary: (filePath: string) => {
    id: string;
    lastMigration: string;
    migrations: Array<{ name: string; sha256: string }>;
  };
  rawSha256: (bytes: Buffer | string) => string;
  splitMigrations: (
    directoryNames: string[],
    boundary: { lastMigration: string; migrations: Array<{ name: string }> },
  ) => { sealed: string[]; future: string[]; last: string };
  verifySnapshotFiles: (
    boundary: unknown,
    paths: { schemaPath: string; supplementalPath: string; migrationsDir: string },
  ) => void;
};

const backendRoot = path.resolve(__dirname, "../..");
const baselineDir = path.join(backendRoot, "prisma", "baseline");
const migrationsDir = path.join(backendRoot, "prisma", "migrations");

test("fresh baseline uses the approved legal names and not the historical migration text", () => {
  const unique = lib.APPROVED_COMPANIES.find((row) => row.code === "UNIQUE");
  const elite = lib.APPROVED_COMPANIES.find((row) => row.code === "ELITE");
  assert.equal(unique?.legalNameEn, OPERATING_COMPANY_LEGAL_NAME_EN.UNIQUE);
  assert.equal(elite?.legalNameEn, OPERATING_COMPANY_LEGAL_NAME_EN.ELITE);
  assert.equal(unique?.legalNameEn, "Diamond Unique Car Rental CO.L.L.C.S.O.C");
  assert.equal(elite?.legalNameEn, "Diamond Elite Car Rental LLC");
  for (const wrong of lib.HISTORICAL_WRONG_LEGAL_NAMES) {
    assert.equal(
      lib.APPROVED_COMPANIES.some((row) => row.legalNameEn === wrong || row.legalNameAr === wrong),
      false,
    );
  }
});

test("fresh baseline refuses operational database names", () => {
  assert.throws(
    () => lib.assertFreshDatabaseTarget("postgresql://diamond@127.0.0.1:5432/haidara", "haidara"),
    /Refusing/,
  );
  assert.throws(
    () => lib.assertFreshDatabaseTarget("postgresql://diamond@127.0.0.1:5432/haidara_test", "haidara_test"),
    /Refusing/,
  );
  assert.throws(
    () =>
      lib.assertFreshDatabaseTarget(
        "postgresql://diamond@127.0.0.1:5432/diamond_staging",
        "diamond_fresh_other",
      ),
    /DIAMOND_FRESH_DATABASE_CONFIRM/,
  );
  assert.equal(
    lib.assertFreshDatabaseTarget(
      "postgresql://diamond@127.0.0.1:5432/diamond_fresh_phase1",
      "diamond_fresh_phase1",
    ),
    "diamond_fresh_phase1",
  );
});

test("sealed baseline checksums match the frozen files and historical SQL", () => {
  const boundary = lib.loadBoundary(path.join(baselineDir, "boundary.json"));
  assert.equal(boundary.id, "phase1-20261015");
  assert.equal(boundary.lastMigration, "20261014120000_archive_manual_cell_values");
  assert.equal(boundary.migrations.length, 56);
  assert.doesNotThrow(() =>
    lib.verifySnapshotFiles(boundary, {
      schemaPath: path.join(baselineDir, "schema.sql"),
      supplementalPath: path.join(baselineDir, "supplemental.sql"),
      migrationsDir,
    }),
  );

  const initBytes = fs.readFileSync(path.join(migrationsDir, "20260903000000_init", "migration.sql"));
  const init = boundary.migrations.find((entry) => entry.name === "20260903000000_init");
  const raw = lib.rawSha256(initBytes);
  assert.equal(lib.canonicalSha256(initBytes), init?.sha256);
  assert.equal(
    raw === "8bf48eb58bccf11f03ab35315c509c4cf5f48c9b5f4b4c95290c691596c46abb" || raw === init?.sha256,
    true,
  );

  const historical = fs.readFileSync(
    path.join(migrationsDir, "20260920012059_multi_company_foundation", "migration.sql"),
    "utf8",
  );
  assert.match(historical, /DIAMOND UNIQUE CAR RENTALS CO\. LLC S\.O\.C/);
  const schema = fs.readFileSync(path.join(baselineDir, "schema.sql"), "utf8");
  assert.equal(schema.startsWith("-- Sealed Phase 1 baseline schema"), true);
  assert.equal(schema.includes("-- CreateSchema"), true);
  assert.equal(schema.includes("DIAMOND UNIQUE CAR RENTALS"), false);
  assert.equal(schema.includes("DIAMOND ELITE CAR RENTALS"), false);
  assert.equal(fs.existsSync(path.join(migrationsDir, "20261015120000_phase1_future_probe")), false);
});

test("baseline split keeps future migrations pending and rejects a backdated directory", () => {
  const boundary = lib.loadBoundary(path.join(baselineDir, "boundary.json"));
  const names = boundary.migrations.map((entry) => entry.name);
  const futureName = "20261015120000_phase1_future_probe";
  const split = lib.splitMigrations([...names, futureName], boundary);
  assert.deepEqual(split.future, [futureName]);
  assert.equal(split.sealed.length, 56);
  assert.equal(split.sealed.includes(futureName), false);
  assert.throws(
    () => lib.splitMigrations([...names, "20260901000000_backdated_gap"], boundary),
    /do not match the sealed snapshot/,
  );
});

test("drift policy keeps custom SQL and rejects structural changes", () => {
  assert.equal(lib.driftPreservesCustomSql(""), true);
  assert.equal(lib.driftPreservesCustomSql('-- DropIndex\nDROP INDEX "foo";'), true);
  assert.equal(lib.driftPreservesCustomSql("BEGIN;\nDROP FUNCTION diamond_phase1_future_probe();\nCOMMIT;"), true);
  assert.equal(lib.driftPreservesCustomSql('DROP EXTENSION IF EXISTS "pgcrypto";'), true);
  assert.equal(lib.driftPreservesCustomSql('DROP TABLE "contracts";'), false);
  assert.equal(lib.driftPreservesCustomSql('ALTER TABLE "contracts" DROP COLUMN "status";'), false);
  assert.equal(lib.driftPreservesCustomSql('CREATE INDEX "x" ON "vehicles" ("id");'), false);
});

test("migration history rejects failed, unknown, and checksum-mismatched rows", () => {
  const bytes = Buffer.from("SELECT 1;\n");
  const checksum = lib.rawSha256(bytes);
  const files = new Map([["20261014120000_archive_manual_cell_values", bytes]]);
  const good = {
    migration_name: "20261014120000_archive_manual_cell_values",
    checksum,
    finished_at: new Date(),
    rolled_back_at: null,
  };
  assert.doesNotThrow(() => lib.assertMigrationHistory([good], [good.migration_name], [], files));
  assert.throws(
    () => lib.assertMigrationHistory([{ ...good, finished_at: null }], [good.migration_name], [], files),
    /failed or unfinished/,
  );
  assert.throws(
    () => lib.assertMigrationHistory([{ ...good, checksum: "0".repeat(64) }], [good.migration_name], [], files),
    /checksum mismatch/,
  );
  assert.throws(
    () => lib.assertMigrationHistory([], [good.migration_name], [], files),
    /missing from history/,
  );
});
