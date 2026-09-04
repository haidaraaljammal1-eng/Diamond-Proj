"use client";

import { create } from "zustand";
import { authApi } from "../api/auth.api";
import type { AuthUser } from "@/infrastructure/auth/auth.types";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isLoggingOut: boolean;
  error: ApiRequestError | null;
  loadCurrentUser: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  isLoggingOut: false,
  error: null,
  async loadCurrentUser() {
    set({ isLoading: true, error: null });
    try {
      const response = await authApi.me();
      set({ user: response.data, isLoading: false });
    } catch (error) {
      set({ error: normalizeApiError(error), isLoading: false });
    }
  },
  async logout() {
    set({ isLoggingOut: true, error: null });
    try {
      await authApi.logout();
      set({ user: null, isLoggingOut: false });
    } catch (error) {
      set({ error: normalizeApiError(error), isLoggingOut: false });
    }
  },
  clearError() {
    set({ error: null });
  },
}));
