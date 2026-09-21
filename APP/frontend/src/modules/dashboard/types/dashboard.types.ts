import type { OperatingCompanyIdentity } from "@/modules/operating-companies";
import type { ContractStatus } from "@/modules/contracts/types/contract.types";

export type DashboardFinanceBreakdownKey =
  | "RENTAL_PAYMENT"
  | "RENEWAL_PAYMENT"
  | "RECONCILIATION_PAYMENT"
  | "POST_CLOSE_RECEIVABLE_PAYMENT"
  | "MAINTENANCE_EXPENSE"
  | "MANUAL_EXPENSE";

export interface DashboardKpisDto {
  activeRentals: number | null;
  fleetTotal: number | null;
  fleetRented: number | null;
  fleetAvailable: number | null;
  fleetService: number | null;
  pendingLinks: number | null;
  deliveriesToday: number | null;
  readyForDelivery: number | null;
  contractsTotal: number | null;
}

export interface WeeklyFinanceSliceDto {
  key: DashboardFinanceBreakdownKey;
  direction: "COLLECTION" | "EXPENSE";
  amount: number;
}

export interface WeeklyFinanceDto {
  from: string;
  to: string;
  collected: number;
  expenses: number;
  netMovement: number;
  currency: string;
  breakdown: WeeklyFinanceSliceDto[];
}

export interface WeeklyRentalActivityPointDto {
  date: string;
  rented: number;
  returned: number;
}

export interface FleetStatusDto {
  total: number;
  available: number;
  rented: number;
  service: number;
}

/**
 * Row-level company identity from `Contract.company`. Optional and nullable so a
 * simulated or pre-multi-company payload simply renders no marker instead of
 * breaking the row — the lesson Phase A learned from the TARS projection.
 */
export type DashboardCompanyDto = OperatingCompanyIdentity;

export interface TodayDeliveryDto {
  id: string;
  contractNumber: string;
  customerName: string | null;
  vehicleName: string;
  startAt: string;
  status: ContractStatus;
  company?: DashboardCompanyDto | null;
}

export interface RecentContractDto {
  id: string;
  contractNumber: string;
  customerName: string | null;
  vehicleName: string;
  employeeName: string | null;
  status: ContractStatus;
  company?: DashboardCompanyDto | null;
}

export interface DashboardOverviewDto {
  generatedAt: string;
  range: { from: string; to: string };
  today: { from: string; to: string; offsetMinutes: number };
  kpis: DashboardKpisDto;
  weeklyFinance: WeeklyFinanceDto | null;
  weeklyRentalActivity: WeeklyRentalActivityPointDto[] | null;
  fleetStatus: FleetStatusDto | null;
  todayDeliveries: TodayDeliveryDto[] | null;
  recentContracts: RecentContractDto[] | null;
  gpsOnline: number | null;
}

export interface DashboardQuickAccessItem {
  key: "cars" | "contracts" | "gps" | "maintenance";
  href: string;
  permission: string;
}
