"use client";

import { useGpsHealthStore } from "../stores/gps-health.store";

export function useGpsHealth() {
  const health = useGpsHealthStore((state) => state.health);
  const status = useGpsHealthStore((state) => state.status);
  const error = useGpsHealthStore((state) => state.error);
  const load = useGpsHealthStore((state) => state.load);
  const reset = useGpsHealthStore((state) => state.reset);

  return {
    health,
    loading: status === "loading",
    error,
    load,
    reset,
  };
}
