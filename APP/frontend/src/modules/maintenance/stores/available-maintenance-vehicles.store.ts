"use client";

import { create } from "zustand";
import { getVehicles } from "@/modules/vehicles/api/vehicles.api";
import type { VehicleCardDto } from "@/modules/vehicles/types/vehicle.types";

const PICKER_PAGE_SIZE = 20;

export type AvailableVehiclesStatus = "idle" | "loading" | "ready" | "error";

interface AvailableMaintenanceVehiclesState {
  vehicles: VehicleCardDto[];
  search: string;
  status: AvailableVehiclesStatus;
  load: (search?: string) => Promise<void>;
  reset: () => void;
}

let inFlight: Promise<void> | null = null;

export const useAvailableMaintenanceVehiclesStore =
  create<AvailableMaintenanceVehiclesState>((set) => ({
    vehicles: [],
    search: "",
    status: "idle",
    async load(search = "") {
      const term = search.trim();
      set({ status: "loading", search: term });
      const run = (async () => {
        try {
          const result = await getVehicles({
            status: "available",
            search: term,
            page: 1,
            pageSize: PICKER_PAGE_SIZE,
            sort: "newest",
            vehicleType: null,
          });
          set({ vehicles: result.data, status: "ready" });
        } catch {
          set({ vehicles: [], status: "ready" });
        }
      })();
      inFlight = run.finally(() => {
        inFlight = null;
      });
      await inFlight;
    },
    reset() {
      set({ vehicles: [], search: "", status: "idle" });
    },
  }));
