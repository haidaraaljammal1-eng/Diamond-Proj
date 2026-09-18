"use client";

import { create } from "zustand";
import { isUiDemoSimulationEnabled } from "@/modules/demo-simulation/simulation.enabled";
import { buildDashboardSimulationFixture } from "./dashboard-simulation.fixture";
import type { DashboardOverviewDto } from "../types/dashboard.types";

interface DashboardSimulationState {
  active: boolean;
  overview: DashboardOverviewDto | null;
  activate: () => void;
  reset: () => void;
  disable: () => void;
}

export const useDashboardSimulationStore = create<DashboardSimulationState>((set, get) => ({
  active: false,
  overview: null,

  activate() {
    if (!isUiDemoSimulationEnabled("dashboard")) return;
    set({ active: true, overview: buildDashboardSimulationFixture() });
  },

  reset() {
    if (!isUiDemoSimulationEnabled("dashboard") || !get().active) return;
    set({ overview: buildDashboardSimulationFixture() });
  },

  disable() {
    set({ active: false, overview: null });
  },
}));
