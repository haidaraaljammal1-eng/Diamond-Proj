"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import {
  getGpsVehicleMileageSummary,
  getGpsVehicleOverspeed,
} from "../api/gps.api";
import type { GpsMileageSummaryDto, GpsOverspeedDto } from "../types/gps.types";
import type { GpsLoadStatus } from "./gps.store";

interface GpsReportsState {
  mileage: GpsMileageSummaryDto | null;
  mileageStatus: GpsLoadStatus;
  mileageError: ApiRequestError | null;
  overspeed: GpsOverspeedDto | null;
  overspeedStatus: GpsLoadStatus;
  overspeedError: ApiRequestError | null;
  loadMileage: (vehicleId: number) => Promise<void>;
  loadOverspeed: (vehicleId: number, date: string, thresholdKph: number) => Promise<void>;
  reset: () => void;
}

let requestId = 0;

export const useGpsReportsStore = create<GpsReportsState>((set) => ({
  mileage: null,
  mileageStatus: "idle",
  mileageError: null,
  overspeed: null,
  overspeedStatus: "idle",
  overspeedError: null,

  async loadMileage(vehicleId) {
    const current = ++requestId;
    set({ mileageStatus: "loading", mileageError: null });
    try {
      const mileage = await getGpsVehicleMileageSummary(vehicleId);
      if (current !== requestId) return;
      set({ mileage, mileageStatus: "ready", mileageError: null });
    } catch (error) {
      if (current !== requestId) return;
      set({ mileage: null, mileageStatus: "error", mileageError: normalizeApiError(error) });
    }
  },

  async loadOverspeed(vehicleId, date, thresholdKph) {
    const current = ++requestId;
    set({ overspeedStatus: "loading", overspeedError: null });
    try {
      const overspeed = await getGpsVehicleOverspeed(vehicleId, date, thresholdKph);
      if (current !== requestId) return;
      set({ overspeed, overspeedStatus: "ready", overspeedError: null });
    } catch (error) {
      if (current !== requestId) return;
      set({ overspeed: null, overspeedStatus: "error", overspeedError: normalizeApiError(error) });
    }
  },

  reset() {
    requestId += 1;
    set({
      mileage: null,
      mileageStatus: "idle",
      mileageError: null,
      overspeed: null,
      overspeedStatus: "idle",
      overspeedError: null,
    });
  },
}));
