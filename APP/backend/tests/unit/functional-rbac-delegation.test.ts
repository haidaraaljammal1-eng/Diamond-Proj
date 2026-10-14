import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { AuthUser } from "src/lib/context/auth-context";
import { FN } from "src/lib/rbac/functional-permissions/keys";
import { normalizeFunctionalGrants } from "src/lib/rbac/functional-permissions/policy-engine";
import {
  assertActorMayDelegatePermissionKeys,
  assertActorMayDeleteRole,
  assertNoFunctionalKeysInLegacyPermissionPayload,
} from "src/lib/rbac/functional-permissions/delegation-guard";

function employee(grants: string[]): AuthUser {
  const normalized = normalizeFunctionalGrants(grants);
  return {
    id: 2,
    email: "emp@test.local",
    status: "ACTIVE",
    permissions: normalized.ok ? normalized.normalized : grants,
    roleKeys: ["custom"],
    isSystemAdmin: false,
  };
}

describe("delegation guard (V2)", () => {
  const previous = process.env.FUNCTIONAL_RBAC_V2_ENABLED;

  afterEach(() => {
    if (previous === undefined) {
      process.env.FUNCTIONAL_RBAC_V2_ENABLED = "false";
    } else {
      process.env.FUNCTIONAL_RBAC_V2_ENABLED = previous;
    }
  });

  test("V2 disabled: delegation checks are no-ops", () => {
    process.env.FUNCTIONAL_RBAC_V2_ENABLED = "false";
    const actor = employee([]);
    assertActorMayDelegatePermissionKeys(actor, [FN.vehicles.addDelete]);
    assertNoFunctionalKeysInLegacyPermissionPayload([FN.vehicles.addDelete]);
  });

  test("V2 enabled: cannot delegate capability actor does not hold", () => {
    process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
    const actor = employee([FN.finance.viewPage]);
    assert.throws(() => {
      assertActorMayDelegatePermissionKeys(actor, [FN.finance.addExpense]);
    });
  });

  test("V2 enabled: child grant allows delegating that child", () => {
    process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
    const actor = employee([FN.finance.addExpense]);
    assertActorMayDelegatePermissionKeys(actor, [FN.finance.addExpense]);
  });

  test("V2 enabled: legacy keys require actor legacy grant", () => {
    process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
    const actor: AuthUser = {
      id: 1,
      email: "a@test",
      status: "ACTIVE",
      permissions: ["finance.read"],
      roleKeys: ["x"],
      isSystemAdmin: false,
    };
    assert.throws(() => {
      assertActorMayDelegatePermissionKeys(actor, ["finance.manage_expenses"]);
    });
  });

  test("V2 enabled: functional keys blocked on legacy permissions endpoint payload", () => {
    process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
    assert.throws(() => {
      assertNoFunctionalKeysInLegacyPermissionPayload([FN.roles.managePermissions]);
    });
  });

  test("V2 enabled: role delete requires system admin", () => {
    process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
    assert.throws(() => assertActorMayDeleteRole(employee([FN.roles.createEdit])));
    assertActorMayDeleteRole({
      id: 1,
      email: "admin",
      status: "ACTIVE",
      permissions: [],
      roleKeys: ["system_admin"],
      isSystemAdmin: true,
    });
  });
});
