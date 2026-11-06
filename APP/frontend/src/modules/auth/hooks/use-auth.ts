"use client";

import { useLocale } from "next-intl";
import { forceStaffLogout } from "@/infrastructure/auth/force-staff-logout";
import { useAuthStore } from "../stores/auth.store";
import { useSession } from "next-auth/react";

export function useAuth() {
  const locale = useLocale();
  const { data: session, status } = useSession();
  const user = session?.user ?? null;
  /** NextAuth `update()` sets `status` to loading while keeping `session.user`; do not block the shell. */
  const isLoading = status === "loading" && user == null;
  const isLoggingOut = useAuthStore((state) => state.isLoggingOut);
  const error = useAuthStore((state) => state.error);
  const setLoggingOut = useAuthStore((state) => state.setLoggingOut);
  const loadCurrentUser = async () => undefined;
  const logout = async () => {
    setLoggingOut(true);
    try {
      await forceStaffLogout(locale === "en" ? "en" : "ar");
    } catch {
      setLoggingOut(false);
    }
  };
  const clearError = useAuthStore((state) => state.clearError);

  return {
    user,
    status,
    isAuthenticated: status === "authenticated" || (status === "loading" && user != null),
    isLoading,
    isLoggingOut,
    error,
    loadCurrentUser,
    logout,
    clearError,
  };
}
