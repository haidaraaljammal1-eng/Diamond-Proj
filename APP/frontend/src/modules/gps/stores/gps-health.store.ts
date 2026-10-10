"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { getGpsVehicleHealth } from "../api/gps.api";
import type { GpsVehicleHealthDto } from "../types/gps.types";
import type { GpsLoadStatus } from "./gps.store";

interface GpsHealthState {
  health: GpsVehicleHealthDto | null;
  status: GpsLoadStatus;
  error: ApiRequestError | null;
  load: (vehicleId: number) => Promise<void>;
  reset: () => void;
}

let requestId = 0;

export const useGpsHealthStore = create<GpsHealthState>((set) => ({
  health: null,
  status: "idle",
  error: null,

  async load(vehicleId) {
    const current = ++requestId;
    set({ status: "loading", error: null });
    try {
      const health = await getGpsVehicleHealth(vehicleId);
      if (current !== requestId) return;
      set({ health, status: "ready", error: null });
    } catch (error) {
      if (current !== requestId) return;
      set({ health: null, status: "error", error: normalizeApiError(error) });
    }
  },

  reset() {
    requestId += 1;
    set({ health: null, status: "idle", error: null });
  },
}));
