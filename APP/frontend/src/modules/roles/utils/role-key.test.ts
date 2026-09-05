import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRoleKey } from "./role-key.ts";

describe("buildRoleKey", () => {
  it("slugifies a Latin name", () => {
    assert.equal(buildRoleKey("Branch Manager", []), "branch_manager");
  });

  it("strips accents and punctuation", () => {
    assert.equal(buildRoleKey("Régional — Lead!", []), "regional_lead");
  });

  it("falls back for a name with no Latin letters", () => {
    assert.equal(buildRoleKey("مدير الفرع", []), "role");
  });

  it("never starts with a digit", () => {
    assert.match(buildRoleKey("2nd line support", []), /^[a-z]/);
  });

  it("suffixes until the key is unique", () => {
    const existing = ["branch_manager", "branch_manager_2"];
    assert.equal(buildRoleKey("Branch Manager", existing), "branch_manager_3");
  });

  it("keeps Arabic-only names unique too", () => {
    assert.equal(buildRoleKey("مدير الفرع", ["role"]), "role_2");
  });

  it("stays inside the Backend length limit", () => {
    const key = buildRoleKey("x".repeat(80), []);
    assert.ok(key.length <= 50, key);
    assert.match(key, /^[a-z][a-z0-9_]*$/);
  });

  it("keeps the key valid when suffixing a maximum-length name", () => {
    const base = buildRoleKey("y".repeat(80), []);
    const key = buildRoleKey("y".repeat(80), [base]);
    assert.ok(key.length <= 50, key);
    assert.notEqual(key, base);
    assert.match(key, /^[a-z][a-z0-9_]*$/);
  });

  it("always produces a Backend-valid key", () => {
    for (const name of ["Ops · Lead", "  ", "___", "9", "دور جديد", "A-B/C"]) {
      assert.match(buildRoleKey(name, []), /^[a-z][a-z0-9_]*$/, name);
    }
  });
});
