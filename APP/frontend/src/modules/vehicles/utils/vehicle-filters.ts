import type {
  VehicleFiltersState,
  VehicleSortKey,
  VehiclesListQuery,
} from "../types/vehicle.types.ts";

/** Every filter at rest — the fleet as the office sees it by default. */
export const DEFAULT_VEHICLE_FILTERS: VehicleFiltersState = {
  status: "all",
  search: "",
  modelId: null,
  includeInactive: false,
  sort: "newest",
};

/**
 * UI ordering → Backend `sort` (`field:direction`). Only fields the Backend
 * whitelists in `VEHICLE_SORTABLE` appear here.
 */
export const VEHICLE_SORT_PARAM: Record<VehicleSortKey, string> = {
  newest: "createdAt:desc",
  priceAsc: "dailyRate:asc",
  priceDesc: "dailyRate:desc",
  yearDesc: "modelYear:desc",
  plate: "plateNumber:asc",
};

export const VEHICLE_SORT_KEYS = Object.keys(
  VEHICLE_SORT_PARAM,
) as VehicleSortKey[];

/**
 * Builds the `GET /vehicles` query string. Defaults are omitted so the URL
 * carries only what the operator actually narrowed by, and `search` is trimmed
 * because the Backend rejects a blank string.
 */
export function buildVehiclesQuery(params: VehiclesListQuery): string {
  const search = new URLSearchParams();
  search.set("page", String(params.page ?? 1));
  search.set("pageSize", String(params.pageSize ?? 100));

  if (params.status && params.status !== "all") {
    search.set("status", params.status);
  }

  const term = params.search?.trim();
  if (term) search.set("search", term);

  if (params.modelId != null) search.set("modelId", String(params.modelId));

  // Omitted entirely when inactive rows are included: the Backend then returns
  // both, instead of being pinned to `isActive = false`.
  if (!params.includeInactive) search.set("active", "true");

  if (params.sort && params.sort !== "newest") {
    search.set("sort", VEHICLE_SORT_PARAM[params.sort]);
  }

  return search.toString();
}

/** How many filters are narrowing the list right now (drives the badge). */
export function countActiveFilters(filters: VehicleFiltersState): number {
  let count = 0;
  if (filters.status !== DEFAULT_VEHICLE_FILTERS.status) count += 1;
  if (filters.search.trim()) count += 1;
  if (filters.modelId != null) count += 1;
  if (filters.includeInactive) count += 1;
  if (filters.sort !== DEFAULT_VEHICLE_FILTERS.sort) count += 1;
  return count;
}
