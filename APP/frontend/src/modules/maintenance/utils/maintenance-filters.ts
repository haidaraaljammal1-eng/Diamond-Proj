import { MAINTENANCE_PAGE_SIZE } from "../api/maintenance.api.types.ts";
import type {
  MaintenanceFiltersState,
  MaintenanceListQuery,
  MaintenanceSortKey,
  MaintenanceStatus,
  MaintenanceStatusFilter,
} from "../types/maintenance.types";

export const DEFAULT_MAINTENANCE_FILTERS: MaintenanceFiltersState = {
  status: "all",
  search: "",
  maintenanceType: null,
  companyId: null,
  sort: "newest",
};

export const MAINTENANCE_SORT_PARAM: Record<MaintenanceSortKey, string> = {
  newest: "createdAt:desc",
  scheduledAt: "scheduledAt:asc",
  expectedCompletion: "expectedCompletionAt:asc",
};

export const MAINTENANCE_SORT_KEYS = Object.keys(
  MAINTENANCE_SORT_PARAM,
) as MaintenanceSortKey[];

export const MAINTENANCE_STATUS_FILTERS: MaintenanceStatusFilter[] = [
  "all",
  "in_service",
  "scheduled",
  "ready_for_pickup",
  "overdue",
  "completed",
];

const ACTIVE_STATUSES: MaintenanceStatus[] = [
  "scheduled",
  "in_service",
  "ready_for_pickup",
];

export function isActiveMaintenanceStatus(status: MaintenanceStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/**
 * Maps the toolbar chip to the Backend `status` query.
 * `all` is omitted so the caller can load the three active statuses.
 */
export function toBackendStatusParam(
  status: MaintenanceStatusFilter,
): string | undefined {
  if (status === "all") return undefined;
  return status;
}

export function buildMaintenanceQuery(
  params: MaintenanceListQuery & { statusOverride?: string },
): string {
  const search = new URLSearchParams();
  search.set("page", String(params.page ?? 1));
  search.set("pageSize", String(params.pageSize ?? MAINTENANCE_PAGE_SIZE));

  const status = params.statusOverride ?? toBackendStatusParam(params.status);
  if (status) search.set("status", status);

  const term = params.search?.trim();
  if (term) search.set("search", term);

  if (params.maintenanceType) search.set("maintenanceType", params.maintenanceType);

  if (params.companyId != null) search.set("companyId", String(params.companyId));

  if (params.sort && params.sort !== "newest") {
    search.set("sort", MAINTENANCE_SORT_PARAM[params.sort]);
  }

  return search.toString();
}

export function countActiveFilters(filters: MaintenanceFiltersState): number {
  let count = 0;
  if (filters.status !== DEFAULT_MAINTENANCE_FILTERS.status) count += 1;
  if (filters.search.trim()) count += 1;
  if (filters.maintenanceType != null) count += 1;
  if (filters.companyId != null) count += 1;
  if (filters.sort !== DEFAULT_MAINTENANCE_FILTERS.sort) count += 1;
  return count;
}

export function emptyStateKind(input: {
  status: MaintenanceStatusFilter;
  hasSearch: boolean;
  hasType: boolean;
  hasCompany?: boolean;
}): "search" | "scheduled" | "inService" | "ready" | "history" | "active" {
  if (input.hasSearch || input.hasType || input.hasCompany) return "search";
  if (input.status === "scheduled") return "scheduled";
  if (input.status === "in_service") return "inService";
  if (input.status === "ready_for_pickup") return "ready";
  if (input.status === "completed") return "history";
  return "active";
}
