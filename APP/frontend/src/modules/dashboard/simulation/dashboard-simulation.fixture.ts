import type {
  DashboardOverviewDto,
  WeeklyFinanceSliceDto,
  WeeklyRentalActivityPointDto,
} from "../types/dashboard.types";

export const DASHBOARD_SIMULATION_ID_PREFIX = "dash-sim-";
export const DASHBOARD_SIMULATION_OFFSET_MINUTES = 180;
export const DASHBOARD_SIMULATION_WEEK_DAYS = 7;

const RENTAL_PATTERN: ReadonlyArray<{ rented: number; returned: number }> = [
  { rented: 3, returned: 1 },
  { rented: 2, returned: 3 },
  { rented: 0, returned: 1 },
  { rented: 4, returned: 2 },
  { rented: 1, returned: 0 },
  { rented: 2, returned: 2 },
  { rented: 3, returned: 1 },
];

const FINANCE_BREAKDOWN: readonly WeeklyFinanceSliceDto[] = [
  { key: "RENTAL_PAYMENT", direction: "COLLECTION", amount: 2500 },
  { key: "RENEWAL_PAYMENT", direction: "COLLECTION", amount: 800 },
  { key: "RECONCILIATION_PAYMENT", direction: "COLLECTION", amount: 350 },
  { key: "POST_CLOSE_RECEIVABLE_PAYMENT", direction: "COLLECTION", amount: 150 },
  { key: "MAINTENANCE_EXPENSE", direction: "EXPENSE", amount: 600 },
  { key: "MANUAL_EXPENSE", direction: "EXPENSE", amount: 200 },
];

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDateUtc(y: number, mZeroBased: number, d: number): string {
  const day = new Date(Date.UTC(y, mZeroBased, d));
  return `${day.getUTCFullYear()}-${pad2(day.getUTCMonth() + 1)}-${pad2(day.getUTCDate())}`;
}

function utcFromBusinessMidnight(isoDate: string, offsetMinutes: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - offsetMinutes * 60_000).toISOString();
}

function utcFromBusinessClock(
  isoDate: string,
  offsetMinutes: number,
  hours: number,
  minutes: number,
): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hours, minutes) - offsetMinutes * 60_000).toISOString();
}

function utcFromBusinessNextMidnight(isoDate: string, offsetMinutes: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1) - offsetMinutes * 60_000).toISOString();
}

/** Consecutive calendar days in the Diamond business timezone, including weekends. */
export function lastNCalendarDateKeys(
  now: Date,
  offsetMinutes: number,
  dayCount: number,
): string[] {
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  const keys: string[] = [];
  for (let i = dayCount - 1; i >= 0; i--) {
    keys.push(isoDateUtc(y, m, d - i));
  }
  return keys;
}

function weeklyRentalActivity(days: readonly string[]): WeeklyRentalActivityPointDto[] {
  return days.map((date, index) => ({
    date,
    rented: RENTAL_PATTERN[index]?.rented ?? 0,
    returned: RENTAL_PATTERN[index]?.returned ?? 0,
  }));
}

/**
 * Coherent frontend-only Dashboard fixture. Collected / Expenses / Net Movement
 * follow existing Finance vocabulary. No Outstanding, Deposit, or Manual Paid.
 */
export function buildDashboardSimulationFixture(
  now = new Date(),
  offsetMinutes = DASHBOARD_SIMULATION_OFFSET_MINUTES,
): DashboardOverviewDto {
  const days = lastNCalendarDateKeys(now, offsetMinutes, DASHBOARD_SIMULATION_WEEK_DAYS);
  const first = days[0] ?? isoDateUtc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const last = days[days.length - 1] ?? first;
  const from = utcFromBusinessMidnight(first, offsetMinutes);
  const to = utcFromBusinessNextMidnight(last, offsetMinutes);
  const collected = FINANCE_BREAKDOWN.filter((slice) => slice.direction === "COLLECTION").reduce(
    (sum, slice) => sum + slice.amount,
    0,
  );
  const expenses = FINANCE_BREAKDOWN.filter((slice) => slice.direction === "EXPENSE").reduce(
    (sum, slice) => sum + slice.amount,
    0,
  );

  return {
    generatedAt: now.toISOString(),
    range: { from, to },
    today: { from: utcFromBusinessMidnight(last, offsetMinutes), to, offsetMinutes },
    kpis: {
      activeRentals: 8,
      fleetTotal: 20,
      fleetRented: 8,
      fleetAvailable: 10,
      fleetService: 2,
      pendingLinks: 3,
      deliveriesToday: 4,
      readyForDelivery: 2,
      contractsTotal: 42,
    },
    weeklyFinance: {
      from,
      to,
      collected,
      expenses,
      netMovement: collected - expenses,
      currency: "AED",
      breakdown: [...FINANCE_BREAKDOWN],
    },
    weeklyRentalActivity: weeklyRentalActivity(days),
    fleetStatus: {
      total: 20,
      available: 10,
      rented: 8,
      service: 2,
    },
    todayDeliveries: [
      {
        id: `${DASHBOARD_SIMULATION_ID_PREFIX}delivery-1`,
        contractNumber: "DE-2026-000501",
        customerName: "Layla Hassan",
        vehicleName: "BMW 730Li · 2024",
        startAt: utcFromBusinessClock(last, offsetMinutes, 9, 30),
        status: "PAID",
      },
      {
        id: `${DASHBOARD_SIMULATION_ID_PREFIX}delivery-2`,
        contractNumber: "DE-2026-000502",
        customerName: "Omar Nasser",
        vehicleName: "Range Rover Vogue · 2023",
        startAt: utcFromBusinessClock(last, offsetMinutes, 11, 0),
        status: "SIGNED",
      },
      {
        id: `${DASHBOARD_SIMULATION_ID_PREFIX}delivery-3`,
        contractNumber: "DE-2026-000503",
        customerName: "Maha Ali",
        vehicleName: "Patrol · 2022",
        startAt: utcFromBusinessClock(last, offsetMinutes, 13, 15),
        status: "FORM",
      },
      {
        id: `${DASHBOARD_SIMULATION_ID_PREFIX}delivery-4`,
        contractNumber: "DE-2026-000504",
        customerName: null,
        vehicleName: "GMC Yukon · 2024",
        startAt: utcFromBusinessClock(last, offsetMinutes, 14, 45),
        status: "AWAITING",
      },
    ],
    recentContracts: [
      {
        id: `${DASHBOARD_SIMULATION_ID_PREFIX}contract-1`,
        contractNumber: "DE-2026-000488",
        customerName: "Sara Al Maktoum",
        vehicleName: "Mercedes S500 · 2024",
        employeeName: "Nour Adel",
        status: "ACTIVE",
      },
      {
        id: `${DASHBOARD_SIMULATION_ID_PREFIX}contract-2`,
        contractNumber: "DE-2026-000487",
        customerName: "Khalid Mansour",
        vehicleName: "BMW 730Li · 2024",
        employeeName: "Nour Adel",
        status: "RETOUT",
      },
      {
        id: `${DASHBOARD_SIMULATION_ID_PREFIX}contract-3`,
        contractNumber: "DE-2026-000486",
        customerName: "Fatima Noor",
        vehicleName: "Range Rover Sport · 2023",
        employeeName: "Hassan Fares",
        status: "PAID",
      },
      {
        id: `${DASHBOARD_SIMULATION_ID_PREFIX}contract-4`,
        contractNumber: "DE-2026-000485",
        customerName: "Yousef Karim",
        vehicleName: "Patrol · 2022",
        employeeName: "Hassan Fares",
        status: "SIGNED",
      },
      {
        id: `${DASHBOARD_SIMULATION_ID_PREFIX}contract-5`,
        contractNumber: "DE-2026-000484",
        customerName: null,
        vehicleName: "GMC Yukon · 2024",
        employeeName: "Nour Adel",
        status: "FORM",
      },
    ],
    gpsOnline: 12,
  };
}

export function isDashboardSimulationId(id: string | null | undefined): boolean {
  return Boolean(id && id.startsWith(DASHBOARD_SIMULATION_ID_PREFIX));
}
