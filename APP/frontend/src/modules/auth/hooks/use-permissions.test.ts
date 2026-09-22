import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SYSTEM_ADMIN_ROLE } from "../../navigation/navigation.types.ts";

/**
 * Pure mirror of usePermissions logic for unit tests (no React session harness).
 */
function resolveHasPermission(
  permissions: string[],
  roles: Array<{ key: string }>,
  permission: string,
): boolean {
  const isSystemAdmin = roles.some((role) => role.key === SYSTEM_ADMIN_ROLE);
  return isSystemAdmin || permissions.includes(permission);
}

describe("usePermissions system admin rule", () => {
  it("system admin passes contracts.read without explicit grant", () => {
    assert.equal(resolveHasPermission([], [{ key: SYSTEM_ADMIN_ROLE }], "contracts.read"), true);
  });

  it("system admin passes finance.read without explicit grant", () => {
    assert.equal(resolveHasPermission([], [{ key: SYSTEM_ADMIN_ROLE }], "finance.read"), true);
  });

  it("system admin passes future permissions", () => {
    assert.equal(
      resolveHasPermission([], [{ key: SYSTEM_ADMIN_ROLE }], "future.module.read"),
      true,
    );
  });

  it("restricted employee still requires explicit grants", () => {
    assert.equal(resolveHasPermission([], [{ key: "fleet_clerk" }], "contracts.read"), false);
    assert.equal(
      resolveHasPermission(["vehicles.read"], [{ key: "fleet_clerk" }], "vehicles.read"),
      true,
    );
  });
});
