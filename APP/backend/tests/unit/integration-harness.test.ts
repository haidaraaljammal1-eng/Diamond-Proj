import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertTestDatabaseUrl,
  extractPostgresDatabaseName,
} from "tests/helpers/integration-harness";

describe("extractPostgresDatabaseName", () => {
  it("reads the database name from a PostgreSQL URL with query params", () => {
    assert.equal(
      extractPostgresDatabaseName(
        "postgresql://postgres:admin@localhost:5432/haidara_test?schema=public",
      ),
      "haidara_test",
    );
  });
});

describe("assertTestDatabaseUrl", () => {
  it("accepts the disposable integration database", () => {
    assertTestDatabaseUrl("postgresql://postgres:admin@localhost:5432/haidara_test");
    assertTestDatabaseUrl(
      "postgresql://postgres:admin@localhost:5432/haidara_test?schema=public",
    );
  });

  it("rejects non-test database names", () => {
    for (const url of [
      "postgresql://postgres:admin@localhost:5432/haidara",
      "postgresql://postgres:admin@localhost:5432/prod_haidara_test",
      "postgresql://postgres:admin@localhost:5432/haidara_test_backup",
      "postgresql://postgres:admin@localhost:5432/haidara_test2",
    ]) {
      assert.throws(() => assertTestDatabaseUrl(url), /haidara_test/);
    }
  });

  it("rejects empty and malformed URLs", () => {
    assert.throws(() => assertTestDatabaseUrl(""), /empty/i);
    assert.throws(() => assertTestDatabaseUrl("not-a-url"), /missing a database name/i);
  });
});
