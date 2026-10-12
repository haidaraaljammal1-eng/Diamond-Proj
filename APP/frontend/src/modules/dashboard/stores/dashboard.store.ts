"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { getDashboardOverview } from "../api/dashboard.api";
import type { DashboardOverviewDto } from "../types/dashboard.types";
import { isLatestDashboardRequest } from "../utils/dashboard-company-scope";

export type DashboardLoadStatus = "idle" | "loading" | "ready" | "error";

interface DashboardState {
  /** `null` is All Companies. Dashboard has no GENERAL scope. */
  companyId: number | null;
  overview: DashboardOverviewDto | null;
  status: DashboardLoadStatus;
  error: ApiRequestError | null;
  setCompanyId: (companyId: number | null) => void;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
}

let requestSeq = 0;

export const useDashboardStore = create<DashboardState>((set, get) => ({
  companyId: null,
  overview: null,
  status: "idle",
  error: null,

  setCompanyId(companyId) {
    if (get().companyId === companyId) return;
    // Drop the previous scope immediately so a slower response cannot paint stale KPIs.
    set({ companyId, overview: null, status: "loading", error: null });
  },

  async load() {
    const requestId = ++requestSeq;
    const companyId = get().companyId;
    set({ status: "loading", error: null });
    try {
      const overview = await getDashboardOverview(companyId);
      if (!isLatestDashboardRequest(requestId, requestSeq)) return;
      if (get().companyId !== companyId) return;
      set({ overview, status: "ready", error: null });
    } catch (error) {
      if (!isLatestDashboardRequest(requestId, requestSeq)) return;
      if (get().companyId !== companyId) return;
      set({
        status: "error",
        error: normalizeApiError(error),
      });
    }
  },

  async refresh() {
    await get().load();
  },
}));
