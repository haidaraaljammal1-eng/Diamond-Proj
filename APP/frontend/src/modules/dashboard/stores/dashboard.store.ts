"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { getDashboardOverview } from "../api/dashboard.api";
import type { DashboardOverviewDto } from "../types/dashboard.types";

export type DashboardLoadStatus = "idle" | "loading" | "ready" | "error";

interface DashboardState {
  overview: DashboardOverviewDto | null;
  status: DashboardLoadStatus;
  error: ApiRequestError | null;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
}

let inFlight: Promise<void> | null = null;

export const useDashboardStore = create<DashboardState>((set, get) => ({
  overview: null,
  status: "idle",
  error: null,

  async load() {
    if (inFlight) {
      await inFlight;
      return;
    }
    const run = (async () => {
      set({ status: "loading", error: null });
      try {
        const overview = await getDashboardOverview();
        set({ overview, status: "ready", error: null });
      } catch (error) {
        set({
          status: "error",
          error: normalizeApiError(error),
        });
      }
    })();
    inFlight = run;
    await run;
    if (inFlight === run) inFlight = null;
  },

  async refresh() {
    if (get().status === "loading") {
      await inFlight;
      return;
    }
    await get().load();
  },
}));
