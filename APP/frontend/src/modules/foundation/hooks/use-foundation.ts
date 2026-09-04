"use client";

import { useFoundationStore } from "../stores/foundation.store";

export function useFoundation() {
  const backendHealth = useFoundationStore((state) => state.backendHealth);
  const isLoading = useFoundationStore((state) => state.isLoading);
  const error = useFoundationStore((state) => state.error);
  const checkBackend = useFoundationStore((state) => state.checkBackend);

  return { backendHealth, isLoading, error, checkBackend };
}
