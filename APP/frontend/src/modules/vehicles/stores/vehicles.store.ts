"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { getVehicle, getVehicles } from "../api/vehicles.api";
import type { PageMeta } from "../api/vehicles.api.types";
import { VEHICLES_MAX_PAGE_SIZE } from "../api/vehicles.api.types";
import type {
  VehicleCardDto,
  VehicleDetailDto,
  VehicleStatusFilter,
} from "../types/vehicle.types";

export type VehiclesLoadStatus = "idle" | "loading" | "ready" | "error";
export type VehicleDetailLoadStatus = "idle" | "loading" | "ready" | "error";

export interface VehiclesQuery {
  page: number;
  pageSize: number;
  status: VehicleStatusFilter;
}

interface VehiclesState {
  vehicles: VehicleCardDto[];
  meta: PageMeta | null;
  query: VehiclesQuery;
  status: VehiclesLoadStatus;
  error: ApiRequestError | null;
  detail: VehicleDetailDto | null;
  detailVehicleId: number | null;
  detailStatus: VehicleDetailLoadStatus;
  detailError: ApiRequestError | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  setQuery: (partial: Partial<VehiclesQuery>) => void;
  fetchVehicle: (id: number) => Promise<void>;
  clearDetail: () => void;
}

let listInFlight: Promise<void> | null = null;
let detailInFlight: Promise<void> | null = null;

export const useVehiclesStore = create<VehiclesState>((set, get) => {
  async function fetchVehicles(): Promise<void> {
    const { query } = get();
    set({ status: "loading", error: null });
    try {
      const result = await getVehicles({
        page: query.page,
        pageSize: query.pageSize,
        status: query.status,
      });
      set({
        vehicles: result.data,
        meta: result.meta,
        status: "ready",
        error: null,
      });
    } catch (error) {
      set({ status: "error", error: normalizeApiError(error) });
    }
  }

  function runList(): Promise<void> {
    if (listInFlight) return listInFlight;
    listInFlight = fetchVehicles().finally(() => {
      listInFlight = null;
    });
    return listInFlight;
  }

  return {
    vehicles: [],
    meta: null,
    query: { page: 1, pageSize: VEHICLES_MAX_PAGE_SIZE, status: "all" },
    status: "idle",
    error: null,
    detail: null,
    detailVehicleId: null,
    detailStatus: "idle",
    detailError: null,
    load() {
      const status = get().status;
      if (status === "ready" || status === "loading") {
        return listInFlight ?? Promise.resolve();
      }
      return runList();
    },
    refresh() {
      return runList();
    },
    setQuery(partial) {
      set((state) => ({
        query: { ...state.query, ...partial },
        status: "idle",
      }));
      void runList();
    },
    async fetchVehicle(id) {
      if (detailInFlight) await detailInFlight;
      set({
        detailVehicleId: id,
        detailStatus: "loading",
        detailError: null,
      });
      detailInFlight = (async () => {
        try {
          const detail = await getVehicle(id);
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
        detailVehicleId: null,
        detailStatus: "idle",
        detailError: null,
      });
    },
  };
});
