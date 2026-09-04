"use client";

import type { LoginPayload } from "../api/auth.api";
import { signIn, useSession } from "next-auth/react";
import { useState } from "react";

export function useLogin() {
  const { status } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async (payload: LoginPayload) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await signIn("credentials", {
        ...payload,
        redirect: false,
      });
      const succeeded = Boolean(result?.ok && !result.error);
      if (!succeeded) setError("UNAUTHORIZED");
      return succeeded;
    } catch {
      setError("NETWORK_ERROR");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    error,
    status,
    isLoggedIn: status === "authenticated",
    login,
    clearError: () => setError(null),
  };
}
