/**
 * Home dashboard contract.
 *
 * This is the shape the page consumes today from the Demo fixtures and the
 * shape the Backend must return once the Diamond rental domain (contracts,
 * fleet, rental links, office WhatsApp) exists. Keeping it here means wiring
 * the real endpoint later changes ONE file: `hooks/use-dashboard-overview`.
 */

/** Demo `ST` contract lifecycle keys, in Demo order. */
export type ContractStatus =
  | "awaiting"
  | "form"
  | "signed"
  | "paid"
  | "active"
  | "retout"
  | "review"
  | "closed";

/** Demo `CARS[].status`. */
export type VehicleStatus = "available" | "rented" | "service";

export interface RecentContract {
  /** Public contract number (Demo `DE-2026-0817-114`). */
  id: string;
  customerName: string;
  vehicleName: string;
  /** The staff member who issued it — shown to the owner only. */
  employeeName: string | null;
  status: ContractStatus;
}

/** A hand-over scheduled for today (Demo ops "تسليم اليوم" row). */
export interface TodayDelivery {
  id: string;
  customerName: string;
  vehicleName: string;
  /** Demo `slot` — the agreed hand-over time. */
  slot: string | null;
  status: ContractStatus;
}

/** Fleet split by vehicle status (Demo `CARS[].status`). */
export interface FleetBreakdown {
  available: number;
  rented: number;
  service: number;
}

/** One day of money movement (Demo finance ledger, aggregated). */
export interface WeeklyPoint {
  key: string;
  revenue: number;
  expense: number;
  net: number;
}

/** One expense category over the same window. */
export interface ExpenseSlice {
  key: string;
  amount: number;
  /** Percentage of the window total, rounded. */
  share: number;
}

export interface ExpenseBreakdown {
  total: number;
  slices: ExpenseSlice[];
}

export interface DashboardOverview {
  /** KPI 1 — contracts in `active` or `paid` (Demo `act`). */
  activeContracts: number;
  /** KPI 1 delta line — contracts strictly `active` (Demo "▲ n إيجار جارٍ"). */
  ongoingRentals: number;
  /** KPI 2 — vehicles currently rented / fleet size. */
  fleetRented: number;
  fleetTotal: number;
  /** KPI 3 — rental links the customer has not completed (`awaiting` + `form`). */
  pendingLinks: number;
  /** KPI 4 — contracts scheduled for hand-over today. */
  deliveriesToday: number;
  /** KPI 4 delta line — of those, the ones already paid and ready. */
  readyForDelivery: number;
  /** Quick access — vehicles currently in the workshop. */
  vehiclesInService: number;
  /** Quick access — contracts visible to the viewer. */
  contractsTotal: number;
  /** Quick access — unread office WhatsApp messages. */
  unreadMessages: number;
  /** Today's hand-overs, in schedule order. */
  todayDeliveries: TodayDelivery[];
  /** Fleet split — available / rented / in the workshop. */
  fleet: FleetBreakdown;
  /** Last 7 days of revenue vs expense, oldest first. */
  week: WeeklyPoint[];
  /** Expenses of the same window, by category. */
  expenses: ExpenseBreakdown;
  /** Latest 5 contracts, newest first. */
  recentContracts: RecentContract[];
}

/** Which contracts the viewer may see — Demo `myContracts()`. */
export type DashboardScope =
  | { kind: "office" }
  | { kind: "own"; employeeId: string };
