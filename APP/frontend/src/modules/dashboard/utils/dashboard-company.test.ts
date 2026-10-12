import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  dashboardOverviewPath,
  isLatestDashboardRequest,
} from "./dashboard-company-scope.ts";

/**
 * Dashboard company rows (Phase B) plus the page scope (Phase C2).
 *
 * Today Deliveries and Today's Contracts still show `Contract.company`. The page
 * now sends an optional `companyId`. All Companies omits it. GENERAL is not a
 * dashboard option.
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
      types.indexOf("export interface TodayContractDto"),
    );
    const today = types.slice(
      types.indexOf("export interface TodayContractDto"),
      types.indexOf("export interface DashboardOverviewDto"),
    );
    assert.ok(delivery.includes("company?: DashboardCompanyDto | null"));
    assert.ok(today.includes("company: DashboardCompanyDto"));
  });

  it("renders company code on today's contracts and CompanyIdentity on deliveries", () => {
    const todaySource = read("components/today-contracts-card/today-contracts-card.tsx");
    const todayStyles = read("components/today-contracts-card/today-contracts-card.module.css");
    assert.ok(todaySource.includes("company.code"));
    assert.ok(todayStyles.includes("direction: ltr"));
    assert.ok(todaySource.includes('dir={locale === "ar" ? "rtl" : "ltr"}'));
    assert.equal(todaySource.includes("apiRequest"), false);

    const deliverySource = read("components/today-deliveries-card/today-deliveries-card.tsx");
    assert.ok(deliverySource.includes("CompanyIdentity"), "deliveries must use the shared marker");
    assert.ok(deliverySource.includes(".company"), "deliveries must read the row company");
    assert.equal(/trailing=\{[^}]*CompanyIdentity/.test(deliverySource), false);
    assert.equal(deliverySource.includes("apiRequest"), false);
    assert.equal(todaySource.includes('"UNIQUE"'), false);
    assert.equal(todaySource.includes('"ELITE"'), false);
  });

  it("takes company from the row, never from a per-row company lookup", () => {
    for (const file of [
      "components/today-deliveries-card/today-deliveries-card.tsx",
      "components/today-contracts-card/today-contracts-card.tsx",
    ]) {
      const source = read(file);
      assert.equal(source.includes("useOperatingCompanies"), false, `${file} fetches companies`);
      assert.equal(source.includes("fetch("), false);
    }
  });
});

describe("Dashboard company scope", () => {
  it("defaults to All Companies and never sends GENERAL", () => {
    assert.equal(dashboardOverviewPath(null), "/dashboard/overview");
    assert.equal(dashboardOverviewPath(7), "/dashboard/overview?companyId=7");
    const scope = read("components/dashboard-company-scope/dashboard-company-scope.tsx");
    assert.ok(scope.includes('tCompany("all")'));
    assert.ok(scope.includes("useOperatingCompanies"));
    assert.equal(scope.includes("GENERAL"), false);
    assert.equal(scope.includes("companyScope"), false);
    assert.equal(scope.includes('"UNIQUE"'), false);
    assert.equal(scope.includes('"ELITE"'), false);
    const store = read("stores/dashboard.store.ts");
    assert.ok(store.includes("companyId: null"));
    assert.ok(store.includes("isLatestDashboardRequest"));
    assert.ok(store.includes("overview: null"), "company switch must drop stale overview");
  });

  it("fills the reserved slot with the owner feature image", () => {
    const slot = read("components/dashboard-reserved-slot/dashboard-reserved-slot.tsx");
    const slotStyles = read("components/dashboard-reserved-slot/dashboard-reserved-slot.module.css");
    assert.ok(slot.includes("/dashboard/owner-feature-panel.png"));
    assert.ok(slotStyles.includes("object-fit: cover"));
  });

  it("puts the selector on the page and keeps row markers", () => {
    const screen = read("components/dashboard-screen/dashboard-screen.tsx");
    assert.ok(screen.includes("DashboardCompanyScope"));
    assert.ok(screen.includes("companyId"));
    assert.equal(screen.includes("GENERAL"), false);
    assert.ok(read("components/today-deliveries-card/today-deliveries-card.tsx").includes("CompanyIdentity"));
    assert.ok(read("components/today-contracts-card/today-contracts-card.tsx").includes("company.code"));
  });

  it("drops a stale overview response", () => {
    assert.equal(isLatestDashboardRequest(1, 2), false);
    assert.equal(isLatestDashboardRequest(2, 2), true);
  });

  it("leaves chart selectors as presentation of the already-scoped payload", () => {
    for (const file of ["utils/dashboard.selectors.ts", "utils/dashboard-chart-days.ts"]) {
      assert.equal(read(file).includes("companyId"), false, `${file} started filtering locally`);
    }
  });
});
