"use client";

import { useEffect, useMemo } from "react";
import { usePermissions } from "@/modules/auth";
import { VEHICLES_READ_PERMISSION } from "@/modules/vehicles/vehicles.permissions";
import type { VehicleCardDto } from "@/modules/vehicles/types/vehicle.types";
import { useAvailableMaintenanceVehiclesStore } from "../stores/available-maintenance-vehicles.store";

export interface UseAvailableMaintenanceVehiclesResult {
  vehicles: VehicleCardDto[];
  isLoading: boolean;
  search: string;
  companyId: number | null;
  applySearch: (search: string) => void;
  clearSearch: () => void;
  setCompany: (companyId: number | null) => void;
  canReadVehicles: boolean;
}

/**
 * Available active vehicles for the Add Maintenance selector.
 * Calls `GET /vehicles?status=available&active=true&search=…&companyId=…` on an
 * explicit search or company change — the fleet is never filtered client-side.
 */
export function useAvailableMaintenanceVehicles(
  enabled: boolean,
): UseAvailableMaintenanceVehiclesResult {
  const { hasPermission } = usePermissions();
  const canReadVehicles = hasPermission(VEHICLES_READ_PERMISSION);
  const vehicles = useAvailableMaintenanceVehiclesStore((state) => state.vehicles);
  const search = useAvailableMaintenanceVehiclesStore((state) => state.search);
  const companyId = useAvailableMaintenanceVehiclesStore((state) => state.companyId);
  const status = useAvailableMaintenanceVehiclesStore((state) => state.status);
  const load = useAvailableMaintenanceVehiclesStore((state) => state.load);

  useEffect(() => {
    if (!enabled || !canReadVehicles) return;
    void load("", null);
  }, [enabled, canReadVehicles, load]);

  return useMemo(
    () => ({
      vehicles: canReadVehicles ? vehicles : [],
      isLoading: status === "loading" || (enabled && canReadVehicles && status === "idle"),
      search,
      companyId,
      applySearch: (next: string) => {
        void load(next);
      },
      clearSearch: () => {
        void load("");
      },
      setCompany: (next: number | null) => {
        void load(search, next);
      },
      canReadVehicles,
    }),
    [canReadVehicles, vehicles, status, enabled, search, companyId, load],
  );
}
