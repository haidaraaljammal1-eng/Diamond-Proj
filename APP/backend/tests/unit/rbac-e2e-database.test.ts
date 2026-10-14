import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  assertRbacE2eDatabaseUrl,
  isRbacE2eDatabaseName,
  replaceDatabaseName,
} from "../helpers/rbac-e2e-database";

describe("RBAC E2E database guards", () => {
  test("accepts disposable E2E name", () => {
    const name = "diamond_rbac_v2_e2e_abc123_xy";
    assert.equal(isRbacE2eDatabaseName(name), true);
    assertRbacE2eDatabaseUrl(
      `postgresql://u:p@localhost:5432/${name}?schema=public`,
    );
  });

  test("rejects haidara_test and diamond", () => {
    assert.throws(() =>
      assertRbacE2eDatabaseUrl(
        "postgresql://u:p@localhost:5432/haidara_test",
      ),
    );
    assert.throws(() =>
      assertRbacE2eDatabaseUrl("postgresql://u:p@localhost:5432/diamond"),
    );
  });

  test("replaceDatabaseName swaps only db segment", () => {
    const next = replaceDatabaseName(
      "postgresql://u:p@localhost:5432/diamond?schema=public",
      "diamond_rbac_v2_e2e_run1",
    );
    assert.match(next, /\/diamond_rbac_v2_e2e_run1\?/);
  });
});
