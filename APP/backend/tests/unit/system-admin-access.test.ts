import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { AuthUser } from "src/lib/context/auth-context";
import { hasAnyPermission, hasPermission } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";

function systemAdmin(permissions: string[] = []): AuthUser {
  return {
    id: 1,
    email: "admin@example.com",
    status: "ACTIVE",
    permissions,
    roleKeys: ["system_admin"],
    isSystemAdmin: true,
  };
}

function employee(permissions: string[]): AuthUser {
  return {
    id: 2,
    email: "employee@example.com",
    status: "ACTIVE",
    permissions,
    roleKeys: ["fleet_clerk"],
    isSystemAdmin: false,
  };
}

describe("system admin full access", () => {
  test("ADMIN without explicit contracts.read passes contracts.read guard", () => {
    assert.equal(hasPermission(systemAdmin([]), PERMISSIONS.CONTRACTS_READ), true);
  });

  test("ADMIN without explicit finance.read passes finance.read guard", () => {
    assert.equal(hasPermission(systemAdmin([]), PERMISSIONS.FINANCE_READ), true);
  });

  test("ADMIN passes TARS-protected contract read guard", () => {
    assert.equal(hasAnyPermission(systemAdmin([]), [PERMISSIONS.CONTRACTS_READ]), true);
  });

  test("ADMIN passes vehicle/fleet protected action", () => {
    assert.equal(hasPermission(systemAdmin([]), PERMISSIONS.VEHICLES_MANAGE), true);
  });

  test("restricted employee without permission is denied", () => {
    assert.equal(hasPermission(employee([]), PERMISSIONS.CONTRACTS_READ), false);
  });

  test("employee with permission still works", () => {
    assert.equal(
      hasPermission(employee([PERMISSIONS.CONTRACTS_READ]), PERMISSIONS.CONTRACTS_READ),
      true,
    );
  });

  test("future permission not in employee grants is allowed for ADMIN", () => {
    assert.equal(hasPermission(systemAdmin([]), "future.feature.read"), true);
  });

  test("non-admin cannot exploit ADMIN bypass flag", () => {
    const fakeAdmin = employee([PERMISSIONS.USERS_READ]);
    assert.equal(fakeAdmin.isSystemAdmin, false);
    assert.equal(hasPermission(fakeAdmin, PERMISSIONS.CONTRACTS_READ), false);
  });
});
