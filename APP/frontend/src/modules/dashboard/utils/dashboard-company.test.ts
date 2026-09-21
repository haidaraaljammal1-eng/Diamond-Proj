import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/**
 * Dashboard company visibility is ROW-LEVEL ONLY (Phase B3).
 *
 * Today Deliveries and Recent Contracts show `Contract.company` as metadata. The
 * dashboard itself has no company scope: no header selector, no `companyId` in the
 * overview request, and no KPI, weekly finance or fleet-status figure changes.
 */

const MODULE_DIR = path.join(import.meta.dirname, "..");

function read(relative: string): string {
  return readFileSync(path.join(MODULE_DIR, relative), "utf8");
}

describe("Dashboard row company", () => {
  it("carries an optional company on both contract-derived row types", () => {
    const types = read("types/dashboard.types.ts");
    const delivery = types.slice(
      types.indexOf("export interface TodayDeliveryDto"),
      types.indexOf("export interface RecentContractDto"),
    );
    const recent = types.slice(
      types.indexOf("export interface RecentContractDto"),
      types.indexOf("export interface DashboardOverviewDto"),
    );
    // Optional, so a simulated or older payload renders no marker instead of throwing.
    assert.ok(delivery.includes("company?: DashboardCompanyDto | null"));
    assert.ok(recent.includes("company?: DashboardCompanyDto | null"));
  });

  it("renders the shared CompanyIdentity on both row surfaces", () => {
    for (const file of [
      "components/today-deliveries-card/today-deliveries-card.tsx",
      "components/recent-contracts-card/recent-contracts-card.tsx",
    ]) {
      const source = read(file);
      assert.ok(source.includes("CompanyIdentity"), `${file} must use the shared marker`);
      assert.ok(source.includes(".company"), `${file} must read the row company`);
      // Company is metadata inside the row meta line, never the trailing status slot.
      assert.equal(/trailing=\{[^}]*CompanyIdentity/.test(source), false);
      assert.equal(source.includes("apiRequest"), false);
      assert.equal(source.includes('"UNIQUE"'), false);
      assert.equal(source.includes('"ELITE"'), false);
    }
  });

  it("takes company from the row, never from a per-row company lookup", () => {
    for (const file of [
      "components/today-deliveries-card/today-deliveries-card.tsx",
      "components/recent-contracts-card/recent-contracts-card.tsx",
    ]) {
      const source = read(file);
      assert.equal(source.includes("useOperatingCompanies"), false, `${file} fetches companies`);
      assert.equal(source.includes("fetch("), false);
    }
  });
});

describe("Dashboard has no company scope", () => {
  it("never sends a company filter with the overview request", () => {
    const api = read("api/dashboard.api.ts");
    assert.equal(api.includes("companyId"), false, "the overview request gained a company filter");
    const store = read("stores/dashboard.store.ts");
    assert.equal(store.includes("companyId"), false, "the dashboard store gained a company filter");
    const hook = read("hooks/use-dashboard-overview.ts");
    assert.equal(hook.includes("companyId"), false, "the dashboard hook gained a company filter");
  });

  it("adds no company selector to the dashboard header", () => {
    const screen = read("components/dashboard-screen/dashboard-screen.tsx");
    assert.equal(screen.includes("useOperatingCompanies"), false);
    assert.equal(screen.includes("CompanyIdentity"), false);
    assert.equal(screen.includes("companyId"), false);
  });

  it("leaves the KPI and fleet selectors company-blind", () => {
    for (const file of ["utils/dashboard.selectors.ts", "utils/dashboard-chart-days.ts"]) {
      assert.equal(read(file).includes("company"), false, `${file} became company-aware`);
    }
  });
});
