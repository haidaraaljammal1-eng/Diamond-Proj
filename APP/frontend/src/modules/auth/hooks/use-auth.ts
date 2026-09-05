"use client";

import { useAuthStore } from "../stores/auth.store";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export function useAuth() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const user = session?.user ?? null;
  const isLoading = status === "loading";
  const isLoggingOut = useAuthStore((state) => state.isLoggingOut);
  const error = useAuthStore((state) => state.error);
  const setLoggingOut = useAuthStore((state) => state.setLoggingOut);
  const loadCurrentUser = async () => undefined;
  const logout = async () => {
    setLoggingOut(true);
    try {
      await signOut({ redirect: false });
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  };
  const clearError = useAuthStore((state) => state.clearError);

  return {
    user,
    status,
    isAuthenticated: status === "authenticated",
    isLoading,
    isLoggingOut,
    error,
    loadCurrentUser,
    logout,
    clearError,
  };
}
