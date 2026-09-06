import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDashboardOverview,
  selectScopedContracts,
  type DashboardSource,
} from "./dashboard.selectors.ts";
import {
  DEMO_CONTRACTS,
  DEMO_EXPENSE_CATEGORIES,
  DEMO_EMPLOYEES,
  DEMO_SELF_EMPLOYEE_ID,
  DEMO_UNREAD_MESSAGES,
  DEMO_VEHICLES,
  DEMO_WEEK,
} from "../data/dashboard.demo-data.ts";

const source: DashboardSource = {
  vehicles: DEMO_VEHICLES,
  employees: DEMO_EMPLOYEES,
  contracts: DEMO_CONTRACTS,
  unreadMessages: DEMO_UNREAD_MESSAGES,
  week: DEMO_WEEK,
  expenseCategories: DEMO_EXPENSE_CATEGORIES,
};

describe("buildDashboardOverview — office scope", () => {
  const overview = buildDashboardOverview(source, { kind: "office" });

  it("counts active + paid contracts as the Demo KPI does", () => {
    assert.equal(overview.activeContracts, 4);
    assert.equal(overview.ongoingRentals, 3);
  });

  it("reports the fleet as rented over total", () => {
    assert.equal(overview.fleetRented, 4);
    assert.equal(overview.fleetTotal, 12);
  });

  it("counts links the customer has not completed", () => {
    assert.equal(overview.pendingLinks, 2);
  });

  it("counts today's hand-overs and the ones already ready", () => {
    assert.equal(overview.deliveriesToday, 3);
    assert.equal(overview.readyForDelivery, 1);
  });

  it("counts vehicles in the workshop", () => {
    assert.equal(overview.vehiclesInService, 2);
  });

  it("splits the fleet by vehicle status", () => {
    assert.deepEqual(overview.fleet, { available: 6, rented: 4, service: 2 });
  });

  it("lists today hand-overs in schedule order with their slots", () => {
    assert.deepEqual(
      overview.todayDeliveries.map((d) => [d.id, d.slot]),
      [
        ["DE-2026-0824-120", "09:30 ص"],
        ["DE-2026-0824-121", "11:00 ص"],
        ["DE-2026-0824-122", "02:30 م"],
      ],
    );
  });

  it("exposes the office contract total and unread messages", () => {
    assert.equal(overview.contractsTotal, 11);
    assert.equal(overview.unreadMessages, 3);
  });

  it("derives the daily net from revenue minus expense", () => {
    assert.equal(overview.week.length, 7);
    const today = overview.week.at(-1);
    assert.deepEqual(today, {
      key: "today",
      revenue: 51288,
      expense: 3470,
      net: 47818,
    });
  });

  it("totals expenses and their shares", () => {
    assert.equal(overview.expenses.total, 9940);
    assert.deepEqual(
      overview.expenses.slices.map((s) => [s.key, s.share]),
      [
        ["maintenance", 59],
        ["operations", 17],
        ["administrative", 12],
        ["fuel", 12],
      ],
    );
  });

  it("lists the five latest contracts in Demo order", () => {
    assert.deepEqual(
      overview.recentContracts.map((c) => c.id),
      [
        "DE-2026-0813-107",
        "DE-2026-0814-108",
        "DE-2026-0815-109",
        "DE-2026-0816-110",
        "DE-2026-0816-111",
      ],
    );
  });

  it("resolves the vehicle and the issuing employee", () => {
    const [first] = overview.recentContracts;
    assert.equal(first.customerName, "فيصل العمري");
    assert.equal(first.vehicleName, "Mitsubishi Pajero GLS");
    assert.equal(first.employeeName, "أحمد الشامسي");
    assert.equal(first.status, "closed");
  });
});

describe("selectScopedContracts — own scope", () => {
  const own = selectScopedContracts(DEMO_CONTRACTS, {
    kind: "own",
    employeeId: DEMO_SELF_EMPLOYEE_ID,
  });

  it("keeps only the viewer's open contracts", () => {
    assert.deepEqual(
      own.map((c) => c.id),
      [
        "DE-2026-0824-121",
        "DE-2026-0817-114",
        "DE-2026-0817-112",
        "DE-2026-0816-110",
      ],
    );
  });

  it("drives a narrower overview than the office scope", () => {
    const overview = buildDashboardOverview(source, {
      kind: "own",
      employeeId: DEMO_SELF_EMPLOYEE_ID,
    });
    assert.equal(overview.contractsTotal, 4);
    assert.equal(overview.activeContracts, 2);
    assert.equal(overview.pendingLinks, 1);
    assert.equal(overview.recentContracts.length, 4);
  });
});
