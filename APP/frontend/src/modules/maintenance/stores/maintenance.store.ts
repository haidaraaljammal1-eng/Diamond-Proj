"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import {
  cancelMaintenance as cancelMaintenanceRequest,
  completeMaintenance as completeMaintenanceRequest,
  createMaintenance as createMaintenanceRequest,
  getMaintenance,
  getMaintenanceList,
  getMaintenanceSummary,
  markMaintenanceReady as markMaintenanceReadyRequest,
  startMaintenance as startMaintenanceRequest,
  updateMaintenance as updateMaintenanceRequest,
} from "../api/maintenance.api";
import {
  MAINTENANCE_HISTORY_PAGE_SIZE,
  MAINTENANCE_PAGE_SIZE,
  type PageMeta,
} from "../api/maintenance.api.types";
import type {
  CreateMaintenancePayload,
  MaintenanceFiltersState,
  MaintenanceLifecycleAction,
  MaintenanceListQuery,
  MaintenanceOrderDetailDto,
  MaintenanceSummaryDto,
  UpdateMaintenancePayload,
} from "../types/maintenance.types";
import { DEFAULT_MAINTENANCE_FILTERS } from "../utils/maintenance-filters";
import { resolveFleetPageAfterFetch } from "@/modules/vehicles/utils/vehicles-pagination";

export type MaintenanceLoadStatus = "idle" | "loading" | "ready" | "error";
export type MaintenanceDetailLoadStatus = "idle" | "loading" | "ready" | "error";

export interface MaintenanceQuery extends MaintenanceFiltersState {
  page: number;
  pageSize: number;
}

interface MaintenanceState {
  items: MaintenanceOrderDetailDto[];
  meta: PageMeta | null;
  query: MaintenanceQuery;
  status: MaintenanceLoadStatus;
  error: ApiRequestError | null;
  history: MaintenanceOrderDetailDto[];
  historyMeta: PageMeta | null;
  historyPage: number;
  historyStatus: MaintenanceLoadStatus;
  historyError: ApiRequestError | null;
  summary: MaintenanceSummaryDto | null;
  summaryStatus: MaintenanceLoadStatus;
  summaryError: ApiRequestError | null;
  detail: MaintenanceOrderDetailDto | null;
  detailId: number | null;
  detailStatus: MaintenanceDetailLoadStatus;
  detailError: ApiRequestError | null;
  isCreating: boolean;
  createError: ApiRequestError | null;
  isUpdating: boolean;
  updateError: ApiRequestError | null;
  mutatingId: number | null;
  mutatingAction: MaintenanceLifecycleAction | null;
  actionError: ApiRequestError | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  setQuery: (partial: Partial<MaintenanceQuery>) => void;
  resetFilters: () => void;
  setHistoryPage: (page: number) => void;
  fetchDetail: (id: number) => Promise<void>;
  clearDetail: () => void;
  createOrder: (payload: CreateMaintenancePayload) => Promise<boolean>;
  updateOrder: (id: number, payload: UpdateMaintenancePayload) => Promise<boolean>;
  runLifecycle: (
    id: number,
    action: MaintenanceLifecycleAction,
  ) => Promise<boolean>;
  clearCreateError: () => void;
  clearUpdateError: () => void;
  clearActionError: () => void;
}

let listInFlight: Promise<void> | null = null;
let historyInFlight: Promise<void> | null = null;
let summaryInFlight: Promise<void> | null = null;
let detailInFlight: Promise<void> | null = null;

const ACTIVE_STATUS_QUERIES = [
  "scheduled",
  "in_service",
  "ready_for_pickup",
] as const;

function mergeActivePages(
  pages: Array<{ data: MaintenanceOrderDetailDto[] }>,
): MaintenanceOrderDetailDto[] {
  const byId = new Map<number, MaintenanceOrderDetailDto>();
  for (const page of pages) {
    for (const order of page.data) {
      byId.set(order.id, order);
    }
  }
  return [...byId.values()].sort((a, b) => {
    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);
    return bTime - aTime;
  });
}

export const useMaintenanceStore = create<MaintenanceState>((set, get) => {
  async function fetchActiveList(): Promise<void> {
    const { query } = get();
    set({ status: "loading", error: null });
    try {
      if (query.status === "completed") {
        set({
          items: [],
          meta: { page: 1, pageSize: query.pageSize, total: 0, totalPages: 1 },
          status: "ready",
          error: null,
        });
        return;
      }

      if (query.status === "all") {
        const pages = await Promise.all(
          ACTIVE_STATUS_QUERIES.map((statusOverride) =>
            getMaintenanceList({
              ...query,
              page: 1,
              pageSize: MAINTENANCE_PAGE_SIZE,
              statusOverride,
            }),
          ),
        );
        const merged = mergeActivePages(pages);
        const total = pages.reduce((sum, page) => sum + (page.meta?.total ?? 0), 0);
        set({
          items: merged,
          meta: {
            page: 1,
            pageSize: merged.length || MAINTENANCE_PAGE_SIZE,
            total,
            totalPages: 1,
          },
          status: "ready",
          error: null,
        });
        return;
      }

      const result = await getMaintenanceList(query);
      const correctedPage = resolveFleetPageAfterFetch(
        query.page,
        result.meta,
        result.data.length,
      );
      if (correctedPage != null && correctedPage !== query.page) {
        set((state) => ({
          query: { ...state.query, page: correctedPage },
        }));
        const corrected = await getMaintenanceList(get().query);
        set({
          items: corrected.data,
          meta: corrected.meta,
          status: "ready",
          error: null,
        });
        return;
      }

      set({
        items: result.data,
        meta: result.meta,
        status: "ready",
        error: null,
      });
    } catch (error) {
      set({ status: "error", error: normalizeApiError(error) });
    }
  }

  async function fetchHistory(): Promise<void> {
    const { query, historyPage } = get();
    set({ historyStatus: "loading", historyError: null });
    try {
      const historyQuery: MaintenanceListQuery & { statusOverride: string } = {
        ...query,
        page: historyPage,
        pageSize: MAINTENANCE_HISTORY_PAGE_SIZE,
        statusOverride: "completed",
      };
      const result = await getMaintenanceList(historyQuery);
      const correctedPage = resolveFleetPageAfterFetch(
        historyPage,
        result.meta,
        result.data.length,
      );
      if (correctedPage != null && correctedPage !== historyPage) {
        set({ historyPage: correctedPage });
        const corrected = await getMaintenanceList({
          ...historyQuery,
          page: correctedPage,
        });
        set({
          history: corrected.data,
          historyMeta: corrected.meta,
          historyStatus: "ready",
          historyError: null,
        });
        return;
      }

      set({
        history: result.data,
        historyMeta: result.meta,
        historyStatus: "ready",
        historyError: null,
      });
    } catch (error) {
      set({
        historyStatus: "error",
        historyError: normalizeApiError(error),
      });
    }
  }

  async function fetchSummary(): Promise<void> {
    set({ summaryStatus: "loading", summaryError: null });
    try {
      const summary = await getMaintenanceSummary();
      set({ summary, summaryStatus: "ready", summaryError: null });
    } catch (error) {
      set({
        summaryStatus: "error",
        summaryError: normalizeApiError(error),
      });
    }
  }

  function runList(): Promise<void> {
    if (listInFlight) return listInFlight;
    listInFlight = fetchActiveList().finally(() => {
      listInFlight = null;
    });
    return listInFlight;
  }

  function runHistory(): Promise<void> {
    if (historyInFlight) return historyInFlight;
    historyInFlight = fetchHistory().finally(() => {
      historyInFlight = null;
    });
    return historyInFlight;
  }

  function runSummary(): Promise<void> {
    if (summaryInFlight) return summaryInFlight;
    summaryInFlight = fetchSummary().finally(() => {
      summaryInFlight = null;
    });
    return summaryInFlight;
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([runList(), runHistory(), runSummary()]);
  }

  return {
    items: [],
    meta: null,
    query: {
      ...DEFAULT_MAINTENANCE_FILTERS,
      page: 1,
      pageSize: MAINTENANCE_PAGE_SIZE,
    },
    status: "idle",
    error: null,
    history: [],
    historyMeta: null,
    historyPage: 1,
    historyStatus: "idle",
    historyError: null,
    summary: null,
    summaryStatus: "idle",
    summaryError: null,
    detail: null,
    detailId: null,
    detailStatus: "idle",
    detailError: null,
    isCreating: false,
    createError: null,
    isUpdating: false,
    updateError: null,
    mutatingId: null,
    mutatingAction: null,
    actionError: null,
    load() {
      const { status, historyStatus, summaryStatus } = get();
      const tasks: Promise<void>[] = [];
      if (status === "idle") tasks.push(runList());
      if (historyStatus === "idle") tasks.push(runHistory());
      if (summaryStatus === "idle") tasks.push(runSummary());
      if (status === "loading" && listInFlight) tasks.push(listInFlight);
      return Promise.all(tasks).then(() => undefined);
    },
    refresh() {
      return refreshAll();
    },
    setQuery(partial) {
      set((state) => ({
        query: {
          ...state.query,
          ...partial,
          page: partial.page ?? 1,
        },
        historyPage: 1,
        status: "idle",
        historyStatus: "idle",
      }));
      void refreshAll();
    },
    resetFilters() {
      set((state) => ({
        query: {
          ...state.query,
          ...DEFAULT_MAINTENANCE_FILTERS,
          page: 1,
        },
        historyPage: 1,
        status: "idle",
        historyStatus: "idle",
      }));
      void refreshAll();
    },
    setHistoryPage(page) {
      set({ historyPage: page, historyStatus: "idle" });
      void runHistory();
    },
    async fetchDetail(id) {
      if (detailInFlight) await detailInFlight;
      set({
        detailId: id,
        detailStatus: "loading",
        detailError: null,
      });
      detailInFlight = (async () => {
        try {
          const detail = await getMaintenance(id);
          set({
            detail,
            detailStatus: "ready",
            detailError: null,
          });
        } catch (error) {
          set({
            detail: null,
            detailStatus: "error",
            detailError: normalizeApiError(error),
          });
        }
      })().finally(() => {
        detailInFlight = null;
      });
      await detailInFlight;
    },
    clearDetail() {
      set({
        detail: null,
        detailId: null,
        detailStatus: "idle",
        detailError: null,
      });
    },
    clearCreateError() {
      set({ createError: null });
    },
    clearUpdateError() {
      set({ updateError: null });
    },
    clearActionError() {
      set({ actionError: null });
    },
    async createOrder(payload) {
      set({ isCreating: true, createError: null });
      try {
        await createMaintenanceRequest(payload);
        await refreshAll();
        set({ isCreating: false });
        return true;
      } catch (error) {
        set({ isCreating: false, createError: normalizeApiError(error) });
        return false;
      }
    },
    async updateOrder(id, payload) {
      set({ isUpdating: true, updateError: null });
      try {
        await updateMaintenanceRequest(id, payload);
        if (get().detailId === id) {
          await get().fetchDetail(id);
        }
        await refreshAll();
        set({ isUpdating: false });
        return true;
      } catch (error) {
        set({ isUpdating: false, updateError: normalizeApiError(error) });
        return false;
      }
    },
    async runLifecycle(id, action) {
      set({
        mutatingId: id,
        mutatingAction: action,
        actionError: null,
      });
      try {
        const request =
          action === "start"
            ? startMaintenanceRequest
            : action === "ready"
              ? markMaintenanceReadyRequest
              : action === "complete"
                ? completeMaintenanceRequest
                : cancelMaintenanceRequest;
        await request(id);
        if (get().detailId === id) {
          if (action === "complete" || action === "cancel") {
            get().clearDetail();
          } else {
            await get().fetchDetail(id);
          }
        }
        await refreshAll();
        set({ mutatingId: null, mutatingAction: null });
        return true;
      } catch (error) {
        set({
          mutatingId: null,
          mutatingAction: null,
          actionError: normalizeApiError(error),
        });
        return false;
      }
    },
  };
});
