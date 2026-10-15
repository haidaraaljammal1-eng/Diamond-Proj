"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Guards, checksums, and the sealed baseline boundary.
 * Historical migration SQL is never edited. This module does not connect.
 */

const APPROVED_COMPANIES = [
  {
    code: "UNIQUE",
    displayName: "UNIQUE",
    legalNameAr: "شركة دايموند يونيك لتأجير السيارات ذ.م.م ش.ش.و",
    legalNameEn: "Diamond Unique Car Rental CO.L.L.C.S.O.C",
    accentColor: "#C9A15C",
  },
  {
    code: "ELITE",
    displayName: "ELITE",
    legalNameAr: "شركة دايموند إيليت لتأجير السيارات ذ.م.م ش.ش.و",
    legalNameEn: "Diamond Elite Car Rental LLC",
    accentColor: "#3E5C76",
  },
];

const FORBIDDEN_DATABASES = new Set([
  "haidara",
  "haidara_test",
  "postgres",
  "template0",
  "template1",
]);

const HISTORICAL_WRONG_LEGAL_NAMES = [
  "DIAMOND UNIQUE CAR RENTALS CO. LLC S.O.C",
  "DIAMOND ELITE CAR RENTALS CO. LLC S.O.C",
];

const BASELINE_ID = "phase1-20261015";

function canonicalSha256(bytes) {
  const source = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const text = source.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function rawSha256(bytes) {
  const source = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return crypto.createHash("sha256").update(source).digest("hex");
}

function loadBoundary(filePath) {
  const boundary = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!boundary || boundary.id !== BASELINE_ID || !Array.isArray(boundary.migrations)) {
    throw new Error("Baseline boundary snapshot is missing or is not phase1-20261015");
  }
  if (boundary.migrations.length === 0) throw new Error("Baseline boundary contains no migrations");
  return boundary;
}

function splitMigrations(directoryNames, boundary) {
  const expected = boundary.migrations.map((entry) => entry.name);
  const sortedExpected = [...expected].sort();
  const last = sortedExpected[sortedExpected.length - 1];
  if (boundary.lastMigration !== last) {
    throw new Error("Baseline lastMigration does not match the sealed migration list");
  }
  const onDisk = [...directoryNames].sort();
  const atBoundary = onDisk.filter((name) => name <= last);
  const future = onDisk.filter((name) => name > last);
  const same =
    atBoundary.length === sortedExpected.length &&
    atBoundary.every((name, index) => name === sortedExpected[index]);
  if (!same) {
    throw new Error(
      "Migration directories at or before the baseline boundary do not match the sealed snapshot",
    );
  }
  return { sealed: sortedExpected, future, last };
}

function verifySnapshotFiles(boundary, paths) {
  const schemaHash = canonicalSha256(fs.readFileSync(paths.schemaPath));
  if (schemaHash !== boundary.schemaSha256) {
    throw new Error("Frozen baseline schema.sql does not match the sealed checksum");
  }
  const supplementalHash = canonicalSha256(fs.readFileSync(paths.supplementalPath));
  if (supplementalHash !== boundary.supplementalSha256) {
    throw new Error("Baseline supplemental.sql does not match the sealed checksum");
  }
  for (const entry of boundary.migrations) {
    const filePath = path.join(paths.migrationsDir, entry.name, "migration.sql");
    const actual = canonicalSha256(fs.readFileSync(filePath));
    if (actual !== entry.sha256) {
      throw new Error(`Sealed migration checksum mismatch: ${entry.name}`);
    }
  }
}

function checksumMatchesApplied(fileBytes, dbChecksum) {
  if (!dbChecksum) return false;
  return dbChecksum === rawSha256(fileBytes) || dbChecksum === canonicalSha256(fileBytes);
}

function assertMigrationHistory(rows, requiredNames, optionalNames, fileBytesByName) {
  const required = new Set(requiredNames);
  const optional = new Set(optionalNames);
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.migration_name)) {
      throw new Error(`Duplicate migration history row: ${row.migration_name}`);
    }
    seen.add(row.migration_name);
    if (row.rolled_back_at) {
      throw new Error(`Migration was rolled back: ${row.migration_name}`);
    }
    if (!row.finished_at) {
      throw new Error(`Migration history is failed or unfinished: ${row.migration_name}`);
    }
    if (!required.has(row.migration_name) && !optional.has(row.migration_name)) {
      throw new Error(`Migration history contains an unknown migration: ${row.migration_name}`);
    }
    const bytes = fileBytesByName.get(row.migration_name);
    if (!bytes || !checksumMatchesApplied(bytes, row.checksum)) {
      throw new Error(`Migration checksum mismatch: ${row.migration_name}`);
    }
  }
  for (const name of requiredNames) {
    if (!seen.has(name)) {
      throw new Error(
        `Sealed baseline migration is missing from history (${name}). Refusing to mark it applied over a partial history.`,
      );
    }
  }
}

function driftPreservesCustomSql(script) {
  const statements = String(script)
    .split(";")
    .map((part) => part.replace(/--[^\n]*/g, "").trim())
    .filter(Boolean);
  return statements.every(
    (statement) =>
      /^(BEGIN|COMMIT|ROLLBACK)\b/i.test(statement) ||
      /^DROP\s+(INDEX|EXTENSION|FUNCTION|PROCEDURE|TRIGGER)\b/i.test(statement),
  );
}

function databaseNameFromUrl(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, "")).split("?")[0];
  if (!name) throw new Error("DATABASE_URL has no database name");
  return name;
}

function assertFreshDatabaseTarget(databaseUrl, confirmName) {
  if (!databaseUrl || !databaseUrl.trim()) {
    throw new Error("DATABASE_URL is required and is not read from .env by this tool");
  }
  const name = databaseNameFromUrl(databaseUrl);
  if (FORBIDDEN_DATABASES.has(name)) {
    throw new Error(`Refusing to initialize database "${name}"`);
  }
  if (!/^diamond_(staging|fresh)(_[a-z0-9]+)?$/.test(name)) {
    throw new Error(
      `Database "${name}" is not an approved fresh target. Use diamond_staging or diamond_fresh_<suffix>.`,
    );
  }
  if (confirmName !== name) {
    throw new Error(
      "DIAMOND_FRESH_DATABASE_CONFIRM must exactly match the database name in DATABASE_URL",
    );
  }
  return name;
}

module.exports = {
  APPROVED_COMPANIES,
  BASELINE_ID,
  FORBIDDEN_DATABASES,
  HISTORICAL_WRONG_LEGAL_NAMES,
  databaseNameFromUrl,
  assertFreshDatabaseTarget,
  canonicalSha256,
  rawSha256,
  loadBoundary,
  splitMigrations,
  verifySnapshotFiles,
  checksumMatchesApplied,
  assertMigrationHistory,
  driftPreservesCustomSql,
};
