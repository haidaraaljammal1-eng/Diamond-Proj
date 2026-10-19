import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { FN } from "src/lib/rbac/functional-permissions/keys";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../prisma/migrations/20261019140000_violations_permission_simplification/migration.sql",
);

test("violations simplification migration preserves review_dues and collect_charges", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8").toLowerCase();
  assert.ok(!/delete\s+from\s+permissions/i.test(sql), "must not delete permission rows");
  assert.ok(!/delete\s+from\s+role_permissions/i.test(sql), "must not remove role grants");
});

test("violations simplification migration seeds all four capability keys", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  for (const key of [
    FN.violations.manualCollection,
    FN.violations.reviewDues,
    FN.violations.collectCharges,
  ]) {
    assert.match(sql, new RegExp(key.replace(/\./g, "\\.")), `migration must reference ${key}`);
  }
});

test("violations simplification migration backfills manual_collection from collect_charges grants", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  assert.match(sql, /manual_collection/);
  assert.match(sql, /collect_charges/);
  assert.match(sql, /INSERT INTO role_permissions/i);
});
