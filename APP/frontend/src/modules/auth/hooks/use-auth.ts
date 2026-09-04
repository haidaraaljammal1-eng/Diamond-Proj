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
  const loadCurrentUser = async () => undefined;
  const logout = async () => {
    await signOut({ redirect: false });
    router.refresh();
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
