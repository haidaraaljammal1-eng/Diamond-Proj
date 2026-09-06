"use client";

import { useEffect, useMemo } from "react";
import { usePermissions } from "@/modules/auth";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { useVehiclesStore } from "../stores/vehicles.store";
import type { PageMeta } from "../api/vehicles.api.types";
import type { VehicleCardDto, VehicleStatusFilter } from "../types/vehicle.types";
import { VEHICLES_PAGE_PERMISSIONS } from "../vehicles.permissions";

export interface UseVehiclesResult {
  vehicles: VehicleCardDto[];
  meta: PageMeta | null;
  statusFilter: VehicleStatusFilter;
  isAllowed: boolean;
  isLoading: boolean;
  isReady: boolean;
  error: ApiRequestError | null;
  loadVehicles: () => Promise<void>;
  refreshVehicles: () => Promise<void>;
  setStatusFilter: (status: VehicleStatusFilter) => void;
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

  const isAllowed = VEHICLES_PAGE_PERMISSIONS.every((permission) =>
    hasPermission(permission),
  );

  useEffect(() => {
    if (isAllowed) void load();
  }, [isAllowed, load]);

  return useMemo(
    () => ({
      vehicles,
      meta,
      statusFilter: query.status,
      isAllowed,
      isLoading: status === "loading" || (isAllowed && status === "idle"),
      isReady: status === "ready",
      error: status === "error" ? error : null,
      loadVehicles: load,
      refreshVehicles: refresh,
      setStatusFilter: (statusFilter: VehicleStatusFilter) => {
        void setQuery({ status: statusFilter, page: 1 });
      },
      setPage: (page: number) => {
        void setQuery({ page });
      },
    }),
    [
      vehicles,
      meta,
      query.status,
      isAllowed,
      status,
      error,
      load,
      refresh,
      setQuery,
    ],
  );
}
