import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertDevelopmentDatabase,
  formatSafeDatabaseTarget,
  parseDatabaseTarget,
} from "src/lib/dev/development-database";

describe("parseDatabaseTarget", () => {
  it("extracts host, port and database without the password", () => {
    const target = parseDatabaseTarget(
      "postgresql://postgres:s3cret@localhost:5432/haidara",
    );
    assert.deepEqual(target, {
      host: "localhost",
      port: "5432",
      database: "haidara",
    });
    assert.equal(formatSafeDatabaseTarget(target), "localhost:5432 / haidara");
  });
});

describe("assertDevelopmentDatabase", () => {
  it("allows a local development database", () => {
    const target = assertDevelopmentDatabase({
      nodeEnv: "development",
      databaseUrl: "postgresql://postgres:postgres@localhost:5432/haidara",
    });
    assert.equal(target.database, "haidara");
  });

  it("refuses production NODE_ENV", () => {
    assert.throws(
      () =>
        assertDevelopmentDatabase({
          nodeEnv: "production",
          databaseUrl: "postgresql://postgres:postgres@localhost:5432/haidara",
        }),
      /NODE_ENV=production/,
    );
  });

  it("refuses a remote host", () => {
    assert.throws(
      () =>
        assertDevelopmentDatabase({
          nodeEnv: "development",
          databaseUrl: "postgresql://user:pass@db.example.com:5432/haidara",
        }),
      /not a local development database/,
    );
  });

  it("refuses a production-looking database name", () => {
    assert.throws(
      () =>
        assertDevelopmentDatabase({
          nodeEnv: "development",
          databaseUrl: "postgresql://postgres:postgres@localhost:5432/haidara_prod",
        }),
      /looks like production/,
    );
  });
});
