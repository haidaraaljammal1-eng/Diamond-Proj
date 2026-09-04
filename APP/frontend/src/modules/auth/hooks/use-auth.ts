"use client";

import { useAuthStore } from "../stores/auth.store";

export function useAuth() {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isLoggingOut = useAuthStore((state) => state.isLoggingOut);
  const error = useAuthStore((state) => state.error);
  const loadCurrentUser = useAuthStore((state) => state.loadCurrentUser);
  const logout = useAuthStore((state) => state.logout);
  const clearError = useAuthStore((state) => state.clearError);

  return {
    user,
    isLoading,
    isLoggingOut,
    error,
    loadCurrentUser,
    logout,
    clearError,
  };
}
