import { VEHICLES_PAGE_SIZE } from "../api/vehicles.api.types.ts";
import type {
  VehicleFiltersState,
  VehicleSortKey,
  VehiclesListQuery,
} from "../types/vehicle.types.ts";

/** Every user-facing filter at rest — active fleet only (no retired toggle). */
export const DEFAULT_VEHICLE_FILTERS: VehicleFiltersState = {
  status: "all",
  search: "",
  vehicleType: null,
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
 * Builds the `GET /vehicles` query string. Fleet page always requests the
 * active scope (`active=true`); retired vehicles are out of scope here.
 */
export function buildVehiclesQuery(params: VehiclesListQuery): string {
  const search = new URLSearchParams();
  search.set("page", String(params.page ?? 1));
  search.set("pageSize", String(params.pageSize ?? VEHICLES_PAGE_SIZE));
  search.set("active", "true");

  if (params.status && params.status !== "all") {
    search.set("status", params.status);
  }

  const term = params.search?.trim();
  if (term) search.set("search", term);

  if (params.vehicleType) search.set("vehicleType", params.vehicleType);

  if (params.sort && params.sort !== "newest") {
    search.set("sort", VEHICLE_SORT_PARAM[params.sort]);
  }

  return search.toString();
}

/** How many user filters are narrowing the list (drives the badge). */
export function countActiveFilters(filters: VehicleFiltersState): number {
  let count = 0;
  if (filters.status !== DEFAULT_VEHICLE_FILTERS.status) count += 1;
  if (filters.search.trim()) count += 1;
  if (filters.vehicleType != null) count += 1;
  if (filters.sort !== DEFAULT_VEHICLE_FILTERS.sort) count += 1;
  return count;
}
