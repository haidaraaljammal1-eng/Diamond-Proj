"use client";

import { useEffect, useMemo } from "react";
import { usePermissions } from "@/modules/auth";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { useVehiclesStore } from "../stores/vehicles.store";
import type { PageMeta } from "../api/vehicles.api.types";
import type {
  VehicleCardDto,
  VehicleFiltersState,
  VehicleSortKey,
  VehicleStatusFilter,
} from "../types/vehicle.types";
import { countActiveFilters } from "../utils/vehicle-filters";
import { VEHICLES_PAGE_PERMISSIONS } from "../vehicles.permissions";

export interface UseVehiclesResult {
  vehicles: VehicleCardDto[];
  meta: PageMeta | null;
  filters: VehicleFiltersState;
  /** How many filters are narrowing the list (0 = the whole active fleet). */
  activeFilterCount: number;
  isAllowed: boolean;
  isLoading: boolean;
  isReady: boolean;
  error: ApiRequestError | null;
  loadVehicles: () => Promise<void>;
  refreshVehicles: () => Promise<void>;
  setStatusFilter: (status: VehicleStatusFilter) => void;
  setSearch: (search: string) => void;
  setModelId: (modelId: number | null) => void;
  setIncludeInactive: (includeInactive: boolean) => void;
  setSort: (sort: VehicleSortKey) => void;
  clearFilters: () => void;
  setPage: (page: number) => void;
}

export function useVehicles(): UseVehiclesResult {
  const { hasPermission } = usePermissions();
  const vehicles = useVehiclesStore((state) => state.vehicles);
  const meta = useVehiclesStore((state) => state.meta);
  const query = useVehiclesStore((state) => state.query);
  const status = useVehiclesStore((state) => state.status);
  const error = useVehiclesStore((state) => state.error);
  const load = useVehiclesStore((state) => state.load);
  const refresh = useVehiclesStore((state) => state.refresh);
  const setQuery = useVehiclesStore((state) => state.setQuery);
  const resetFilters = useVehiclesStore((state) => state.resetFilters);

  const isAllowed = VEHICLES_PAGE_PERMISSIONS.every((permission) =>
    hasPermission(permission),
  );

  useEffect(() => {
    if (isAllowed) void load();
  }, [isAllowed, load]);

  const filters = useMemo<VehicleFiltersState>(
    () => ({
      status: query.status,
      search: query.search,
      modelId: query.modelId,
      includeInactive: query.includeInactive,
      sort: query.sort,
    }),
    [
      query.status,
      query.search,
      query.modelId,
      query.includeInactive,
      query.sort,
    ],
  );

  return useMemo(
    () => ({
      vehicles,
      meta,
      filters,
      activeFilterCount: countActiveFilters(filters),
      isAllowed,
      isLoading: status === "loading" || (isAllowed && status === "idle"),
      isReady: status === "ready",
      error: status === "error" ? error : null,
      loadVehicles: load,
      refreshVehicles: refresh,
      // Narrowing always returns to the first page — page 3 of the old result
      // set is meaningless once the filter changes.
      setStatusFilter: (statusFilter: VehicleStatusFilter) => {
        void setQuery({ status: statusFilter, page: 1 });
      },
      setSearch: (search: string) => {
        void setQuery({ search, page: 1 });
      },
      setModelId: (modelId: number | null) => {
        void setQuery({ modelId, page: 1 });
      },
      setIncludeInactive: (includeInactive: boolean) => {
        void setQuery({ includeInactive, page: 1 });
      },
      setSort: (sort: VehicleSortKey) => {
        void setQuery({ sort, page: 1 });
      },
      clearFilters: resetFilters,
      setPage: (page: number) => {
        void setQuery({ page });
      },
    }),
    [
      vehicles,
      meta,
      filters,
      isAllowed,
      status,
      error,
      load,
      refresh,
      setQuery,
      resetFilters,
    ],
  );
}
