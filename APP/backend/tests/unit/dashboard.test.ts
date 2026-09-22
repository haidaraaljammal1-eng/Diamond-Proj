import { test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { AuthUser } from "src/lib/context/auth-context";
import {
  ACTIVE_RENTAL_STATUSES,
  PENDING_LINK_STATUSES,
  READY_FOR_DELIVERY_STATUS,
  TODAY_DELIVERY_STATUSES,
} from "src/modules/dashboard/dashboard.constants";
import {
  buildWeeklyRentalActivity,
  fleetTotalsReconcile,
  isActiveRentalStatus,
  isPendingLinkStatus,
  isReadyForDeliveryStatus,
  isTodayDeliveryStatus,
} from "src/modules/dashboard/dashboard.projection";
import { assembleFinanceMovementBreakdown } from "src/modules/finance/finance-analytics.service";
import { createDashboardService } from "src/modules/dashboard/dashboard.service";
import {
  resolveLastNBusinessDays,
  resolveLastNCalendarDays,
} from "src/modules/reports/periods";

test("active rental KPI statuses are custody only — not PAID, REVIEW, or CLOSED", () => {
  assert.deepEqual([...ACTIVE_RENTAL_STATUSES], ["ACTIVE", "RETOUT"]);
  assert.equal(isActiveRentalStatus("ACTIVE"), true);
  assert.equal(isActiveRentalStatus("RETOUT"), true);
  assert.equal(isActiveRentalStatus("PAID"), false);
  assert.equal(isActiveRentalStatus("REVIEW"), false);
  assert.equal(isActiveRentalStatus("CLOSED"), false);
  assert.equal(isActiveRentalStatus("SIGNED"), false);
});

test("pending links are incomplete customer flow — AWAITING + FORM", () => {
  assert.deepEqual([...PENDING_LINK_STATUSES], ["AWAITING", "FORM"]);
  assert.equal(isPendingLinkStatus("AWAITING"), true);
  assert.equal(isPendingLinkStatus("FORM"), true);
  assert.equal(isPendingLinkStatus("SIGNED"), false);
  assert.equal(isPendingLinkStatus("PAID"), false);
});

test("today deliveries are pending hand-overs on canonical startAt — exclude completed Car-Out", () => {
  assert.deepEqual([...TODAY_DELIVERY_STATUSES], ["AWAITING", "FORM", "SIGNED", "PAID"]);
  assert.equal(isTodayDeliveryStatus("PAID"), true);
  assert.equal(isTodayDeliveryStatus("SIGNED"), true);
  assert.equal(isTodayDeliveryStatus("ACTIVE"), false);
  assert.equal(isTodayDeliveryStatus("RETOUT"), false);
  assert.equal(isTodayDeliveryStatus("REVIEW"), false);
  assert.equal(isTodayDeliveryStatus("CLOSED"), false);
  assert.equal(isReadyForDeliveryStatus("PAID"), true);
  assert.equal(isReadyForDeliveryStatus(READY_FOR_DELIVERY_STATUS), true);
  assert.equal(isReadyForDeliveryStatus("SIGNED"), false);
});

test("fleet status totals reconcile available + rented + service", () => {
  assert.equal(
    fleetTotalsReconcile({ available: 6, rented: 4, service: 2, total: 12 }),
    true,
  );
  assert.equal(
    fleetTotalsReconcile({ available: 6, rented: 4, service: 2, total: 11 }),
    false,
  );
});

test("weekly rental activity groups Car-Out as rented and Car-In as returned on the event day", () => {
  const offset = 180;
  const days = ["2026-09-08", "2026-09-09", "2026-09-10"];
  const carOutAt = [
    new Date("2026-09-08T08:00:00.000Z"),
    new Date("2026-09-10T10:00:00.000Z"),
  ];
  const carInAt = [new Date("2026-09-09T14:00:00.000Z")];
  assert.deepEqual(buildWeeklyRentalActivity(days, carOutAt, carInAt, offset), [
    { date: "2026-09-08", rented: 1, returned: 0 },
    { date: "2026-09-09", rented: 0, returned: 1 },
    { date: "2026-09-10", rented: 1, returned: 0 },
  ]);
});

test("zero-activity calendar days stay in the weekly rental series as zeros", () => {
  const offset = 180;
  const days = ["2026-09-04", "2026-09-05", "2026-09-06"];
  const series = buildWeeklyRentalActivity(
    days,
    [new Date("2026-09-04T08:00:00.000Z")],
    [],
    offset,
  );
  assert.deepEqual(series, [
    { date: "2026-09-04", rented: 1, returned: 0 },
    { date: "2026-09-05", rented: 0, returned: 0 },
    { date: "2026-09-06", rented: 0, returned: 0 },
  ]);
});

test("Car-Out / Car-In outside the 7-day window are not counted", () => {
  const offset = 180;
  const days = ["2026-09-08", "2026-09-09"];
  const series = buildWeeklyRentalActivity(
    days,
    [new Date("2026-09-01T08:00:00.000Z")],
    [new Date("2026-09-20T08:00:00.000Z")],
    offset,
  );
  assert.deepEqual(series, [
    { date: "2026-09-08", rented: 0, returned: 0 },
    { date: "2026-09-09", rented: 0, returned: 0 },
  ]);
});

test("finance movement breakdown uses collected kinds and nets voided manual expenses to zero", () => {
  const slices = assembleFinanceMovementBreakdown(
    new Map([
      ["RENTAL_PAYMENT", 1000],
      ["RENEWAL_PAYMENT", 200],
      ["RECONCILIATION_PAYMENT", 50],
      ["POST_CLOSE_RECEIVABLE_PAYMENT", 25],
      ["MAINTENANCE_EXPENSE", 300],
      ["MANUAL_EXPENSE", 80],
      ["MANUAL_EXPENSE_REVERSAL", 80],
    ]),
  );
  assert.deepEqual(
    slices.map((s) => [s.key, s.direction, s.amount]),
    [
      ["RENTAL_PAYMENT", "COLLECTION", 1000],
      ["RENEWAL_PAYMENT", "COLLECTION", 200],
      ["RECONCILIATION_PAYMENT", "COLLECTION", 50],
      ["POST_CLOSE_RECEIVABLE_PAYMENT", "COLLECTION", 25],
      ["MAINTENANCE_EXPENSE", "EXPENSE", 300],
    ],
  );
  assert.equal(
    slices.some((s) => s.key === "MANUAL_EXPENSE"),
    false,
  );
});

test("corrected manual expense uses the current ledger amount", () => {
  const slices = assembleFinanceMovementBreakdown(
    new Map([
      ["MANUAL_EXPENSE", 150],
      ["MAINTENANCE_EXPENSE", 0],
    ]),
  );
  assert.deepEqual(slices, [
    { key: "MANUAL_EXPENSE", direction: "EXPENSE", amount: 150 },
  ]);
});

test("last 7 calendar days are consecutive, include weekends, and keep today", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");
  const week = resolveLastNCalendarDays(now, 180, 7);
  assert.deepEqual(week.days, [
    "2026-09-04",
    "2026-09-05",
    "2026-09-06",
    "2026-09-07",
    "2026-09-08",
    "2026-09-09",
    "2026-09-10",
  ]);
  const weekday = week.days.map((day) => new Date(`${day}T12:00:00.000Z`).getUTCDay());
  assert.equal(weekday[0], 5);
  assert.equal(weekday[1], 6);
  assert.equal(weekday[2], 0);
  for (let i = 1; i < week.days.length; i++) {
    const prev = Date.parse(`${week.days[i - 1]}T12:00:00.000Z`);
    const curr = Date.parse(`${week.days[i]}T12:00:00.000Z`);
    assert.equal(curr - prev, 86_400_000);
  }
  assert.ok(week.from < week.to);
  assert.deepEqual(resolveLastNBusinessDays(now, 180, 7).days, week.days);
});

function viewer(permissions: string[]): AuthUser {
  return {
    id: 1,
    email: "dash@example.test",
    status: "ACTIVE",
    permissions,
    roleKeys: [],
    isSystemAdmin: false,
  };
}

function createPrismaSpy() {
  const ledgerCalls: unknown[] = [];
  const contractCountWheres: unknown[] = [];
  const contractFindWheres: unknown[] = [];
  const carOutWheres: unknown[] = [];
  const carInWheres: unknown[] = [];

  const prisma = {
    vehicle: {
      groupBy: async () => [
        { operationalStatus: "AVAILABLE", _count: { _all: 5 } },
        { operationalStatus: "RENTED", _count: { _all: 3 } },
        { operationalStatus: "SERVICE", _count: { _all: 1 } },
      ],
      count: async () => 9,
      findMany: async () => [],
    },
    contract: {
      count: async (args?: { where?: unknown }) => {
        contractCountWheres.push(args?.where);
        return 0;
      },
      findMany: async (args: { where?: unknown }) => {
        contractFindWheres.push(args.where);
        return [];
      },
    },
    contractCarOut: {
      findMany: async (args: { where?: unknown }) => {
        carOutWheres.push(args.where);
        return [];
      },
    },
    contractCarIn: {
      findMany: async (args: { where?: unknown }) => {
        carInWheres.push(args.where);
        return [];
      },
    },
    financialLedgerEntry: {
      aggregate: async (args: unknown) => {
        ledgerCalls.push(args);
        return { _sum: { amount: 0 } };
      },
      groupBy: async (args: unknown) => {
        ledgerCalls.push(args);
        return [];
      },
      findMany: async () => [],
    },
    vehicleGpsBinding: { findMany: async () => [] },
  };

  const errors: unknown[] = [];
  const fastify = {
    prisma,
    log: {
      error(payload: { err?: unknown }) {
        if (payload?.err) errors.push(payload.err);
      },
    },
  } as unknown as FastifyInstance;

  return {
    fastify,
    errors,
    ledgerCalls,
    contractCountWheres,
    contractFindWheres,
    carOutWheres,
    carInWheres,
  };
}

test("dashboard overview hides finance and does not query the ledger without finance.read", async () => {
  const spy = createPrismaSpy();
  const svc = createDashboardService(spy.fastify);
  const data = await svc.overview(
    viewer(["dashboard.read", "contracts.read", "vehicles.read"]),
    new Date("2026-09-11T12:00:00.000Z"),
  );
  assert.equal(data.weeklyFinance, null);
  assert.equal(spy.ledgerCalls.length, 0);
  assert.equal(data.kpis.fleetTotal, 9);
  assert.equal(data.kpis.fleetRented, 3);
  assert.equal(data.kpis.fleetAvailable, 5);
  assert.equal(data.kpis.fleetService, 1);
  assert.equal(data.fleetStatus?.total, 9);
  assert.equal(data.kpis.activeRentals, 0);
});

test("dashboard overview hides contract summaries without contracts.read", async () => {
  const spy = createPrismaSpy();
  const svc = createDashboardService(spy.fastify);
  const data = await svc.overview(
    viewer(["dashboard.read", "vehicles.read", "finance.read"]),
    new Date("2026-09-11T12:00:00.000Z"),
  );
  assert.equal(data.kpis.activeRentals, null);
  assert.equal(data.kpis.pendingLinks, null);
  assert.equal(data.kpis.deliveriesToday, null);
  assert.equal(data.weeklyRentalActivity, null);
  assert.equal(data.todayDeliveries, null);
  assert.equal(data.recentContracts, null);
  assert.equal(data.weeklyFinance?.collected, 0);
  assert.equal(data.weeklyFinance?.expenses, 0);
  assert.equal(data.weeklyFinance?.netMovement, 0);
  assert.ok(spy.ledgerCalls.length > 0);
  assert.equal(spy.contractCountWheres.length, 0);
  assert.equal(spy.carOutWheres.length, 0);
  assert.equal(spy.carInWheres.length, 0);
});

test("weekly finance uses the same consecutive 7-day window as rental activity", async () => {
  const spy = createPrismaSpy();
  const svc = createDashboardService(spy.fastify);
  const now = new Date("2026-09-10T12:00:00.000Z");
  const data = await svc.overview(
    viewer(["dashboard.read", "contracts.read", "finance.read"]),
    now,
  );
  const week = resolveLastNCalendarDays(now, data.today.offsetMinutes, 7);
  assert.equal(data.range.from.getTime(), week.from.getTime());
  assert.equal(data.range.to.getTime(), week.to.getTime());
  assert.equal(data.weeklyFinance?.from.getTime(), data.range.from.getTime());
  assert.equal(data.weeklyFinance?.to.getTime(), data.range.to.getTime());
  assert.equal(data.weeklyRentalActivity?.length, 7);
  assert.deepEqual(
    data.weeklyRentalActivity?.map((point) => point.date),
    week.days,
  );
  const weekdays = week.days.map((day) => new Date(`${day}T12:00:00.000Z`).getUTCDay());
  assert.ok(weekdays.includes(0));
  assert.ok(weekdays.includes(6));
});

test("contract KPI queries use custody and pending-link status sets, not PAID as rented", async () => {
  const spy = createPrismaSpy();
  const svc = createDashboardService(spy.fastify);
  await svc.overview(
    viewer(["dashboard.read", "contracts.read"]),
    new Date("2026-09-11T12:00:00.000Z"),
  );
  const statusSets = spy.contractCountWheres
    .filter((where): where is Record<string, unknown> => Boolean(where))
    .map((where) => {
    const status = where.status;
    if (status && typeof status === "object" && "in" in status) {
      return (status as { in: string[] }).in;
    }
    return status;
  });
  assert.ok(statusSets.some((set) => Array.isArray(set) && set.includes("ACTIVE") && set.includes("RETOUT")));
  assert.ok(
    statusSets.every((set) => {
      if (!Array.isArray(set)) return set === "PAID" || set === undefined;
      if (set.includes("ACTIVE") && set.includes("RETOUT")) return !set.includes("PAID");
      return true;
    }),
  );
  const deliveryWhere = spy.contractFindWheres.find((where) => {
    const status = (where as { status?: { in?: string[] } }).status;
    return status?.in?.includes("PAID") && status.in.includes("AWAITING");
  }) as { startAt?: { gte?: Date; lt?: Date }; status?: { in?: string[] } } | undefined;
  assert.ok(deliveryWhere?.startAt?.gte instanceof Date);
  assert.ok(deliveryWhere?.startAt?.lt instanceof Date);
  assert.ok(!deliveryWhere?.status?.in?.includes("ACTIVE"));
  assert.ok(!deliveryWhere?.status?.in?.includes("REVIEW"));
});
