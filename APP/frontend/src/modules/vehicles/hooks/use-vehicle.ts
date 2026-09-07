"use client";

import { useCallback, useMemo } from "react";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import {
  useVehiclesStore,
  type ReplaceVehiclePhotoResult,
  type UploadVehiclePhotoResult,
} from "../stores/vehicles.store";
import type { VehicleDetailDto } from "../types/vehicle.types";

export interface UseVehicleResult {
  detail: VehicleDetailDto | null;
  isLoading: boolean;
  isReady: boolean;
  error: ApiRequestError | null;
  isPhotoActionPending: boolean;
  photoActionError: ApiRequestError | null;
  loadVehicle: (id: number) => Promise<void>;
  clearVehicle: () => void;
  uploadVehiclePhoto: (vehicleId: number, file: File) => Promise<UploadVehiclePhotoResult>;
  replaceVehiclePhoto: (
    vehicleId: number,
    oldPhotoId: string,
    file: File,
  ) => Promise<ReplaceVehiclePhotoResult>;
  clearPhotoActionError: () => void;
}

export function useVehicle(): UseVehicleResult {
  const detail = useVehiclesStore((state) => state.detail);
  const detailStatus = useVehiclesStore((state) => state.detailStatus);
  const detailError = useVehiclesStore((state) => state.detailError);
  const isPhotoActionPending = useVehiclesStore((state) => state.isPhotoActionPending);
  const photoActionError = useVehiclesStore((state) => state.photoActionError);
  const fetchVehicle = useVehiclesStore((state) => state.fetchVehicle);
  const clearDetail = useVehiclesStore((state) => state.clearDetail);
  const uploadVehiclePhotoForVehicle = useVehiclesStore(
    (state) => state.uploadVehiclePhotoForVehicle,
  );
  const replaceVehiclePhotoForVehicle = useVehiclesStore(
    (state) => state.replaceVehiclePhotoForVehicle,
  );
  const clearPhotoActionError = useVehiclesStore((state) => state.clearPhotoActionError);

  const loadVehicle = useCallback(
    (id: number) => fetchVehicle(id),
    [fetchVehicle],
  );

  const uploadVehiclePhoto = useCallback(
    (vehicleId: number, file: File) => uploadVehiclePhotoForVehicle(vehicleId, file),
    [uploadVehiclePhotoForVehicle],
  );

  const replaceVehiclePhoto = useCallback(
    (vehicleId: number, oldPhotoId: string, file: File) =>
      replaceVehiclePhotoForVehicle(vehicleId, oldPhotoId, file),
    [replaceVehiclePhotoForVehicle],
  );

  return useMemo(
    () => ({
      detail,
      isLoading: detailStatus === "loading",
      isReady: detailStatus === "ready",
      error: detailStatus === "error" ? detailError : null,
      isPhotoActionPending,
      photoActionError,
      loadVehicle,
      clearVehicle: clearDetail,
      uploadVehiclePhoto,
      replaceVehiclePhoto,
      clearPhotoActionError,
    }),
    [
      detail,
      detailStatus,
      detailError,
      isPhotoActionPending,
      photoActionError,
      loadVehicle,
      clearDetail,
      uploadVehiclePhoto,
      replaceVehiclePhoto,
      clearPhotoActionError,
    ],
  );
}
