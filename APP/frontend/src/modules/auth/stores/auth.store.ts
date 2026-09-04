"use client";

import { create } from "zustand";
import type { ApiRequestError } from "@/infrastructure/api/errors";

interface AuthState {
  isLoggingOut: boolean;
  error: ApiRequestError | null;
  setLoggingOut: (value: boolean) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isLoggingOut: false,
  error: null,
  setLoggingOut(value) {
    set({ isLoggingOut: value });
  },
  clearError() {
    set({ error: null });
  },
}));
