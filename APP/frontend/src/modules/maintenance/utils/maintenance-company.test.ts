import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { DEFAULT_MAINTENANCE_FILTERS } from "./maintenance-filters.ts";

/**
 * Maintenance company identity comes from the order's Vehicle projection.
 * `MaintenanceOrder` has no company of its own, the filter is server-side, and
 * the options come from the authoritative OperatingCompany store.
 */

const MODULE_DIR = path.join(import.meta.dirname, "..");
const MESSAGES_DIR = path.join(import.meta.dirname, "../../../../messages");

function read(relative: string): string {
  return readFileSync(path.join(MODULE_DIR, relative), "utf8");
}

describe("Maintenance company source", () => {
  it("projects company on the Vehicle, not on the order", () => {
    const types = read("types/maintenance.types.ts");
    const vehicleBlock = types.slice(
      types.indexOf("export interface MaintenanceVehicleDto"),
      types.indexOf("export interface MaintenanceOrderDto"),
    );
    const orderBlock = types.slice(
      types.indexOf("export interface MaintenanceOrderDto"),
      types.indexOf("export type MaintenanceOrderDetailDto"),
    );
    assert.ok(vehicleBlock.includes("company: VehicleCompanyRefDto"));
    assert.equal(/^\s*companyId:/m.test(orderBlock), false);
    assert.equal(orderBlock.includes("company:"), false);
  });

  it("reads company from the card and detail order, never a second fetch", () => {
    for (const file of [
      "components/maintenance-card/maintenance-card.tsx",
      "components/maintenance-detail/maintenance-detail-dialog.tsx",
      "components/maintenance-history/maintenance-history.tsx",
    ]) {
      const source = read(file);
      assert.ok(
        source.includes("CompanyIdentity"),
        `${file} must render the shared CompanyIdentity`,
      );
      assert.ok(source.includes("vehicle.company"), `${file} must read vehicle.company`);
      assert.equal(source.includes("apiRequest"), false);
      assert.equal(source.includes("getVehicle"), false);
    }
  });
});

describe("Maintenance company filter", () => {
  it("defaults to All Companies", () => {
    assert.equal(DEFAULT_MAINTENANCE_FILTERS.companyId, null);
  });

  it("clears back to All Companies", () => {
    const store = read("stores/maintenance.store.ts");
    assert.ok(store.includes("DEFAULT_MAINTENANCE_FILTERS"));
    const reset = store.slice(
      store.indexOf("resetFilters()"),
      store.indexOf("setHistoryPage(page)"),
    );
    assert.ok(reset.includes("...DEFAULT_MAINTENANCE_FILTERS"));
  });

  it("builds its options from the authoritative company store", () => {
    const filters = read("components/maintenance-filters/maintenance-filters.tsx");
    assert.ok(filters.includes("ALL_COMPANIES"));
    assert.ok(filters.includes("onCompanyChange"));
    assert.ok(filters.includes("company.displayName"));
    // No module-local UNIQUE/ELITE array anywhere in the filter surface.
    assert.equal(filters.includes('"UNIQUE"'), false);
    assert.equal(filters.includes('"ELITE"'), false);

    const screen = read("components/maintenance-screen/maintenance-screen.tsx");
    assert.ok(screen.includes("useOperatingCompanies"));
    assert.equal(screen.includes("apiRequest"), false);
    assert.equal(screen.includes("fetch("), false);
  });

  it("goes through the hook and store, never straight to the API", () => {
    const hook = read("hooks/use-maintenance.ts");
    assert.ok(hook.includes("setCompany"));
    assert.ok(hook.includes("setQuery({ companyId, page: 1 })"));
    assert.equal(hook.includes("apiRequest"), false);
  });
});

describe("Maintenance company i18n", () => {
  it("reuses the shared OperatingCompanies namespace in AR and EN", () => {
    for (const locale of ["ar", "en"]) {
      const messages = JSON.parse(
        readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), "utf8"),
      ) as { OperatingCompanies: Record<string, string> };
      for (const key of ["company", "all", "loading"]) {
        assert.equal(
          typeof messages.OperatingCompanies[key],
          "string",
          `${locale}.json is missing OperatingCompanies.${key}`,
        );
        assert.ok(messages.OperatingCompanies[key].length > 0);
      }
    }
  });
});
