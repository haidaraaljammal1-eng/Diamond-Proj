import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  financeSliceHoverDetail,
  financeSliceShare,
  fleetUtilizationPercent,
  hasAnyDashboardSection,
  isWeeklyFinanceEmpty,
  isWeeklyRentalActivityEmpty,
  visibleFinanceSlices,
} from "./dashboard.selectors.ts";
import {
  areConsecutiveIsoDates,
  formatDashboardChartDay,
  isoDateIsWeekend,
} from "./dashboard-chart-days.ts";
import {
  DASHBOARD_QUICK_ACCESS,
  GENERATE_RENTAL_LINK_HREF,
} from "./dashboard.routes.ts";
import type { DashboardOverviewDto } from "../types/dashboard.types.ts";

const emptyOverview = (partial: Partial<DashboardOverviewDto> = {}): DashboardOverviewDto => ({
  generatedAt: "2026-09-11T00:00:00.000Z",
  range: { from: "2026-09-05T00:00:00.000Z", to: "2026-09-12T00:00:00.000Z" },
  today: {
    from: "2026-09-11T00:00:00.000Z",
    to: "2026-09-12T00:00:00.000Z",
    offsetMinutes: 180,
  },
  kpis: {
    activeRentals: null,
    fleetTotal: null,
    fleetRented: null,
    fleetAvailable: null,
    fleetService: null,
    pendingLinks: null,
    deliveriesToday: null,
    readyForDelivery: null,
    contractsTotal: null,
  },
  weeklyFinance: null,
  weeklyRentalActivity: null,
  fleetStatus: null,
  todayDeliveries: null,
  recentContracts: null,
  gpsOnline: null,
  ...partial,
});

describe("dashboard selectors — real API mappings", () => {
  it("maps finance donut slices and drops zeros", () => {
    const slices = visibleFinanceSlices({
      from: "2026-09-05T00:00:00.000Z",
      to: "2026-09-12T00:00:00.000Z",
      collected: 1250,
      expenses: 300,
      netMovement: 950,
      currency: "AED",
      breakdown: [
        { key: "RENTAL_PAYMENT", direction: "COLLECTION", amount: 1000 },
        { key: "RENEWAL_PAYMENT", direction: "COLLECTION", amount: 0 },
        { key: "MAINTENANCE_EXPENSE", direction: "EXPENSE", amount: 300 },
      ],
    });
    assert.deepEqual(
      slices.map((s) => [s.key, s.direction, s.amount, s.share]),
      [
        ["RENTAL_PAYMENT", "COLLECTION", 1000, 77],
        ["MAINTENANCE_EXPENSE", "EXPENSE", 300, 23],
      ],
    );
    const hover = financeSliceHoverDetail(slices, 0);
    assert.equal(hover?.key, "RENTAL_PAYMENT");
    assert.equal(hover?.amount, 1000);
    assert.equal(hover?.share, 77);
    assert.equal(hover?.direction, "COLLECTION");
    assert.equal(financeSliceHoverDetail(slices, 1)?.direction, "EXPENSE");
    assert.equal(financeSliceHoverDetail(slices, null), null);
    assert.equal(financeSliceShare(300, 1300), 23);
  });

  it("maps rented/returned weekly points and detects an empty week", () => {
    const series = [
      { date: "2026-09-09", rented: 0, returned: 0 },
      { date: "2026-09-10", rented: 2, returned: 1 },
    ];
    assert.equal(isWeeklyRentalActivityEmpty(series), false);
    assert.equal(
      isWeeklyRentalActivityEmpty([
        { date: "2026-09-09", rented: 0, returned: 0 },
        { date: "2026-09-10", rented: 0, returned: 0 },
      ]),
      true,
    );
    assert.equal(isWeeklyRentalActivityEmpty(null), true);
  });

  it("maps fleet status and utilization from active-fleet totals", () => {
    const fleet = { total: 10, available: 6, rented: 3, service: 1 };
    assert.equal(fleet.available + fleet.rented + fleet.service, fleet.total);
    assert.equal(fleetUtilizationPercent(fleet), 30);
    assert.equal(fleetUtilizationPercent(null), 0);
  });

  it("maps today's deliveries as API projections, not demo names", () => {
    const overview = emptyOverview({
      todayDeliveries: [
        {
          id: "ct-1",
          contractNumber: "DE-2026-000001",
          customerName: "Maha Ali",
          vehicleName: "Patrol",
          startAt: "2026-09-11T09:30:00.000Z",
          status: "PAID",
        },
      ],
    });
    assert.equal(overview.todayDeliveries?.[0]?.contractNumber, "DE-2026-000001");
    assert.equal(overview.todayDeliveries?.[0]?.status, "PAID");
    assert.equal(overview.todayDeliveries?.[0]?.customerName, "Maha Ali");
  });

  it("treats a zero-finance week as an empty state, not fake values", () => {
    assert.equal(
      isWeeklyFinanceEmpty({
        from: "2026-09-05T00:00:00.000Z",
        to: "2026-09-12T00:00:00.000Z",
        collected: 0,
        expenses: 0,
        netMovement: 0,
        currency: "AED",
        breakdown: [],
      }),
      true,
    );
  });

  it("does not invent dashboard sections when the API returns nulls", () => {
    assert.equal(hasAnyDashboardSection(emptyOverview()), false);
    assert.equal(
      hasAnyDashboardSection(emptyOverview({ kpis: { ...emptyOverview().kpis, activeRentals: 2 } })),
      true,
    );
  });
});

describe("dashboard quick access routes", () => {
  it("wires existing locale-aware app routes without fake query params", () => {
    assert.deepEqual(
      DASHBOARD_QUICK_ACCESS.map((item) => [item.key, item.href, item.permission]),
      [
        ["cars", "/vehicles", "vehicles.read"],
        ["contracts", "/contracts", "contracts.read"],
        ["gps", "/gps", "gps.read"],
        ["maintenance", "/maintenance", "maintenance.read"],
      ],
    );
    assert.equal(GENERATE_RENTAL_LINK_HREF, "/vehicles");
    assert.equal(
      DASHBOARD_QUICK_ACCESS.some((item) => item.href === "/operations"),
      false,
    );
  });
});

describe("dashboard AR/EN labels", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../../../messages");
  const en = JSON.parse(readFileSync(join(root, "en.json"), "utf8")).Dashboard as Record<string, unknown>;
  const ar = JSON.parse(readFileSync(join(root, "ar.json"), "utf8")).Dashboard as Record<string, unknown>;

  function keysOf(value: unknown, prefix = ""): string[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      keysOf(child, prefix ? `${prefix}.${key}` : key),
    );
  }

  it("keeps AR and EN Dashboard namespaces aligned", () => {
    assert.deepEqual(keysOf(en).sort(), keysOf(ar).sort());
  });

  it("uses the approved weekly headings and does not call net movement profit", () => {
    const expenses = en.expenses as Record<string, string>;
    const weekly = en.weekly as Record<string, string>;
    const arExpenses = ar.expenses as Record<string, string>;
    const arWeekly = ar.weekly as Record<string, string>;
    assert.equal(weekly.title, "Weekly Rental Activity");
    assert.equal(arWeekly.title, "حركة الإيجار الأسبوعية");
    assert.equal(expenses.title, "Weekly Financial Summary");
    assert.equal(arExpenses.title, "الملخص المالي الأسبوعي");
    assert.equal(expenses.netMovement, "Net Movement");
    assert.equal(arExpenses.netMovement, "صافي الحركة");
    assert.equal(expenses.collection, "Collection");
    assert.equal(arExpenses.collection, "تحصيل");
    assert.equal(expenses.expense, "Expense");
    assert.equal(arExpenses.expense, "مصروف");
    assert.equal(weekly.subtitle, "Last 7 Days");
    assert.equal(arWeekly.subtitle, "آخر 7 أيام");
    const simulation = en.simulation as Record<string, string>;
    const arSimulation = ar.simulation as Record<string, string>;
    assert.equal(simulation.button, "Simulation");
    assert.equal(arSimulation.button, "محاكاة");
    assert.equal(simulation.badge, "DEMO SIMULATION");
    assert.equal(arSimulation.badge, "محاكاة تجريبية");
    assert.equal(simulation.reset, "Reset Simulation");
    assert.equal(arSimulation.reset, "إعادة ضبط المحاكاة");
    assert.doesNotMatch(JSON.stringify(en), /Net Profit|Profit|Revenue/);
    assert.doesNotMatch(JSON.stringify(en.kpi), /▲/);
  });

  it("does not keep demo-only raw enum labels in Dashboard copy", () => {
    const blob = `${JSON.stringify(en)}${JSON.stringify(ar)}`;
    assert.doesNotMatch(blob, /AWAITING|RENTAL_PAYMENT|MANUAL_EXPENSE|operationalStatus/);
  });

  it("keeps today's deliveries empty copy honest", () => {
    assert.equal((en.deliveries as Record<string, string>).empty, "No deliveries scheduled today");
    assert.equal((ar.deliveries as Record<string, string>).empty, "لا توجد تسليمات مجدولة اليوم");
  });
});

describe("dashboard weekly chart days", () => {
  it("keeps 7 consecutive calendar days including weekend labels", () => {
    const days = [
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
    ];
    assert.equal(days.length, 7);
    assert.equal(areConsecutiveIsoDates(days), true);
    assert.equal(isoDateIsWeekend("2026-09-05"), true);
    assert.equal(isoDateIsWeekend("2026-09-06"), true);
    assert.equal(isoDateIsWeekend("2026-09-10"), false);
    assert.match(formatDashboardChartDay("2026-09-05", "en"), /Sat 05/);
    assert.match(formatDashboardChartDay("2026-09-06", "en"), /Sun 06/);
    assert.equal(formatDashboardChartDay("2026-09-05", "ar").endsWith(" 05"), true);
    assert.equal(formatDashboardChartDay("2026-09-06", "ar").endsWith(" 06"), true);
  });
});

describe("dashboard finance donut presentation", () => {
  it("maps hover detail from Finance slices without a second formula engine", () => {
    const card = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../components/expense-breakdown-card/expense-breakdown-card.tsx"),
      "utf8",
    );
    assert.match(card, /visibleFinanceSlices/);
    assert.match(card, /ledgerSourceLabel/);
    assert.match(card, /financeSliceHoverDetail/);
    assert.match(card, /onActiveChange/);
    assert.match(card, /expenses\.collection/);
    assert.match(card, /finance\.netMovement/);
    assert.doesNotMatch(card, /sumCollected|movementBreakdown|ManualExpense|maintenance\.api/);
    assert.doesNotMatch(card, /collected - expenses|collected - finance/);
  });
});
