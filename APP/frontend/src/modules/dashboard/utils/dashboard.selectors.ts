import type {
  ContractStatus,
  DashboardOverview,
  ExpenseBreakdown,
  FleetBreakdown,
  TodayDelivery,
  WeeklyPoint,
  DashboardScope,
  RecentContract,
  VehicleStatus,
} from "../types/dashboard.types.ts";

interface SelectorVehicle {
  id: string;
  name: string;
  status: VehicleStatus;
}

interface SelectorEmployee {
  id: string;
  name: string;
}

interface SelectorContract {
  id: string;
  vehicleId: string;
  employeeId: string;
  customerName: string;
  status: ContractStatus;
  dueToday?: boolean;
  slot?: string;
}

interface SelectorDailyMoney {
  key: string;
  revenue: number;
  expense: number;
}

interface SelectorExpenseCategory {
  key: string;
  amount: number;
}

export interface DashboardSource {
  vehicles: readonly SelectorVehicle[];
  employees: readonly SelectorEmployee[];
  /** Newest-first, exactly like the Demo `CONTRACTS` runtime order. */
  contracts: readonly SelectorContract[];
  unreadMessages: number;
  /** Oldest → newest daily money movement. */
  week: readonly SelectorDailyMoney[];
  /** Expenses of the same window, by category. */
  expenseCategories: readonly SelectorExpenseCategory[];
}

/** Demo: a contract counts as "active" when it is running or already paid. */
const ACTIVE_STATUSES: readonly ContractStatus[] = ["active", "paid"];
/** Demo: a rental link is still pending until the customer signs. */
const PENDING_LINK_STATUSES: readonly ContractStatus[] = ["awaiting", "form"];
/** Demo: a hand-over is ready once the customer has signed and paid. */
const READY_STATUSES: readonly ContractStatus[] = ["signed", "paid"];

const RECENT_LIMIT = 5;

/** Demo `myContracts()` — the owner sees the office, staff see their open work. */
export function selectScopedContracts(
  contracts: readonly SelectorContract[],
  scope: DashboardScope,
): readonly SelectorContract[] {
  if (scope.kind === "office") return contracts;
  return contracts.filter(
    (contract) =>
      contract.employeeId === scope.employeeId && contract.status !== "closed",
  );
}

/**
 * Builds the whole dashboard payload from raw records — the same derivations
 * the Demo `vDash()` performs. Pure and source-agnostic: the Demo fixtures feed
 * it today, the Backend payload feeds it (or replaces it) later.
 */
export function buildDashboardOverview(
  source: DashboardSource,
  scope: DashboardScope,
): DashboardOverview {
  const contracts = selectScopedContracts(source.contracts, scope);
  const employeeById = new Map(source.employees.map((e) => [e.id, e.name]));
  const vehicleById = new Map(source.vehicles.map((v) => [v.id, v.name]));

  const fleet: FleetBreakdown = {
    available: source.vehicles.filter((v) => v.status === "available").length,
    rented: source.vehicles.filter((v) => v.status === "rented").length,
    service: source.vehicles.filter((v) => v.status === "service").length,
  };

  const todayDeliveries: TodayDelivery[] = contracts
    .filter((contract) => contract.dueToday)
    .map((contract) => ({
      id: contract.id,
      customerName: contract.customerName,
      vehicleName: vehicleById.get(contract.vehicleId) ?? contract.vehicleId,
      slot: contract.slot ?? null,
      status: contract.status,
    }));

  const week: WeeklyPoint[] = source.week.map((day) => ({
    key: day.key,
    revenue: day.revenue,
    expense: day.expense,
    net: day.revenue - day.expense,
  }));

  const expenseTotal = source.expenseCategories.reduce(
    (sum, category) => sum + category.amount,
    0,
  );
  const expenses: ExpenseBreakdown = {
    total: expenseTotal,
    slices: source.expenseCategories.map((category) => ({
      key: category.key,
      amount: category.amount,
      share:
        expenseTotal > 0
          ? Math.round((category.amount / expenseTotal) * 100)
          : 0,
    })),
  };

  const recentContracts: RecentContract[] = [...contracts]
    .reverse()
    .slice(0, RECENT_LIMIT)
    .map((contract) => ({
      id: contract.id,
      customerName: contract.customerName,
      vehicleName: vehicleById.get(contract.vehicleId) ?? contract.vehicleId,
      employeeName: employeeById.get(contract.employeeId) ?? null,
      status: contract.status,
    }));

  return {
    activeContracts: contracts.filter((c) => ACTIVE_STATUSES.includes(c.status))
      .length,
    ongoingRentals: contracts.filter((c) => c.status === "active").length,
    fleetRented: fleet.rented,
    fleetTotal: source.vehicles.length,
    pendingLinks: contracts.filter((c) =>
      PENDING_LINK_STATUSES.includes(c.status),
    ).length,
    deliveriesToday: contracts.filter((c) => c.dueToday).length,
    readyForDelivery: contracts.filter(
      (c) => c.dueToday && READY_STATUSES.includes(c.status),
    ).length,
    vehiclesInService: fleet.service,
    todayDeliveries,
    fleet,
    week,
    expenses,
    contractsTotal: contracts.length,
    unreadMessages: source.unreadMessages,
    recentContracts,
  };
}
