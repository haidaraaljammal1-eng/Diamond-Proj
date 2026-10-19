import assert from "node:assert/strict";
import { test } from "node:test";
import { assertTestDatabaseUrl } from "src/lib/db/integration-database-guard";

test("assertTestDatabaseUrl rejects operational haidara", () => {
  assert.throws(
    () => assertTestDatabaseUrl("postgresql://postgres:admin@localhost:5432/haidara"),
    /haidara_test/,
  );
});

test("assertTestDatabaseUrl accepts haidara_test", () => {
  assertTestDatabaseUrl("postgresql://postgres:admin@localhost:5432/haidara_test");
});
