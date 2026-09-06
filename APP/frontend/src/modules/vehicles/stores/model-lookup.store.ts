"use client";

import { create } from "zustand";
import {
  lookupVehicleModels,
  type VehicleModelLookupItem,
} from "../api/model-lookup.api";

type ModelLookupStatus = "idle" | "loading" | "ready";

interface ModelLookupState {
  models: VehicleModelLookupItem[];
  status: ModelLookupStatus;
  load: () => Promise<void>;
}

let inFlight: Promise<void> | null = null;

export const useModelLookupStore = create<ModelLookupState>((set, get) => ({
  models: [],
  status: "idle",
  load() {
    const status = get().status;
    if (status === "ready" || status === "loading") {
      return inFlight ?? Promise.resolve();
    }

    if (!inFlight) {
      set({ status: "loading" });
      inFlight = lookupVehicleModels()
        .then((models) => {
          set({ models, status: "ready" });
        })
        .catch(() => {
          // A failed lookup must not break the page: the picker stays empty and
          // the remaining filters keep working.
          set({ models: [], status: "ready" });
        })
        .finally(() => {
          inFlight = null;
        });
    }

    return inFlight;
  },
}));
