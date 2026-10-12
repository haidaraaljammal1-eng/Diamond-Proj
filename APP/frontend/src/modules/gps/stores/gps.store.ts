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
import type { GpsRealtimeEvent } from "../realtime/gps-realtime-client";

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
  focusedMapVehicleId: number | null;
  mapFocusToken: number;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  setQuery: (partial: Partial<GpsListQuery>) => void;
  resetFilters: () => void;
  selectVehicle: (vehicleId: number, options?: { openDetail?: boolean }) => void;
  focusMapVehicle: (vehicleId: number) => void;
  clearMapFocus: () => void;
  clearSelection: () => void;
  closeDetail: () => void;
  applyRealtimeEvent: (event: GpsRealtimeEvent) => void;
}

const DEFAULT_QUERY: GpsListQuery = {
  search: "",
  status: "all",
  trackingStatus: "all",
  companyId: null,
  providerKey: "all",
  page: 1,
  pageSize: GPS_PAGE_SIZE,
};

let summaryInFlight: Promise<void> | null = null;
let detailInFlight: Promise<void> | null = null;
let refreshInFlight: Promise<void> | null = null;
let detailRequestId = 0;
let listRequestId = 0;
let mapRequestId = 0;

async function loadSummary(set: (partial: Partial<GpsState>) => void) {
  if (summaryInFlight) return summaryInFlight;
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
  try {
    await run;
  } finally {
    if (summaryInFlight === run) summaryInFlight = null;
  }
}

async function loadList(
  get: () => GpsState,
  set: (partial: Partial<GpsState>) => void,
) {
  const requestId = ++listRequestId;
  const query = get().query;
  const run = (async () => {
    set({ listStatus: "loading", listError: null });
    try {
      const result = await getGpsVehicles(query);
      if (requestId !== listRequestId) return;
      set({
        vehicles: result.data,
        meta: result.meta,
        listStatus: "ready",
        listError: null,
      });
    } catch (error) {
      if (requestId !== listRequestId) return;
      set({
        listStatus: "error",
        listError: normalizeApiError(error),
      });
    }
  })();
  await run;
}

async function loadMap(
  get: () => GpsState,
  set: (partial: Partial<GpsState>) => void,
) {
  const requestId = ++mapRequestId;
  const query = get().query;
  const run = (async () => {
    set({ mapStatus: "loading", mapError: null });
    try {
      const mapPoints = await getGpsMapPoints({
        companyId: query.companyId,
        providerKey: query.providerKey,
        trackingStatus: query.trackingStatus,
      });
      if (requestId !== mapRequestId) return;
      set({ mapPoints, mapStatus: "ready", mapError: null });
    } catch (error) {
      if (requestId !== mapRequestId) return;
      set({
        mapStatus: "error",
        mapError: normalizeApiError(error),
      });
    }
  })();
  await run;
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
  focusedMapVehicleId: null,
  mapFocusToken: 0,

  async load() {
    await Promise.allSettled([loadSummary(set), loadList(get, set), loadMap(get, set)]);
  },

  async refresh() {
    if (refreshInFlight) return refreshInFlight;
    const selectedId = get().selectedVehicleId;
    const detailOpen = get().detailOpen;
    const run = (async () => {
      await Promise.allSettled([loadSummary(set), loadList(get, set), loadMap(get, set)]);
      if (selectedId != null && detailOpen) {
        await loadDetail(selectedId, set);
      }
    })();
    refreshInFlight = run;
    try {
      await run;
    } finally {
      if (refreshInFlight === run) refreshInFlight = null;
    }
  },

  setQuery(partial) {
    set({
      query: { ...get().query, ...partial },
      vehicles: [],
      meta: null,
      mapPoints: [],
      focusedMapVehicleId: null,
      listStatus: "loading",
      mapStatus: "loading",
    });
    void Promise.all([loadList(get, set), loadMap(get, set)]);
  },

  resetFilters() {
    set({
      query: DEFAULT_QUERY,
      vehicles: [],
      meta: null,
      mapPoints: [],
      focusedMapVehicleId: null,
      listStatus: "loading",
      mapStatus: "loading",
    });
    void Promise.all([loadList(get, set), loadMap(get, set)]);
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
    });
    if (openDetail) void loadDetail(vehicleId, set);
  },

  focusMapVehicle(vehicleId) {
    set({
      focusedMapVehicleId: vehicleId,
      mapFocusToken: get().mapFocusToken + 1,
    });
  },

  clearMapFocus() {
    set({ focusedMapVehicleId: null });
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

  applyRealtimeEvent(event) {
    set((state) => {
      if (
        state.query.providerKey !== "all" &&
        state.query.providerKey !== event.providerKey
      ) {
        return state;
      }
      const vehicle = state.vehicles.find((item) => item.vehicle.id === event.vehicleId);
      if (!vehicle) return state;
      if (
        vehicle.gps.capturedAt &&
        new Date(event.capturedAt).getTime() <= new Date(vehicle.gps.capturedAt).getTime()
      ) {
        return state;
      }
      const motionState: GpsVehicleListItemDto["gps"]["motionState"] =
        event.motionState === "MOVING"
          ? "moving"
          : event.motionState === "PARKED"
            ? "parked"
            : "unknown";
      const trackingStatus: GpsVehicleListItemDto["gps"]["trackingStatus"] =
        motionState === "moving" || motionState === "parked" ? motionState : "online";
      const updated = {
        ...vehicle,
        gps: {
          ...vehicle.gps,
          trackingStatus,
          latitude: event.latitude,
          longitude: event.longitude,
          speedKph: event.speedKph,
          headingDegrees: event.headingDegrees,
          ignitionOn: event.ignitionOn,
          capturedAt: event.capturedAt,
          receivedAt: new Date().toISOString(),
          motionState,
        },
      };
      return {
        vehicles: state.vehicles.map((item) =>
          item.vehicle.id === event.vehicleId ? updated : item,
        ),
        mapPoints: state.mapPoints.map((point) =>
          point.vehicleId === event.vehicleId
            ? {
                ...point,
                trackingStatus,
                latitude: event.latitude,
                longitude: event.longitude,
                speedKph: event.speedKph,
                headingDegrees: event.headingDegrees,
                capturedAt: event.capturedAt,
              }
            : point,
        ),
      };
    });
  },
}));
