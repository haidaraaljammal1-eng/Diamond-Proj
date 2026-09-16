"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import {
  getGpsMapPoints,
  getGpsSummary,
  getGpsVehicle,
  getGpsVehicles,
} from "../api/gps.api";
import type {
  GpsListQuery,
  GpsMapPointDto,
  GpsPageMeta,
  GpsSummaryDto,
  GpsVehicleDetailDto,
  GpsVehicleListItemDto,
} from "../types/gps.types";
import { GPS_PAGE_SIZE } from "../types/gps.types";

export type GpsLoadStatus = "idle" | "loading" | "ready" | "error";

interface GpsState {
  summary: GpsSummaryDto | null;
  summaryStatus: GpsLoadStatus;
  summaryError: ApiRequestError | null;
  vehicles: GpsVehicleListItemDto[];
  meta: GpsPageMeta | null;
  query: GpsListQuery;
  listStatus: GpsLoadStatus;
  listError: ApiRequestError | null;
  mapPoints: GpsMapPointDto[];
  mapStatus: GpsLoadStatus;
  mapError: ApiRequestError | null;
  selectedVehicleId: number | null;
  selectedVehicleDetail: GpsVehicleDetailDto | null;
  detailStatus: GpsLoadStatus;
  detailError: ApiRequestError | null;
  detailOpen: boolean;
  mapFocusToken: number;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  setQuery: (partial: Partial<GpsListQuery>) => void;
  resetFilters: () => void;
  selectVehicle: (vehicleId: number, options?: { openDetail?: boolean }) => void;
  clearSelection: () => void;
  closeDetail: () => void;
}

const DEFAULT_QUERY: GpsListQuery = {
  search: "",
  status: "all",
  trackingStatus: "all",
  page: 1,
  pageSize: GPS_PAGE_SIZE,
};

let listInFlight: Promise<void> | null = null;
let summaryInFlight: Promise<void> | null = null;
let mapInFlight: Promise<void> | null = null;
let detailInFlight: Promise<void> | null = null;
let detailRequestId = 0;

async function loadSummary(set: (partial: Partial<GpsState>) => void) {
  const run = (async () => {
    set({ summaryStatus: "loading", summaryError: null });
    try {
      const summary = await getGpsSummary();
      set({ summary, summaryStatus: "ready", summaryError: null });
    } catch (error) {
      set({
        summaryStatus: "error",
        summaryError: normalizeApiError(error),
      });
    }
  })();
  summaryInFlight = run;
  await run;
  if (summaryInFlight === run) summaryInFlight = null;
}

async function loadList(
  get: () => GpsState,
  set: (partial: Partial<GpsState>) => void,
) {
  const run = (async () => {
    set({ listStatus: "loading", listError: null });
    try {
      const result = await getGpsVehicles(get().query);
      set({
        vehicles: result.data,
        meta: result.meta,
        listStatus: "ready",
        listError: null,
      });
    } catch (error) {
      set({
        listStatus: "error",
        listError: normalizeApiError(error),
      });
    }
  })();
  listInFlight = run;
  await run;
  if (listInFlight === run) listInFlight = null;
}

async function loadMap(set: (partial: Partial<GpsState>) => void) {
  const run = (async () => {
    set({ mapStatus: "loading", mapError: null });
    try {
      const mapPoints = await getGpsMapPoints();
      set({ mapPoints, mapStatus: "ready", mapError: null });
    } catch (error) {
      set({
        mapStatus: "error",
        mapError: normalizeApiError(error),
      });
    }
  })();
  mapInFlight = run;
  await run;
  if (mapInFlight === run) mapInFlight = null;
}

async function loadDetail(
  vehicleId: number,
  set: (partial: Partial<GpsState>) => void,
) {
  const requestId = ++detailRequestId;
  const run = (async () => {
    set({ detailStatus: "loading", detailError: null });
    try {
      const detail = await getGpsVehicle(vehicleId);
      if (requestId !== detailRequestId) return;
      set({
        selectedVehicleDetail: detail,
        detailStatus: "ready",
        detailError: null,
      });
    } catch (error) {
      if (requestId !== detailRequestId) return;
      set({
        detailStatus: "error",
        detailError: normalizeApiError(error),
        selectedVehicleDetail: null,
      });
    }
  })();
  detailInFlight = run;
  await run;
  if (detailInFlight === run) detailInFlight = null;
}

export const useGpsStore = create<GpsState>((set, get) => ({
  summary: null,
  summaryStatus: "idle",
  summaryError: null,
  vehicles: [],
  meta: null,
  query: DEFAULT_QUERY,
  listStatus: "idle",
  listError: null,
  mapPoints: [],
  mapStatus: "idle",
  mapError: null,
  selectedVehicleId: null,
  selectedVehicleDetail: null,
  detailStatus: "idle",
  detailError: null,
  detailOpen: false,
  mapFocusToken: 0,

  async load() {
    await Promise.allSettled([loadSummary(set), loadList(get, set), loadMap(set)]);
  },

  async refresh() {
    const selectedId = get().selectedVehicleId;
    const detailOpen = get().detailOpen;
    await Promise.allSettled([loadSummary(set), loadList(get, set), loadMap(set)]);
    if (selectedId != null && detailOpen) {
      await loadDetail(selectedId, set);
    }
  },

  setQuery(partial) {
    set({ query: { ...get().query, ...partial } });
    void loadList(get, set);
  },

  resetFilters() {
    set({ query: DEFAULT_QUERY });
    void loadList(get, set);
  },

  selectVehicle(vehicleId, options) {
    const openDetail = options?.openDetail ?? true;
    const sameVehicle = get().selectedVehicleId === vehicleId;
    set({
      selectedVehicleId: vehicleId,
      selectedVehicleDetail: sameVehicle ? get().selectedVehicleDetail : null,
      detailStatus: openDetail ? "loading" : get().detailStatus,
      detailError: sameVehicle ? get().detailError : null,
      detailOpen: openDetail,
      mapFocusToken: get().mapFocusToken + 1,
    });
    if (openDetail) void loadDetail(vehicleId, set);
  },

  clearSelection() {
    detailRequestId += 1;
    set({
      selectedVehicleId: null,
      selectedVehicleDetail: null,
      detailStatus: "idle",
      detailError: null,
      detailOpen: false,
    });
  },

  closeDetail() {
    set({ detailOpen: false });
  },
}));
