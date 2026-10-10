"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { getGpsVehicleHistory } from "../api/gps.api";
import type {
  GpsHistoryRange,
  GpsVehicleHistoryDto,
} from "../types/gps.types";
import type { GpsLoadStatus } from "./gps.store";

interface GpsHistoryState {
  history: GpsVehicleHistoryDto | null;
  status: GpsLoadStatus;
  error: ApiRequestError | null;
  vehicleId: number | null;
  range: GpsHistoryRange | null;
  fetchHistory: (vehicleId: number, range: GpsHistoryRange) => Promise<void>;
  reset: () => void;
}

let activeController: AbortController | null = null;
let requestId = 0;

export const useGpsHistoryStore = create<GpsHistoryState>((set) => ({
  history: null,
  status: "idle",
  error: null,
  vehicleId: null,
  range: null,

  async fetchHistory(vehicleId, range) {
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const currentRequestId = ++requestId;
    set({
      status: "loading",
      error: null,
      history: null,
      vehicleId,
      range,
    });

    try {
      const history = await getGpsVehicleHistory(vehicleId, range, controller.signal);
      if (controller.signal.aborted || currentRequestId !== requestId) return;
      set({ history, status: "ready", error: null });
    } catch (error) {
      if (controller.signal.aborted || currentRequestId !== requestId) return;
      set({
        history: null,
        status: "error",
        error: normalizeApiError(error),
      });
    } finally {
      if (activeController === controller) activeController = null;
    }
  },

  reset() {
    requestId += 1;
    activeController?.abort();
    activeController = null;
    set({
      history: null,
      status: "idle",
      error: null,
      vehicleId: null,
      range: null,
    });
  },
}));
