"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { refreshAfterPending } from "@/infrastructure/state/refresh-after-pending";
import { getFleetVehicleTypeOptions } from "../api/fleet-type-lookup.api";
import type { FleetVehicleTypeOption } from "../api/fleet-type-lookup.api";

export type FleetTypeLookupStatus = "idle" | "loading" | "ready" | "error";

interface FleetTypeLookupState {
  types: FleetVehicleTypeOption[];
  status: FleetTypeLookupStatus;
  error: ApiRequestError | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
}

let loadInFlight: Promise<void> | null = null;

export const useFleetTypeLookupStore = create<FleetTypeLookupState>((set, get) => {
  async function fetchTypes(): Promise<void> {
    set({ status: "loading", error: null });
    try {
      const types = await getFleetVehicleTypeOptions();
      set({ types, status: "ready", error: null });
    } catch (error) {
      set({ status: "error", error: normalizeApiError(error) });
    }
  }

  function runLoad(): Promise<void> {
    if (loadInFlight) return loadInFlight;
    loadInFlight = fetchTypes().finally(() => {
      loadInFlight = null;
    });
    return loadInFlight;
  }

  return {
    types: [],
    status: "idle",
    error: null,
    load() {
      const status = get().status;
      if (status === "ready" || status === "loading") {
        return loadInFlight ?? Promise.resolve();
      }
      return runLoad();
    },
    refresh() {
      return refreshAfterPending(() => loadInFlight, runLoad);
    },
  };
});
