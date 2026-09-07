"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { createVehicle as createVehicleRequest, deactivateVehicle as deactivateVehicleRequest, getVehicle, getVehicles, updateVehicleRates as updateVehicleRatesRequest } from "../api/vehicles.api";
import type { PageMeta } from "../api/vehicles.api.types";
import { VEHICLES_MAX_PAGE_SIZE } from "../api/vehicles.api.types";
import type {
  CreateVehiclePayload,
  UpdateVehicleRatesPayload,
  VehicleCardDto,
  VehicleDetailDto,
  VehicleFiltersState,
} from "../types/vehicle.types";
import { DEFAULT_VEHICLE_FILTERS } from "../utils/vehicle-filters";
import { useFleetTypeLookupStore } from "./fleet-type-lookup.store";

export type VehiclesLoadStatus = "idle" | "loading" | "ready" | "error";
export type VehicleDetailLoadStatus = "idle" | "loading" | "ready" | "error";

export interface VehiclesQuery extends VehicleFiltersState {
  page: number;
  pageSize: number;
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
  isCreating: boolean;
  createError: ApiRequestError | null;
  isUpdatingRates: boolean;
  updateRatesError: ApiRequestError | null;
  isDeactivating: boolean;
  deactivateError: ApiRequestError | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  setQuery: (partial: Partial<VehiclesQuery>) => void;
  resetFilters: () => void;
  fetchVehicle: (id: number) => Promise<void>;
  clearDetail: () => void;
  createVehicle: (payload: CreateVehiclePayload) => Promise<boolean>;
  clearCreateError: () => void;
  updateVehicleRates: (id: number, payload: UpdateVehicleRatesPayload) => Promise<boolean>;
  clearUpdateRatesError: () => void;
  deactivateVehicle: (id: number) => Promise<boolean>;
  clearDeactivateError: () => void;
}

let listInFlight: Promise<void> | null = null;
let detailInFlight: Promise<void> | null = null;

export const useVehiclesStore = create<VehiclesState>((set, get) => {
  async function fetchVehicles(): Promise<void> {
    const { query } = get();
    set({ status: "loading", error: null });
    try {
      const result = await getVehicles(query);
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

  function refreshFleetTypeOptions(): Promise<void> {
    return useFleetTypeLookupStore.getState().refresh();
  }

  return {
    vehicles: [],
    meta: null,
    query: { ...DEFAULT_VEHICLE_FILTERS, page: 1, pageSize: VEHICLES_MAX_PAGE_SIZE },
    status: "idle",
    error: null,
    detail: null,
    detailVehicleId: null,
    detailStatus: "idle",
    detailError: null,
    isCreating: false,
    createError: null,
    isUpdatingRates: false,
    updateRatesError: null,
    isDeactivating: false,
    deactivateError: null,
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
    resetFilters() {
      set((state) => ({
        query: { ...state.query, ...DEFAULT_VEHICLE_FILTERS, page: 1 },
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
    clearCreateError() {
      set({ createError: null });
    },
    async createVehicle(payload) {
      set({ isCreating: true, createError: null });
      try {
        await createVehicleRequest(payload);
        await Promise.all([runList(), refreshFleetTypeOptions()]);
        set({ isCreating: false });
        return true;
      } catch (error) {
        set({ isCreating: false, createError: normalizeApiError(error) });
        return false;
      }
    },
    async updateVehicleRates(id, payload) {
      set({ isUpdatingRates: true, updateRatesError: null });
      try {
        await updateVehicleRatesRequest(id, payload);
        const { detailVehicleId } = get();
        if (detailVehicleId === id) {
          await get().fetchVehicle(id);
        }
        await runList();
        set({ isUpdatingRates: false });
        return true;
      } catch (error) {
        set({ isUpdatingRates: false, updateRatesError: normalizeApiError(error) });
        return false;
      }
    },
    clearUpdateRatesError() {
      set({ updateRatesError: null });
    },
    async deactivateVehicle(id) {
      set({ isDeactivating: true, deactivateError: null });
      try {
        await deactivateVehicleRequest(id);
        const { detailVehicleId } = get();
        if (detailVehicleId === id) {
          get().clearDetail();
        }
        await runList();
        await refreshFleetTypeOptions();
        set({ isDeactivating: false });
        return true;
      } catch (error) {
        set({ isDeactivating: false, deactivateError: normalizeApiError(error) });
        return false;
      }
    },
    clearDeactivateError() {
      set({ deactivateError: null });
    },
  };
});
