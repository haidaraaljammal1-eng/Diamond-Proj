"use client";

import { useMemo } from "react";
import { useGpsHistoryStore } from "../stores/gps-history.store";
import type { GpsHistoryRange } from "../types/gps.types";

export function useGpsHistory() {
  const history = useGpsHistoryStore((state) => state.history);
  const status = useGpsHistoryStore((state) => state.status);
  const error = useGpsHistoryStore((state) => state.error);
  const fetchHistory = useGpsHistoryStore((state) => state.fetchHistory);
  const reset = useGpsHistoryStore((state) => state.reset);

  return useMemo(
    () => ({
      history,
      error: status === "error" ? error : null,
      isLoading: status === "loading",
      isReady: status === "ready",
      fetchHistory: (vehicleId: number, range: GpsHistoryRange) =>
        fetchHistory(vehicleId, range),
      reset,
    }),
    [error, fetchHistory, history, reset, status],
  );
}
