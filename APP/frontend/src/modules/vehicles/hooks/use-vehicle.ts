"use client";

import { useCallback, useMemo } from "react";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { useVehiclesStore } from "../stores/vehicles.store";
import type { VehicleDetailDto } from "../types/vehicle.types";

export interface UseVehicleResult {
  detail: VehicleDetailDto | null;
  isLoading: boolean;
  isReady: boolean;
  error: ApiRequestError | null;
  loadVehicle: (id: number) => Promise<void>;
  clearVehicle: () => void;
}

export function useVehicle(): UseVehicleResult {
  const detail = useVehiclesStore((state) => state.detail);
  const detailStatus = useVehiclesStore((state) => state.detailStatus);
  const detailError = useVehiclesStore((state) => state.detailError);
  const fetchVehicle = useVehiclesStore((state) => state.fetchVehicle);
  const clearDetail = useVehiclesStore((state) => state.clearDetail);

  const loadVehicle = useCallback(
    (id: number) => fetchVehicle(id),
    [fetchVehicle],
  );

  return useMemo(
    () => ({
      detail,
      isLoading: detailStatus === "loading",
      isReady: detailStatus === "ready",
      error: detailStatus === "error" ? detailError : null,
      loadVehicle,
      clearVehicle: clearDetail,
    }),
    [detail, detailStatus, detailError, loadVehicle, clearDetail],
  );
}
