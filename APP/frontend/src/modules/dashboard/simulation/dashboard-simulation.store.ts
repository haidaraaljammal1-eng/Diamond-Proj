"use client";

import { create } from "zustand";
import { isDemoSimulationEnabled } from "@/modules/demo-simulation/simulation.enabled";
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
    if (!isDemoSimulationEnabled()) return;
    set({ active: true, overview: buildDashboardSimulationFixture() });
  },

  reset() {
    if (!isDemoSimulationEnabled() || !get().active) return;
    set({ overview: buildDashboardSimulationFixture() });
  },

  disable() {
    set({ active: false, overview: null });
  },
}));
