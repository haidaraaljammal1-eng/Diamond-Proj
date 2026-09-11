"use client";

import { useEffect } from "react";
import { useAuth, usePermissions } from "@/modules/auth";
import { CONTRACTS_MANAGE_PERMISSION, CONTRACTS_READ_PERMISSION } from "@/modules/contracts/contracts.permissions";
import { VEHICLES_READ_PERMISSION } from "@/modules/vehicles/vehicles.permissions";
import { GPS_READ_PERMISSION } from "@/modules/gps/gps.permissions";
import { MAINTENANCE_READ_PERMISSION } from "@/modules/maintenance/maintenance.permissions";
import { FINANCE_READ_PERMISSION } from "@/modules/finance/finance.permissions";
import { DASHBOARD_PAGE_PERMISSIONS } from "../dashboard.permissions";
import { DASHBOARD_QUICK_ACCESS } from "../utils/dashboard.routes";
import { useDashboardStore } from "../stores/dashboard.store";

export function useDashboardOverview() {
  const { user, isLoading: authLoading } = useAuth();
  const { hasPermission } = usePermissions();
  const overview = useDashboardStore((s) => s.overview);
  const status = useDashboardStore((s) => s.status);
  const error = useDashboardStore((s) => s.error);
  const load = useDashboardStore((s) => s.load);
  const refresh = useDashboardStore((s) => s.refresh);

  const isAllowed = DASHBOARD_PAGE_PERMISSIONS.every((permission) =>
    hasPermission(permission),
  );
  const canReadContracts = hasPermission(CONTRACTS_READ_PERMISSION);
  const canReadVehicles = hasPermission(VEHICLES_READ_PERMISSION);
  const canReadFinance = hasPermission(FINANCE_READ_PERMISSION);
  const canReadGps = hasPermission(GPS_READ_PERMISSION);
  const canReadMaintenance = hasPermission(MAINTENANCE_READ_PERMISSION);
  const canGenerateLink =
    hasPermission(VEHICLES_READ_PERMISSION) &&
    hasPermission(CONTRACTS_MANAGE_PERMISSION);

  const quickAccess = DASHBOARD_QUICK_ACCESS.filter((item) =>
    hasPermission(item.permission),
  );

  useEffect(() => {
    if (isAllowed) void load();
  }, [isAllowed, load]);

  return {
    overview,
    status,
    error,
    isAllowed,
    isLoading: authLoading || (isAllowed && status === "loading" && overview == null),
    isAuthLoading: authLoading,
    viewerName: user?.name ?? null,
    canReadContracts,
    canReadVehicles,
    canReadFinance,
    canReadGps,
    canReadMaintenance,
    canGenerateLink,
    quickAccess,
    refresh,
  };
}
