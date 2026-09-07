"use client";

import { useEffect, useMemo } from "react";
import { usePermissions } from "@/modules/auth";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { useVehiclesStore } from "../stores/vehicles.store";
import type { PageMeta } from "../api/vehicles.api.types";
import type {
  CreateVehiclePayload,
  UpdateVehicleRatesPayload,
  VehicleCardDto,
  VehicleFiltersState,
  VehicleSortKey,
  VehicleStatusFilter,
} from "../types/vehicle.types";
import { countActiveFilters } from "../utils/vehicle-filters";
import {
  VEHICLES_MANAGE_PERMISSION,
  VEHICLES_PAGE_PERMISSIONS,
} from "../vehicles.permissions";

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
  canManage: boolean;
  canCreate: boolean;
  isCreating: boolean;
  createError: ApiRequestError | null;
  isUpdatingRates: boolean;
  updateRatesError: ApiRequestError | null;
  isDeactivating: boolean;
  deactivateError: ApiRequestError | null;
  loadVehicles: () => Promise<void>;
  refreshVehicles: () => Promise<void>;
  addVehicle: (payload: CreateVehiclePayload) => Promise<boolean>;
  updateDefaultRates: (id: number, payload: UpdateVehicleRatesPayload) => Promise<boolean>;
  deactivateVehicle: (id: number) => Promise<boolean>;
  clearCreateError: () => void;
  clearUpdateRatesError: () => void;
  clearDeactivateError: () => void;
  setStatusFilter: (status: VehicleStatusFilter) => void;
  applySearch: (search: string) => void;
  clearSearch: () => void;
  setVehicleType: (vehicleType: string | null) => void;
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
  const isCreating = useVehiclesStore((state) => state.isCreating);
  const createError = useVehiclesStore((state) => state.createError);
  const createVehicle = useVehiclesStore((state) => state.createVehicle);
  const clearCreateError = useVehiclesStore((state) => state.clearCreateError);
  const isUpdatingRates = useVehiclesStore((state) => state.isUpdatingRates);
  const updateRatesError = useVehiclesStore((state) => state.updateRatesError);
  const updateVehicleRates = useVehiclesStore((state) => state.updateVehicleRates);
  const clearUpdateRatesError = useVehiclesStore((state) => state.clearUpdateRatesError);
  const isDeactivating = useVehiclesStore((state) => state.isDeactivating);
  const deactivateError = useVehiclesStore((state) => state.deactivateError);
  const deactivateVehicleAction = useVehiclesStore((state) => state.deactivateVehicle);
  const clearDeactivateError = useVehiclesStore((state) => state.clearDeactivateError);

  const isAllowed = VEHICLES_PAGE_PERMISSIONS.every((permission) =>
    hasPermission(permission),
  );
  const canManage = hasPermission(VEHICLES_MANAGE_PERMISSION);
  const canCreate = canManage;

  useEffect(() => {
    if (isAllowed) void load();
  }, [isAllowed, load]);

  const filters = useMemo<VehicleFiltersState>(
    () => ({
      status: query.status,
      search: query.search,
      vehicleType: query.vehicleType,
      sort: query.sort,
    }),
    [query.status, query.search, query.vehicleType, query.sort],
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
      canManage,
      canCreate,
      isCreating,
      createError,
      isUpdatingRates,
      updateRatesError,
      isDeactivating,
      deactivateError,
      loadVehicles: load,
      refreshVehicles: refresh,
      addVehicle: createVehicle,
      updateDefaultRates: updateVehicleRates,
      deactivateVehicle: deactivateVehicleAction,
      clearCreateError,
      clearUpdateRatesError,
      clearDeactivateError,
      setStatusFilter: (statusFilter: VehicleStatusFilter) => {
        void setQuery({ status: statusFilter, page: 1 });
      },
      applySearch: (search: string) => {
        void setQuery({ search: search.trim(), page: 1 });
      },
      clearSearch: () => {
        void setQuery({ search: "", page: 1 });
      },
      setVehicleType: (vehicleType: string | null) => {
        void setQuery({ vehicleType, page: 1 });
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
      canManage,
      canCreate,
      isCreating,
      createError,
      isUpdatingRates,
      updateRatesError,
      isDeactivating,
      deactivateError,
      load,
      refresh,
      setQuery,
      resetFilters,
      createVehicle,
      updateVehicleRates,
      deactivateVehicleAction,
      clearCreateError,
      clearUpdateRatesError,
      clearDeactivateError,
    ],
  );
}
