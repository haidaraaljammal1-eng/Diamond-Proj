"use client";

import { useEffect, useMemo } from "react";
import { useAuth } from "@/modules/auth";
import {
  FN,
  isFunctionalRbacV2UiEnabled,
  useDiamondPageAccess,
  useLegacyOrFunctionalCapability,
} from "@/modules/functional-rbac";
import { CONTRACTS_MANAGE_PERMISSION } from "@/modules/contracts/contracts.permissions";
import { DASHBOARD_QUICK_ACCESS } from "../utils/dashboard.routes";
import { useDashboardStore } from "../stores/dashboard.store";
import { usePermissions } from "@/modules/auth";

export function useDashboardOverview() {
  const { user, isLoading: authLoading } = useAuth();
  const { hasPermission } = usePermissions();
  const overview = useDashboardStore((s) => s.overview);
  const status = useDashboardStore((s) => s.status);
  const error = useDashboardStore((s) => s.error);
  const companyId = useDashboardStore((s) => s.companyId);
  const setCompanyId = useDashboardStore((s) => s.setCompanyId);
  const load = useDashboardStore((s) => s.load);
  const refresh = useDashboardStore((s) => s.refresh);

  const isAllowed = useDiamondPageAccess("dashboard");
  const canReadContracts = useDiamondPageAccess("contracts");
  const canReadVehicles = useDiamondPageAccess("vehicles");
  const canReadFinance = useDiamondPageAccess("finance");
  const canReadGps = useDiamondPageAccess("gps");
  const canReadMaintenance = useDiamondPageAccess("maintenance");
  const canGenerateLink =
    useDiamondPageAccess("vehicles") &&
    useLegacyOrFunctionalCapability(
      CONTRACTS_MANAGE_PERMISSION,
      FN.contracts.rentalLink,
    );

  const quickAccess = useMemo(() => {
    if (!isFunctionalRbacV2UiEnabled()) {
      return DASHBOARD_QUICK_ACCESS.filter((item) =>
        hasPermission(item.permission),
      );
    }
    const visible = new Set<string>();
    if (canReadVehicles) visible.add("/vehicles");
    if (canReadContracts) visible.add("/contracts");
    if (canReadGps) visible.add("/gps");
    if (canReadMaintenance) visible.add("/maintenance");
    return DASHBOARD_QUICK_ACCESS.filter((item) => visible.has(item.href));
  }, [
    canReadVehicles,
    canReadContracts,
    canReadGps,
    canReadMaintenance,
    hasPermission,
  ]);

  useEffect(() => {
    if (isAllowed) void load();
  }, [isAllowed, companyId, load]);

  return {
    overview,
    status,
    error,
    companyId,
    setCompanyId,
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
