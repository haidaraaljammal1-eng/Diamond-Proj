import type {
  DashboardOverviewDto,
  FleetStatusDto,
  WeeklyFinanceDto,
  WeeklyRentalActivityPointDto,
} from "../types/dashboard.types";

export function isWeeklyRentalActivityEmpty(
  series: WeeklyRentalActivityPointDto[] | null,
): boolean {
  if (!series || series.length === 0) return true;
  return series.every((point) => point.rented === 0 && point.returned === 0);
}

export function isWeeklyFinanceEmpty(finance: WeeklyFinanceDto | null): boolean {
  if (!finance) return true;
  return finance.collected === 0 && finance.expenses === 0 && finance.breakdown.length === 0;
}

export function fleetUtilizationPercent(fleet: FleetStatusDto | null): number {
  if (!fleet || fleet.total <= 0) return 0;
  return Math.round((fleet.rented / fleet.total) * 100);
}

export function financeSliceShare(amount: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((amount / total) * 100);
}

export function visibleFinanceSlices(finance: WeeklyFinanceDto | null) {
  if (!finance) return [];
  const total = finance.breakdown.reduce((sum, slice) => sum + slice.amount, 0);
  return finance.breakdown
    .filter((slice) => slice.amount > 0)
    .map((slice) => ({
      key: slice.key,
      direction: slice.direction,
      amount: slice.amount,
      share: financeSliceShare(slice.amount, total),
    }));
}

export function financeSliceHoverDetail<
  T extends {
    key: string;
    amount: number;
    share: number;
    direction: "COLLECTION" | "EXPENSE";
  },
>(slices: readonly T[], index: number | null): T | null {
  if (index == null) return null;
  return slices[index] ?? null;
}

export function hasAnyDashboardSection(overview: DashboardOverviewDto | null): boolean {
  if (!overview) return false;
  const k = overview.kpis;
  return (
    k.activeRentals != null ||
    k.fleetTotal != null ||
    k.pendingLinks != null ||
    overview.weeklyFinance != null ||
    overview.weeklyRentalActivity != null ||
    overview.fleetStatus != null ||
    overview.todayDeliveries != null ||
    overview.recentContracts != null
  );
}
