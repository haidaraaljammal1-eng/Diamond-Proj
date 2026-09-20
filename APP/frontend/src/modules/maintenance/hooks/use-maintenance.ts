"use client";

import { useEffect, useMemo } from "react";
import { usePermissions } from "@/modules/auth";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import {
  MAINTENANCE_HISTORY_PAGE_SIZE,
  type PageMeta,
} from "../api/maintenance.api.types";
import {
  MAINTENANCE_MANAGE_PERMISSION,
  MAINTENANCE_PAGE_PERMISSIONS,
} from "../maintenance.permissions";
import { useMaintenanceStore } from "../stores/maintenance.store";
import type {
  CreateMaintenancePayload,
  MaintenanceFiltersState,
  MaintenanceLifecycleAction,
  MaintenanceOrderDetailDto,
  MaintenanceSortKey,
  MaintenanceStatusFilter,
  MaintenanceSummaryDto,
  MaintenanceType,
  UpdateMaintenancePayload,
} from "../types/maintenance.types";
import { countActiveFilters } from "../utils/maintenance-filters";

export interface UseMaintenanceListResult {
  items: MaintenanceOrderDetailDto[];
  meta: PageMeta | null;
  filters: MaintenanceFiltersState;
  activeFilterCount: number;
  history: MaintenanceOrderDetailDto[];
  historyMeta: PageMeta | null;
  historyPage: number;
  summary: MaintenanceSummaryDto | null;
  isAllowed: boolean;
  canManage: boolean;
  isLoading: boolean;
  isReady: boolean;
  isHistoryLoading: boolean;
  isHistoryReady: boolean;
  isSummaryLoading: boolean;
  error: ApiRequestError | null;
  historyError: ApiRequestError | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  setStatusFilter: (status: MaintenanceStatusFilter) => void;
  applySearch: (search: string) => void;
  clearSearch: () => void;
  setMaintenanceType: (type: MaintenanceType | null) => void;
  setCompany: (companyId: number | null) => void;
  setSort: (sort: MaintenanceSortKey) => void;
  clearFilters: () => void;
  setPage: (page: number) => void;
  setHistoryPage: (page: number) => void;
}

export function useMaintenanceList(): UseMaintenanceListResult {
  const { hasPermission } = usePermissions();
  const items = useMaintenanceStore((state) => state.items);
  const meta = useMaintenanceStore((state) => state.meta);
  const query = useMaintenanceStore((state) => state.query);
  const status = useMaintenanceStore((state) => state.status);
  const error = useMaintenanceStore((state) => state.error);
  const history = useMaintenanceStore((state) => state.history);
  const historyMeta = useMaintenanceStore((state) => state.historyMeta);
  const historyPage = useMaintenanceStore((state) => state.historyPage);
  const historyStatus = useMaintenanceStore((state) => state.historyStatus);
  const historyError = useMaintenanceStore((state) => state.historyError);
  const summary = useMaintenanceStore((state) => state.summary);
  const summaryStatus = useMaintenanceStore((state) => state.summaryStatus);
  const load = useMaintenanceStore((state) => state.load);
  const refresh = useMaintenanceStore((state) => state.refresh);
  const setQuery = useMaintenanceStore((state) => state.setQuery);
  const resetFilters = useMaintenanceStore((state) => state.resetFilters);
  const setHistoryPage = useMaintenanceStore((state) => state.setHistoryPage);

  const isAllowed = MAINTENANCE_PAGE_PERMISSIONS.every((permission) =>
    hasPermission(permission),
  );
  const canManage = hasPermission(MAINTENANCE_MANAGE_PERMISSION);

  useEffect(() => {
    if (isAllowed) void load();
  }, [isAllowed, load]);

  const filters = useMemo<MaintenanceFiltersState>(
    () => ({
      status: query.status,
      search: query.search,
      maintenanceType: query.maintenanceType,
      companyId: query.companyId,
      sort: query.sort,
    }),
    [
      query.status,
      query.search,
      query.maintenanceType,
      query.companyId,
      query.sort,
    ],
  );

  return useMemo(
    () => ({
      items,
      meta,
      filters,
      activeFilterCount: countActiveFilters(filters),
      history,
      historyMeta,
      historyPage,
      summary,
      isAllowed,
      canManage,
      isLoading: status === "loading" || (isAllowed && status === "idle"),
      isReady: status === "ready",
      isHistoryLoading:
        historyStatus === "loading" || (isAllowed && historyStatus === "idle"),
      isHistoryReady: historyStatus === "ready",
      isSummaryLoading:
        summaryStatus === "loading" || (isAllowed && summaryStatus === "idle"),
      error: status === "error" ? error : null,
      historyError: historyStatus === "error" ? historyError : null,
      load,
      refresh,
      setStatusFilter: (statusFilter: MaintenanceStatusFilter) => {
        void setQuery({ status: statusFilter, page: 1 });
      },
      applySearch: (search: string) => {
        void setQuery({ search: search.trim(), page: 1 });
      },
      clearSearch: () => {
        void setQuery({ search: "", page: 1 });
      },
      setMaintenanceType: (type: MaintenanceType | null) => {
        void setQuery({ maintenanceType: type, page: 1 });
      },
      setCompany: (companyId: number | null) => {
        void setQuery({ companyId, page: 1 });
      },
      setSort: (sort: MaintenanceSortKey) => {
        void setQuery({ sort, page: 1 });
      },
      clearFilters: resetFilters,
      setPage: (page: number) => {
        void setQuery({ page });
      },
      setHistoryPage,
    }),
    [
      items,
      meta,
      filters,
      history,
      historyMeta,
      historyPage,
      summary,
      isAllowed,
      canManage,
      status,
      summaryStatus,
      historyStatus,
      error,
      historyError,
      load,
      refresh,
      setQuery,
      resetFilters,
      setHistoryPage,
    ],
  );
}

export interface UseMaintenanceDetailResult {
  detail: MaintenanceOrderDetailDto | null;
  isLoading: boolean;
  error: ApiRequestError | null;
  loadDetail: (id: number) => Promise<void>;
  clearDetail: () => void;
}

export function useMaintenanceDetail(): UseMaintenanceDetailResult {
  const detail = useMaintenanceStore((state) => state.detail);
  const detailId = useMaintenanceStore((state) => state.detailId);
  const detailStatus = useMaintenanceStore((state) => state.detailStatus);
  const detailError = useMaintenanceStore((state) => state.detailError);
  const fetchDetail = useMaintenanceStore((state) => state.fetchDetail);
  const clearDetail = useMaintenanceStore((state) => state.clearDetail);

  return useMemo(
    () => ({
      detail,
      isLoading:
        detailStatus === "loading" ||
        (detailId != null && detailStatus === "idle"),
      error: detailStatus === "error" ? detailError : null,
      loadDetail: fetchDetail,
      clearDetail,
    }),
    [detail, detailId, detailStatus, detailError, fetchDetail, clearDetail],
  );
}

export interface UseMaintenanceActionsResult {
  canManage: boolean;
  isCreating: boolean;
  createError: ApiRequestError | null;
  isUpdating: boolean;
  updateError: ApiRequestError | null;
  mutatingId: number | null;
  mutatingAction: MaintenanceLifecycleAction | null;
  actionError: ApiRequestError | null;
  createOrder: (payload: CreateMaintenancePayload) => Promise<boolean>;
  updateOrder: (id: number, payload: UpdateMaintenancePayload) => Promise<boolean>;
  startMaintenance: (id: number) => Promise<boolean>;
  markReadyForPickup: (id: number) => Promise<boolean>;
  completeMaintenance: (id: number) => Promise<boolean>;
  cancelMaintenance: (id: number) => Promise<boolean>;
  clearCreateError: () => void;
  clearUpdateError: () => void;
  clearActionError: () => void;
  isMutating: (id: number, action?: MaintenanceLifecycleAction) => boolean;
}

export function useMaintenanceActions(): UseMaintenanceActionsResult {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(MAINTENANCE_MANAGE_PERMISSION);
  const isCreating = useMaintenanceStore((state) => state.isCreating);
  const createError = useMaintenanceStore((state) => state.createError);
  const isUpdating = useMaintenanceStore((state) => state.isUpdating);
  const updateError = useMaintenanceStore((state) => state.updateError);
  const mutatingId = useMaintenanceStore((state) => state.mutatingId);
  const mutatingAction = useMaintenanceStore((state) => state.mutatingAction);
  const actionError = useMaintenanceStore((state) => state.actionError);
  const createOrder = useMaintenanceStore((state) => state.createOrder);
  const updateOrder = useMaintenanceStore((state) => state.updateOrder);
  const runLifecycle = useMaintenanceStore((state) => state.runLifecycle);
  const clearCreateError = useMaintenanceStore((state) => state.clearCreateError);
  const clearUpdateError = useMaintenanceStore((state) => state.clearUpdateError);
  const clearActionError = useMaintenanceStore((state) => state.clearActionError);

  return useMemo(
    () => ({
      canManage,
      isCreating,
      createError,
      isUpdating,
      updateError,
      mutatingId,
      mutatingAction,
      actionError,
      createOrder,
      updateOrder,
      startMaintenance: (id: number) => runLifecycle(id, "start"),
      markReadyForPickup: (id: number) => runLifecycle(id, "ready"),
      completeMaintenance: (id: number) => runLifecycle(id, "complete"),
      cancelMaintenance: (id: number) => runLifecycle(id, "cancel"),
      clearCreateError,
      clearUpdateError,
      clearActionError,
      isMutating: (id: number, action?: MaintenanceLifecycleAction) =>
        mutatingId === id && (action == null || mutatingAction === action),
    }),
    [
      canManage,
      isCreating,
      createError,
      isUpdating,
      updateError,
      mutatingId,
      mutatingAction,
      actionError,
      createOrder,
      updateOrder,
      runLifecycle,
      clearCreateError,
      clearUpdateError,
      clearActionError,
    ],
  );
}

export { MAINTENANCE_HISTORY_PAGE_SIZE };
