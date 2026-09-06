import type { ContractStatus, VehicleStatus } from "../types/dashboard.types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * TEMPORARY — Demo fixtures, not application data.
 *
 * The Backend has no Diamond rental domain yet (no Contract / rental link /
 * fleet-status model), so the Dashboard is built as UI against the Demo's own
 * records, copied verbatim from `demo.html` (`CARS`, `EMP`, `CONTRACTS` after
 * `seedOpsDemo()`, `CHATS`). Same rows, same order, same counts as the Demo.
 *
 * DELETE this file when `GET /dashboard/overview` returns the Diamond sections;
 * only `hooks/use-dashboard-overview` imports it.
 * ────────────────────────────────────────────────────────────────────────────
 */

export interface DemoVehicle {
  id: string;
  name: string;
  status: VehicleStatus;
}

export interface DemoEmployee {
  id: string;
  name: string;
}

export interface DemoContract {
  id: string;
  vehicleId: string;
  employeeId: string;
  customerName: string;
  status: ContractStatus;
  /** Demo `seedOpsDemo()` — scheduled for hand-over today. */
  dueToday?: boolean;
  /** Demo `slot` — the agreed hand-over time. */
  slot?: string;
}

/** Demo `CARS` — the office fleet (12 vehicles). */
export const DEMO_VEHICLES: readonly DemoVehicle[] = [
  { id: "c1", name: "Nissan Patrol Platinum", status: "rented" },
  { id: "c2", name: "Mercedes GLE 450", status: "available" },
  { id: "c3", name: "Toyota Land Cruiser VXR", status: "rented" },
  { id: "c4", name: "Range Rover Sport HSE", status: "available" },
  { id: "c5", name: "BMW 530i M-Sport", status: "available" },
  { id: "c6", name: "Lexus LX600 Signature", status: "service" },
  { id: "c7", name: "Porsche Cayenne S", status: "available" },
  { id: "c8", name: "Toyota Camry GLE", status: "rented" },
  { id: "c9", name: "Nissan Kicks SV", status: "available" },
  { id: "c10", name: "GMC Yukon Denali", status: "rented" },
  { id: "c11", name: "Mitsubishi Pajero GLS", status: "available" },
  { id: "c12", name: "Ford Explorer XLT", status: "service" },
];

/** Demo `EMP` — `e0` is the owner; the rest are staff. */
export const DEMO_EMPLOYEES: readonly DemoEmployee[] = [
  { id: "e0", name: "م. عبدالله" },
  { id: "e1", name: "خالد المنصوري" },
  { id: "e2", name: "سارة الفهد" },
  { id: "e3", name: "أحمد الشامسي" },
  { id: "e4", name: "يوسف خان" },
];

/** The employee an "own scope" viewer maps to in the Demo (`myContracts()`). */
export const DEMO_SELF_EMPLOYEE_ID = "e1";

/**
 * Demo `CONTRACTS` in runtime order: `seedOpsDemo()` unshifts today's three
 * operations contracts (120/121/122) in front of the eight seed contracts.
 */
export const DEMO_CONTRACTS: readonly DemoContract[] = [
  { id: "DE-2026-0824-120", vehicleId: "c4", employeeId: "e2", customerName: "ليلى عبدالله", status: "awaiting", dueToday: true, slot: "09:30 ص" },
  { id: "DE-2026-0824-121", vehicleId: "c7", employeeId: "e1", customerName: "عبدالعزيز الفلاسي", status: "form", dueToday: true, slot: "11:00 ص" },
  { id: "DE-2026-0824-122", vehicleId: "c5", employeeId: "e4", customerName: "سالم ربيع", status: "signed", dueToday: true, slot: "02:30 م" },
  { id: "DE-2026-0817-114", vehicleId: "c1", employeeId: "e1", customerName: "سعيد بن حمدان", status: "active" },
  { id: "DE-2026-0817-113", vehicleId: "c3", employeeId: "e2", customerName: "راشد الكعبي", status: "active" },
  { id: "DE-2026-0817-112", vehicleId: "c8", employeeId: "e1", customerName: "محمد إقبال", status: "active" },
  { id: "DE-2026-0816-111", vehicleId: "c10", employeeId: "e4", customerName: "فهد الدوسري", status: "closed" },
  { id: "DE-2026-0816-110", vehicleId: "c2", employeeId: "e1", customerName: "نورة السويدي", status: "signed" },
  { id: "DE-2026-0815-109", vehicleId: "c5", employeeId: "e2", customerName: "عمر الحوسني", status: "paid" },
  { id: "DE-2026-0814-108", vehicleId: "c7", employeeId: "e4", customerName: "Dana Whitmore", status: "closed" },
  { id: "DE-2026-0813-107", vehicleId: "c11", employeeId: "e3", customerName: "فيصل العمري", status: "closed" },
];

/** Demo `CHATS[].unread` — office WhatsApp. */
export const DEMO_UNREAD_MESSAGES = 3;

/** Demo `FINANCE_ENTRIES` aggregated per day, oldest → newest (7 days). */
export interface DemoDailyMoney {
  /** Key under the `Dashboard.week` message namespace. */
  key: string;
  revenue: number;
  expense: number;
}

export const DEMO_WEEK: readonly DemoDailyMoney[] = [
  { key: "day1", revenue: 2295, expense: 310 },
  { key: "day2", revenue: 3260, expense: 260 },
  { key: "day3", revenue: 3120, expense: 220 },
  { key: "day4", revenue: 33175, expense: 2090 },
  { key: "day5", revenue: 37222, expense: 1770 },
  { key: "yesterday", revenue: 43070, expense: 1820 },
  { key: "today", revenue: 51288, expense: 3470 },
];

/** Demo `FINANCE_ENTRIES` expenses of the same 7 days, grouped by category. */
export interface DemoExpenseCategory {
  /** Key under the `Dashboard.expenseCategory` message namespace. */
  key: string;
  amount: number;
}

export const DEMO_EXPENSE_CATEGORIES: readonly DemoExpenseCategory[] = [
  { key: "maintenance", amount: 5890 },
  { key: "operations", amount: 1700 },
  { key: "administrative", amount: 1190 },
  { key: "fuel", amount: 1160 },
];
