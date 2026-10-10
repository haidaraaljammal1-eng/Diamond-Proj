"use client";

import { useMemo } from "react";
import { useGpsReportsStore } from "../stores/gps-reports.store";

export function useGpsReports() {
  const mileage = useGpsReportsStore((state) => state.mileage);
  const mileageStatus = useGpsReportsStore((state) => state.mileageStatus);
  const mileageError = useGpsReportsStore((state) => state.mileageError);
  const overspeed = useGpsReportsStore((state) => state.overspeed);
  const overspeedStatus = useGpsReportsStore((state) => state.overspeedStatus);
  const overspeedError = useGpsReportsStore((state) => state.overspeedError);
  const loadMileage = useGpsReportsStore((state) => state.loadMileage);
  const loadOverspeed = useGpsReportsStore((state) => state.loadOverspeed);
  const reset = useGpsReportsStore((state) => state.reset);

  return useMemo(
    () => ({
      mileage,
      mileageError: mileageStatus === "error" ? mileageError : null,
      mileageLoading: mileageStatus === "loading",
      overspeed,
      overspeedError: overspeedStatus === "error" ? overspeedError : null,
      overspeedLoading: overspeedStatus === "loading",
      loadMileage,
      loadOverspeed,
      reset,
    }),
    [
      loadMileage,
      loadOverspeed,
      mileage,
      mileageError,
      mileageStatus,
      overspeed,
      overspeedError,
      overspeedStatus,
      reset,
    ],
  );
}
