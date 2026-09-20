"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { refreshAfterPending } from "@/infrastructure/state/refresh-after-pending";
import {
  createVehicle as createVehicleRequest,
  deactivateVehicle as deactivateVehicleRequest,
  deleteVehiclePhoto as deleteVehiclePhotoRequest,
  getVehicle,
  getVehicles,
  updateVehicleRates as updateVehicleRatesRequest,
  uploadVehiclePhoto,
} from "../api/vehicles.api";
import type { PageMeta } from "../api/vehicles.api.types";
import { VEHICLES_PAGE_SIZE } from "../api/vehicles.api.types";
import type {
  CreateVehiclePayload,
  UpdateVehicleRatesPayload,
  VehicleCardDto,
  VehicleDetailDto,
  VehicleFiltersState,
} from "../types/vehicle.types";
import { DEFAULT_VEHICLE_FILTERS } from "../utils/vehicle-filters";
import { resolveFleetPageAfterFetch } from "../utils/vehicles-pagination";
import { useFleetTypeLookupStore } from "./fleet-type-lookup.store";

export type VehiclesLoadStatus = "idle" | "loading" | "ready" | "error";
export type VehicleDetailLoadStatus = "idle" | "loading" | "ready" | "error";

export type CreateVehicleResult =
  | { ok: true; photoUploadFailed?: boolean }
  | { ok: false };

export type ReplaceVehiclePhotoResult =
  | { ok: true; deleteFailed?: boolean }
  | { ok: false; stage: "upload" };

export type UploadVehiclePhotoResult =
  | { ok: true }
  | { ok: false };

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
  isPhotoActionPending: boolean;
  photoActionError: ApiRequestError | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  setQuery: (partial: Partial<VehiclesQuery>) => void;
  resetFilters: () => void;
  fetchVehicle: (id: number) => Promise<void>;
  clearDetail: () => void;
  createVehicle: (
    payload: CreateVehiclePayload,
    photo?: File,
  ) => Promise<CreateVehicleResult>;
  clearCreateError: () => void;
  updateVehicleRates: (
    id: number,
    payload: UpdateVehicleRatesPayload,
  ) => Promise<boolean>;
  clearUpdateRatesError: () => void;
  deactivateVehicle: (id: number) => Promise<boolean>;
  clearDeactivateError: () => void;
  uploadVehiclePhotoForVehicle: (
    vehicleId: number,
    file: File,
  ) => Promise<UploadVehiclePhotoResult>;
  replaceVehiclePhotoForVehicle: (
    vehicleId: number,
    oldPhotoId: string,
    file: File,
  ) => Promise<ReplaceVehiclePhotoResult>;
  clearPhotoActionError: () => void;
}

let listInFlight: Promise<void> | null = null;
let detailInFlight: Promise<void> | null = null;

export const useVehiclesStore = create<VehiclesState>((set, get) => {
  async function fetchVehicles(): Promise<void> {
    const { query } = get();
    set({ status: "loading", error: null });
    try {
      const result = await getVehicles(query);
      const correctedPage = resolveFleetPageAfterFetch(
        query.page,
        result.meta,
        result.data.length,
      );

      if (correctedPage != null && correctedPage !== query.page) {
        set((state) => ({
          query: { ...state.query, page: correctedPage },
        }));
        const corrected = await getVehicles(get().query);
        set({
          vehicles: corrected.data,
          meta: corrected.meta,
          status: "ready",
          error: null,
        });
        return;
      }

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

  function refreshList(): Promise<void> {
    return refreshAfterPending(() => listInFlight, runList);
  }

  function refreshFleetTypeOptions(): Promise<void> {
    return useFleetTypeLookupStore.getState().refresh();
  }

  return {
    vehicles: [],
    meta: null,
    query: {
      ...DEFAULT_VEHICLE_FILTERS,
      page: 1,
      pageSize: VEHICLES_PAGE_SIZE,
    },
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
    isPhotoActionPending: false,
    photoActionError: null,
    load() {
      const status = get().status;
      if (status === "ready" || status === "loading") {
        return listInFlight ?? Promise.resolve();
      }
      return runList();
    },
    refresh() {
      return refreshList();
    },
    setQuery(partial) {
      set((state) => ({
        query: { ...state.query, ...partial },
        status: "idle",
      }));
      void refreshList();
    },
    resetFilters() {
      set((state) => ({
        query: { ...state.query, ...DEFAULT_VEHICLE_FILTERS, page: 1 },
        status: "idle",
      }));
      void refreshList();
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
    async createVehicle(payload, photo) {
      set({ isCreating: true, createError: null });
      try {
        const created = await createVehicleRequest(payload);
        let photoUploadFailed = false;
        if (photo) {
          try {
            await uploadVehiclePhoto(created.id, photo);
          } catch {
            photoUploadFailed = true;
          }
        }
        await Promise.all([refreshList(), refreshFleetTypeOptions()]);
        set({ isCreating: false });
        return photoUploadFailed
          ? { ok: true, photoUploadFailed: true }
          : { ok: true };
      } catch (error) {
        set({ isCreating: false, createError: normalizeApiError(error) });
        return { ok: false };
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
        await refreshList();
        set({ isUpdatingRates: false });
        return true;
      } catch (error) {
        set({
          isUpdatingRates: false,
          updateRatesError: normalizeApiError(error),
        });
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
        await refreshList();
        await refreshFleetTypeOptions();
        set({ isDeactivating: false });
        return true;
      } catch (error) {
        set({
          isDeactivating: false,
          deactivateError: normalizeApiError(error),
        });
        return false;
      }
    },
    clearDeactivateError() {
      set({ deactivateError: null });
    },
    clearPhotoActionError() {
      set({ photoActionError: null });
    },
    async uploadVehiclePhotoForVehicle(vehicleId, file) {
      set({ isPhotoActionPending: true, photoActionError: null });
      try {
        await uploadVehiclePhoto(vehicleId, file);
        await get().fetchVehicle(vehicleId);
        await refreshList();
        set({ isPhotoActionPending: false });
        return { ok: true };
      } catch (error) {
        set({
          isPhotoActionPending: false,
          photoActionError: normalizeApiError(error),
        });
        return { ok: false };
      }
    },
    async replaceVehiclePhotoForVehicle(vehicleId, oldPhotoId, file) {
      set({ isPhotoActionPending: true, photoActionError: null });
      try {
        await uploadVehiclePhoto(vehicleId, file);
      } catch (error) {
        set({
          isPhotoActionPending: false,
          photoActionError: normalizeApiError(error),
        });
        return { ok: false, stage: "upload" };
      }

      try {
        await deleteVehiclePhotoRequest(vehicleId, oldPhotoId);
      } catch (error) {
        await get().fetchVehicle(vehicleId);
        await refreshList();
        set({
          isPhotoActionPending: false,
          photoActionError: normalizeApiError(error),
        });
        return { ok: true, deleteFailed: true };
      }

      await get().fetchVehicle(vehicleId);
      await refreshList();
      set({ isPhotoActionPending: false });
      return { ok: true };
    },
  };
});
