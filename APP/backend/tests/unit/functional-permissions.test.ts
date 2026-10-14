import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ALL_PERMISSION_KEYS } from "src/constants/roles";
import { resolveEffectivePermissions } from "src/lib/rbac/effective-permissions";
import {
  FN,
  ALL_FUNCTIONAL_CAPABILITY_KEYS,
  FUNCTIONAL_PAGES,
  assertFunctionalRegistryInvariants,
  canPerformFunctionalCapability,
  canViewFunctionalPage,
  getCapabilityDependencyMetadata,
  getFunctionalCapability,
  isSinglePageFullControlCapability,
  normalizeFunctionalGrants,
  removeFunctionalGrant,
  validateFunctionalGrants,
} from "src/lib/rbac/functional-permissions";
import type { FunctionalAuthContext } from "src/lib/rbac/functional-permissions";

function ctx(
  grants: string[],
  isSystemAdmin = false,
): FunctionalAuthContext {
  const normalized = normalizeFunctionalGrants(grants);
  return {
    functionalGrants: normalized.ok ? normalized.normalized : grants,
    isSystemAdmin,
  };
}

describe("functional permission registry", () => {
  test("registry invariants hold", () => {
    assertFunctionalRegistryInvariants();
  });

  test("capability keys are unique", () => {
    assert.equal(
      new Set(ALL_FUNCTIONAL_CAPABILITY_KEYS).size,
      ALL_FUNCTIONAL_CAPABILITY_KEYS.length,
    );
  });

  test("exactly 12 approved page groups", () => {
    assert.equal(FUNCTIONAL_PAGES.length, 12);
    const ids = FUNCTIONAL_PAGES.map((p) => p.id).sort();
    assert.deepEqual(ids, [
      "archive",
      "contracts",
      "dashboard",
      "finance",
      "gps",
      "invoices",
      "maintenance",
      "roles",
      "users",
      "vehicles",
      "violations",
      "whatsapp",
    ]);
  });

  test("single full-control pages", () => {
    for (const pageId of ["dashboard", "gps", "archive", "whatsapp"] as const) {
      const page = FUNCTIONAL_PAGES.find((p) => p.id === pageId)!;
      assert.equal(page.model, "single_full_control");
      assert.equal(page.capabilityKeys.length, 1);
      assert.equal(isSinglePageFullControlCapability(page.rootCapabilityKey), true);
    }
  });
});

describe("parent/child policy engine", () => {
  test("child grant implies parent", () => {
    const result = normalizeFunctionalGrants([FN.vehicles.editPrices]);
    assert.equal(result.ok, true);
    assert.ok(result.normalized.includes(FN.vehicles.viewPage));
    assert.ok(result.normalized.includes(FN.vehicles.editPrices));
  });

  test("explicit parent removal clears children", () => {
    const base = normalizeFunctionalGrants([
      FN.vehicles.viewPage,
      FN.vehicles.addDelete,
      FN.vehicles.editPrices,
    ]).normalized;
    const after = removeFunctionalGrant(base, FN.vehicles.viewPage);
    assert.deepEqual(after, []);
  });

  test("parent-only does not imply child operations", () => {
    const user = ctx([FN.vehicles.viewPage]);
    assert.equal(canViewFunctionalPage(user, "vehicles"), true);
    assert.equal(canPerformFunctionalCapability(user, FN.vehicles.viewPage), true);
    assert.equal(canPerformFunctionalCapability(user, FN.vehicles.addDelete), false);
    assert.equal(canPerformFunctionalCapability(user, FN.vehicles.editPrices), false);
  });

  test("invalid unknown grants are rejected", () => {
    const result = validateFunctionalGrants(["diamond.fn.unknown"]);
    assert.equal(result.ok, false);
    assert.equal(result.issues[0]?.code, "UNKNOWN_CAPABILITY");
  });

  test("no cross-page inheritance", () => {
    const user = ctx([FN.maintenance.create]);
    assert.equal(canViewFunctionalPage(user, "vehicles"), false);
    assert.equal(canPerformFunctionalCapability(user, FN.vehicles.viewPage), false);
  });

  test("single-page permission enables full page capability", () => {
    const user = ctx([FN.gps.full]);
    assert.equal(canViewFunctionalPage(user, "gps"), true);
    assert.equal(canPerformFunctionalCapability(user, FN.gps.full), true);
  });
});

describe("owner-approved capability separation (metadata)", () => {
  test("maintenance lifecycle mapping excludes create", () => {
    const lifecycle = getFunctionalCapability(FN.maintenance.manageLifecycle)!;
    assert.ok(lifecycle.operationalActions.includes("completeMaintenanceOrder"));
    assert.ok(lifecycle.operationalActions.includes("cancelMaintenanceOrder"));
    const create = getFunctionalCapability(FN.maintenance.create)!;
    assert.ok(create.operationalActions.includes("createMaintenanceOrder"));
    assert.equal(
      getCapabilityDependencyMetadata(FN.maintenance.create)!.impliedPersistedLegacyKeys
        .length,
      0,
    );
  });

  test("maintenance create does not authorize lifecycle management", () => {
    const user = ctx([FN.maintenance.create]);
    assert.equal(
      canPerformFunctionalCapability(user, FN.maintenance.manageLifecycle),
      false,
    );
  });

  test("vehicle pricing separate from add/delete", () => {
    const pricesOnly = ctx([FN.vehicles.viewPage, FN.vehicles.editPrices]);
    assert.equal(canPerformFunctionalCapability(pricesOnly, FN.vehicles.editPrices), true);
    assert.equal(canPerformFunctionalCapability(pricesOnly, FN.vehicles.addDelete), false);

    const addOnly = ctx([FN.vehicles.viewPage, FN.vehicles.addDelete]);
    assert.equal(canPerformFunctionalCapability(addOnly, FN.vehicles.addDelete), true);
    assert.equal(canPerformFunctionalCapability(addOnly, FN.vehicles.editPrices), false);
  });

  test("invoice PDF distinct from view page parent", () => {
    const viewOnly = ctx([FN.invoices.viewPage]);
    assert.equal(canPerformFunctionalCapability(viewOnly, FN.invoices.viewPage), true);
    assert.equal(canPerformFunctionalCapability(viewOnly, FN.invoices.downloadPdf), false);
    assert.equal(canPerformFunctionalCapability(viewOnly, FN.invoices.sendWhatsapp), false);
  });

  test("roles metadata vs permission delegation", () => {
    const metaOnly = ctx([FN.roles.viewPage, FN.roles.createEdit]);
    assert.equal(canPerformFunctionalCapability(metaOnly, FN.roles.createEdit), true);
    assert.equal(
      canPerformFunctionalCapability(metaOnly, FN.roles.managePermissions),
      false,
    );
  });
});

describe("system administrator", () => {
  test("functional layer honors system admin override", () => {
    const admin = ctx([], true);
    assert.equal(canViewFunctionalPage(admin, "contracts"), true);
    assert.equal(canPerformFunctionalCapability(admin, FN.contracts.collectionClosure), true);
  });

  test("existing resolveEffectivePermissions still grants full catalog", () => {
    const result = resolveEffectivePermissions([
      {
        key: "system_admin",
        isSystem: true,
        permissions: [],
      },
    ]);
    assert.equal(result.isSystemAdmin, true);
    assert.equal(result.permissions.length, ALL_PERMISSION_KEYS.length);
  });
});

describe("legacy broad grants not implied for persistence", () => {
  test("dependency metadata never auto-implies vehicles.manage", () => {
    const meta = getCapabilityDependencyMetadata(FN.maintenance.create)!;
    assert.equal(meta.impliedPersistedLegacyKeys.length, 0);
    assert.ok(
      meta.contextualLookups.some((l) => l.lookupPermission === "reference_data.lookup"),
    );
    assert.equal(
      meta.impliedPersistedLegacyKeys.includes("vehicles.manage"),
      false,
    );
  });
});
