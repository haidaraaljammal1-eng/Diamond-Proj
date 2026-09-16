import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { isDemoSimulationEnabled } from "../../demo-simulation/simulation.enabled.ts";
import {
  areConsecutiveIsoDates,
  isoDateIsWeekend,
} from "../utils/dashboard-chart-days.ts";
import { visibleFinanceSlices } from "../utils/dashboard.selectors.ts";
import {
  buildDashboardSimulationFixture,
  DASHBOARD_SIMULATION_ID_PREFIX,
  isDashboardSimulationId,
  lastNCalendarDateKeys,
} from "./dashboard-simulation.fixture.ts";
import { selectDashboardPresentation } from "./select-dashboard-presentation.ts";
import type { DashboardOverviewDto } from "../types/dashboard.types.ts";

const here = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

const realOverview = (partial: Partial<DashboardOverviewDto> = {}): DashboardOverviewDto => ({
  generatedAt: "2026-09-11T00:00:00.000Z",
  range: { from: "2026-09-05T00:00:00.000Z", to: "2026-09-12T00:00:00.000Z" },
  today: {
    from: "2026-09-11T00:00:00.000Z",
    to: "2026-09-12T00:00:00.000Z",
    offsetMinutes: 180,
  },
  kpis: {
    activeRentals: 1,
    fleetTotal: 9,
    fleetRented: 3,
    fleetAvailable: 5,
    fleetService: 1,
    pendingLinks: 0,
    deliveriesToday: 0,
    readyForDelivery: 0,
    contractsTotal: 12,
  },
  weeklyFinance: {
    from: "2026-09-05T00:00:00.000Z",
    to: "2026-09-12T00:00:00.000Z",
    collected: 0,
    expenses: 0,
    netMovement: 0,
    currency: "AED",
    breakdown: [],
  },
  weeklyRentalActivity: [
    { date: "2026-09-05", rented: 0, returned: 0 },
    { date: "2026-09-06", rented: 0, returned: 0 },
    { date: "2026-09-07", rented: 0, returned: 0 },
    { date: "2026-09-08", rented: 0, returned: 0 },
    { date: "2026-09-09", rented: 0, returned: 0 },
    { date: "2026-09-10", rented: 0, returned: 0 },
    { date: "2026-09-11", rented: 0, returned: 0 },
  ],
  fleetStatus: { total: 9, available: 5, rented: 3, service: 1 },
  todayDeliveries: [],
  recentContracts: [],
  gpsOnline: 0,
  ...partial,
});

describe("dashboard simulation overlay", () => {
  it("activates only when the shared demo simulation flag is true", () => {
    assert.equal(isDemoSimulationEnabled("true"), true);
    assert.equal(isDemoSimulationEnabled("false"), false);
    assert.equal(isDemoSimulationEnabled(undefined), false);
    const store = read("./dashboard-simulation.store.ts");
    assert.match(store, /isDemoSimulationEnabled\(\)/);
    assert.match(store, /if \(!isDemoSimulationEnabled\(\)\) return;/);
  });

  it("keeps the real API and store independent of simulation", () => {
    const api = read("../api/dashboard.api.ts");
    const store = read("../stores/dashboard.store.ts");
    const hook = read("../hooks/use-dashboard-overview.ts");
    assert.match(api, /\/dashboard\/overview/);
    assert.doesNotMatch(api, /simulation|fixture|demo-data/i);
    assert.doesNotMatch(store, /simulation|fixture|demo-data/i);
    assert.doesNotMatch(hook, /simulation|fixture|demo-data/i);
    assert.match(read("../stores/dashboard.store.ts"), /getDashboardOverview/);
  });

  it("switches presentation between real API data and fixtures without mixing", () => {
    const real = realOverview();
    const simulated = buildDashboardSimulationFixture(new Date("2026-09-10T12:00:00.000Z"));
    assert.equal(selectDashboardPresentation(real, false, simulated), real);
    assert.equal(selectDashboardPresentation(real, true, simulated), simulated);
    assert.equal(selectDashboardPresentation(real, true, null), real);
    assert.notEqual(simulated.kpis.activeRentals, real.kpis.activeRentals);
    assert.equal(selectDashboardPresentation(real, false, simulated)?.kpis.activeRentals, 1);
  });

  it("builds a coherent 7-day fixture covering every Dashboard section", () => {
    const fixture = buildDashboardSimulationFixture(new Date("2026-09-10T12:00:00.000Z"));
    const days = fixture.weeklyRentalActivity ?? [];
    assert.equal(days.length, 7);
    assert.equal(areConsecutiveIsoDates(days.map((point) => point.date)), true);
    assert.ok(days.some((point) => isoDateIsWeekend(point.date)));
    assert.ok(days.some((point) => point.rented === 0));
    assert.ok(days.some((point) => point.returned === 0));
    assert.ok(days.some((point) => point.rented > 0));
    assert.ok(days.some((point) => point.returned > 0));
    assert.equal(fixture.kpis.activeRentals, 8);
    assert.equal(fixture.kpis.fleetTotal, 20);
    assert.equal(fixture.todayDeliveries?.length, 4);
    assert.equal(fixture.recentContracts?.length, 5);
    assert.equal(fixture.fleetStatus?.available, 10);
    assert.equal(
      (fixture.fleetStatus?.available ?? 0) +
        (fixture.fleetStatus?.rented ?? 0) +
        (fixture.fleetStatus?.service ?? 0),
      fixture.fleetStatus?.total,
    );
    assert.ok(fixture.todayDeliveries?.every((row) => isDashboardSimulationId(row.id)));
    assert.ok(fixture.recentContracts?.every((row) => isDashboardSimulationId(row.id)));
    assert.equal(DASHBOARD_SIMULATION_ID_PREFIX, "dash-sim-");
  });

  it("keeps simulated finance coherent with existing Collection / Expense vocabulary", () => {
    const finance = buildDashboardSimulationFixture(new Date("2026-09-10T12:00:00.000Z")).weeklyFinance;
    assert.ok(finance);
    const collections = finance.breakdown.filter((slice) => slice.direction === "COLLECTION");
    const expenses = finance.breakdown.filter((slice) => slice.direction === "EXPENSE");
    assert.deepEqual(
      collections.map((slice) => slice.key),
      [
        "RENTAL_PAYMENT",
        "RENEWAL_PAYMENT",
        "RECONCILIATION_PAYMENT",
        "POST_CLOSE_RECEIVABLE_PAYMENT",
      ],
    );
    assert.deepEqual(
      expenses.map((slice) => slice.key),
      ["MAINTENANCE_EXPENSE", "MANUAL_EXPENSE"],
    );
    const collected = collections.reduce((sum, slice) => sum + slice.amount, 0);
    const expenseTotal = expenses.reduce((sum, slice) => sum + slice.amount, 0);
    assert.equal(finance.collected, collected);
    assert.equal(finance.expenses, expenseTotal);
    assert.equal(finance.netMovement, collected - expenseTotal);
    assert.equal(
      finance.breakdown.some((slice) => String(slice.key).includes("OUTSTANDING")),
      false,
    );
    const slices = visibleFinanceSlices(finance);
    assert.equal(slices.length, 6);
    const hover = slices[0];
    assert.equal(hover?.key, "RENTAL_PAYMENT");
    assert.equal(hover?.direction, "COLLECTION");
    assert.ok((hover?.share ?? 0) > 0);
  });

  it("does not write to the backend from simulation code", () => {
    const overlay = [
      read("./dashboard-simulation.fixture.ts"),
      read("./dashboard-simulation.store.ts"),
      read("./use-dashboard-simulation.ts"),
      read("./dashboard-simulation-controls.tsx"),
      read("./select-dashboard-presentation.ts"),
    ].join("\n");
    assert.doesNotMatch(overlay, /apiRequest|fetch\(|getDashboardOverview|POST |PUT |PATCH |DELETE /);
  });

  it("leaves real Dashboard files functional if the overlay folder is removed", () => {
    const screen = read("../components/dashboard-screen/dashboard-screen.tsx");
    assert.match(screen, /useDashboardOverview/);
    assert.match(screen, /selectDashboardPresentation/);
    assert.match(read("../api/dashboard.api.ts"), /getDashboardOverview/);
  });
});

describe("last N calendar date keys", () => {
  it("returns Thursday's previous Friday through Thursday including the weekend", () => {
    const days = lastNCalendarDateKeys(new Date("2026-09-10T12:00:00.000Z"), 180, 7);
    assert.deepEqual(days, [
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
    ]);
  });
});
