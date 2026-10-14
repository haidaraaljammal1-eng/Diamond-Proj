import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { AuthUser } from "src/lib/context/auth-context";
import { FN } from "src/lib/rbac/functional-permissions/keys";
import {
  assertFunctionalRouteAuthorization,
  getNormalizedFunctionalGrants,
  isFunctionalRbacV2Enabled,
} from "src/lib/rbac/functional-permissions/enforcement";
import { resolveRouteFunctionalRequirement } from "src/lib/rbac/functional-permissions/route-requirements";
import { assertVehicleUpdateAuthorized } from "src/lib/rbac/functional-permissions/vehicle-enforcement";
import { normalizeFunctionalGrants } from "src/lib/rbac/functional-permissions/policy-engine";
import { PERMISSION_CATALOG } from "src/constants/permissions";
import { ALL_FUNCTIONAL_CAPABILITY_KEYS } from "src/lib/rbac/functional-permissions/keys";

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

describe("functional RBAC V2 catalog", () => {
  test("catalog includes all 34 functional keys", () => {
    assert.equal(ALL_FUNCTIONAL_CAPABILITY_KEYS.length, 34);
    for (const key of ALL_FUNCTIONAL_CAPABILITY_KEYS) {
      assert.ok(
        PERMISSION_CATALOG.some((row) => row.key === key),
        `missing catalog row for ${key}`,
      );
    }
    assert.equal(
      PERMISSION_CATALOG.length,
      117 + 34,
      "expected 151 catalog rows (117 legacy + 34 functional)",
    );
  });
});

describe("functional RBAC V2 enforcement (env flag)", () => {
  const previous = process.env.FUNCTIONAL_RBAC_V2_ENABLED;

  afterEach(() => {
    if (previous === undefined) {
      process.env.FUNCTIONAL_RBAC_V2_ENABLED = "false";
    } else {
      process.env.FUNCTIONAL_RBAC_V2_ENABLED = previous;
    }
  });

  test("V2 disabled via explicit false env overrides cached true", () => {
    process.env.FUNCTIONAL_RBAC_V2_ENABLED = "false";
    assert.equal(isFunctionalRbacV2Enabled(), false);
  });

  test("V2 disabled: route assertion is a no-op", () => {
    process.env.FUNCTIONAL_RBAC_V2_ENABLED = "false";
    const auth = employee([]);
    assertFunctionalRouteAuthorization(auth, {
      keys: [FN.vehicles.addDelete],
      requireAll: true,
    });
  });

  test("V2 enabled: parent-only cannot pass child route requirement", () => {
    process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
    const auth = employee([FN.vehicles.viewPage]);
    assert.throws(() => {
      assertFunctionalRouteAuthorization(auth, {
        keys: [FN.vehicles.addDelete],
        requireAll: true,
      });
    });
  });

  test("V2 enabled: child grant satisfies mapped vehicle create route", () => {
    process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
    const auth = employee([FN.vehicles.addDelete]);
    const req = resolveRouteFunctionalRequirement("createVehicle");
    assert.ok(req);
    assertFunctionalRouteAuthorization(auth, req);
  });

  test("V2 enabled: legacy vehicles.manage alone does not satisfy create route", () => {
    process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
    const legacyOnly: AuthUser = {
      id: 3,
      email: "legacy@test.local",
      status: "ACTIVE",
      permissions: ["vehicles.manage"],
      roleKeys: ["custom"],
      isSystemAdmin: false,
    };
    const req = resolveRouteFunctionalRequirement("createVehicle")!;
    assert.throws(() => assertFunctionalRouteAuthorization(legacyOnly, req));
  });

  test("V2 enabled: price-only update allowed with edit_prices not add_delete", () => {
    process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
    const auth = employee([FN.vehicles.viewPage, FN.vehicles.editPrices]);
    assertVehicleUpdateAuthorized(auth, { dailyRate: 100 });
    assert.throws(() => {
      assertVehicleUpdateAuthorized(auth, { plateNumber: "X" });
    });
  });

  test("V2 enabled: add_delete does not authorize identity mutation", () => {
    process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
    const auth = employee([FN.vehicles.viewPage, FN.vehicles.addDelete]);
    assert.throws(() => {
      assertVehicleUpdateAuthorized(auth, { vehicleName: "Renamed" });
    });
  });

  test("maintenance create vs lifecycle route mapping", () => {
    const createReq = resolveRouteFunctionalRequirement("createMaintenanceOrder");
    const lifecycleReq = resolveRouteFunctionalRequirement("completeMaintenanceOrder");
    assert.deepEqual(createReq?.keys, [FN.maintenance.create]);
    assert.deepEqual(lifecycleReq?.keys, [FN.maintenance.manageLifecycle]);
  });

  test("normalized grants include parent when child assigned", () => {
    const auth = employee([FN.finance.addExpense]);
    const grants = getNormalizedFunctionalGrants(auth);
    assert.ok(grants.includes(FN.finance.viewPage));
  });
});
