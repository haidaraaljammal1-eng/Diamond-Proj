"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { getBackendHealth } from "../api/foundation.api";
import type { BackendHealth } from "../api/foundation.api";

interface FoundationState {
  backendHealth: BackendHealth | null;
  isLoading: boolean;
  error: ApiRequestError | null;
  checkBackend: () => Promise<void>;
}

export const useFoundationStore = create<FoundationState>((set) => ({
  backendHealth: null,
  isLoading: false,
  error: null,
  async checkBackend() {
    set({ isLoading: true, error: null });
    try {
      const response = await getBackendHealth();
      set({ backendHealth: response.data, isLoading: false });
    } catch (error) {
      set({ error: normalizeApiError(error), isLoading: false });
    }
  },
}));
