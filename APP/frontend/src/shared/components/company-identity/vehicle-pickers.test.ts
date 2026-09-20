import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/**
 * Both Vehicle pickers (Maintenance and Finance) must say which operating
 * company a vehicle belongs to — in the option list and after selection — and
 * must narrow through the existing server-side Vehicles query rather than
 * introducing a second filtering architecture.
 */

const SRC = path.join(import.meta.dirname, "../../..");

const PICKERS = {
  maintenance:
    "modules/maintenance/components/maintenance-vehicle-picker/maintenance-vehicle-picker.tsx",
  finance: "modules/finance/components/finance-vehicle-picker/finance-vehicle-picker.tsx",
};

function read(relative: string): string {
  return readFileSync(path.join(SRC, relative), "utf8");
}

describe("Vehicle pickers show the operating company", () => {
  for (const [name, file] of Object.entries(PICKERS)) {
    it(`renders the shared CompanyIdentity in the ${name} option list`, () => {
      const source = read(file);
      assert.ok(source.includes("CompanyIdentity"));
      assert.ok(source.includes("vehicle.company"));
      // No picker-local company badge or colour.
      assert.equal(/#[0-9a-f]{6}/i.test(source), false);
    });

    it(`keeps the company visible after selection in the ${name} picker`, () => {
      const source = read(file);
      const selectedBlock = source.slice(source.indexOf("{selected ?"));
      assert.ok(
        selectedBlock.includes("selected.company"),
        `${name} selected summary must keep the company`,
      );
    });

    it(`filters the ${name} picker server-side through the Vehicles API`, () => {
      const source = read(file);
      assert.ok(source.includes("ALL_COMPANIES"));
      assert.ok(source.includes("useOperatingCompanies"));
      assert.ok(source.includes("setCompany"));
      // Options come from the backend company list, never a local array.
      assert.equal(source.includes('"UNIQUE"'), false);
      assert.equal(source.includes('"ELITE"'), false);
      // The component itself never talks HTTP.
      assert.equal(source.includes("apiRequest"), false);
      assert.equal(source.includes("fetch("), false);
    });
  }

  it("passes companyId to GET /vehicles from the maintenance picker store", () => {
    const store = read(
      "modules/maintenance/stores/available-maintenance-vehicles.store.ts",
    );
    assert.ok(store.includes("getVehicles("));
    assert.ok(store.includes("companyId: company"));
  });

  it("passes companyId to GET /vehicles from the finance picker hook", () => {
    const hook = read("modules/finance/hooks/use-finance-vehicle-search.ts");
    assert.ok(hook.includes("getVehicles("));
    assert.ok(hook.includes("companyId: company"));
  });

  /**
   * The company marker never shrinks, so on a one-line option row the vehicle
   * name has to be the part that gives. Without this the row wrapped to two
   * lines at 390px and the option heights went ragged.
   */
  it("lets the finance option row truncate the name instead of wrapping", () => {
    const css = read(
      "modules/finance/components/finance-vehicle-picker/finance-vehicle-picker.module.css",
    );
    const name = css.slice(css.indexOf(".optionName"), css.indexOf(".optionPlate"));
    assert.ok(name.includes("text-overflow: ellipsis"));
    assert.ok(name.includes("white-space: nowrap"));
    assert.ok(name.includes("min-width: 0"));

    // A plate is a code: it stays whole and never absorbs the squeeze.
    const plate = css.slice(css.indexOf(".optionPlate"));
    assert.ok(plate.includes("flex: none"));
    assert.ok(plate.includes("white-space: nowrap"));

    // The row itself must be allowed to shrink, or it scrolls the list instead.
    const option = css.slice(css.indexOf(".option {"), css.indexOf(".optionSelected"));
    assert.ok(option.includes("min-width: 0"));
  });
});
