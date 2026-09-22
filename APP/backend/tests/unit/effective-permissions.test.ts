import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ALL_PERMISSION_KEYS } from "src/constants/roles";
import { resolveEffectivePermissions } from "src/lib/rbac/effective-permissions";

describe("resolveEffectivePermissions", () => {
  test("system_admin receives every catalog permission", () => {
    const result = resolveEffectivePermissions([
      {
        key: "system_admin",
        isSystem: true,
        permissions: [{ permission: { key: "users.read" } }],
      },
    ]);
    assert.equal(result.isSystemAdmin, true);
    assert.deepEqual(result.permissions.sort(), [...ALL_PERMISSION_KEYS].sort());
  });

  test("employee receives only explicit role grants", () => {
    const result = resolveEffectivePermissions([
      {
        key: "fleet_clerk",
        isSystem: false,
        permissions: [{ permission: { key: "vehicles.read" } }],
      },
    ]);
    assert.equal(result.isSystemAdmin, false);
    assert.deepEqual(result.permissions, ["vehicles.read"]);
  });

  test("future catalog permission is included for system admin without seed row", () => {
    const result = resolveEffectivePermissions([
      {
        key: "system_admin",
        isSystem: true,
        permissions: [],
      },
    ]);
    assert.equal(result.permissions.includes("contracts.read"), true);
    assert.equal(result.permissions.length, ALL_PERMISSION_KEYS.length);
  });
});
