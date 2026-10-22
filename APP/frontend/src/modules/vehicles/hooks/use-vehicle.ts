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
  isVideoActionPending: boolean;
  videoActionError: ApiRequestError | null;
  loadVehicle: (id: number) => Promise<void>;
  clearVehicle: () => void;
  uploadVehiclePhoto: (vehicleId: number, file: File) => Promise<UploadVehiclePhotoResult>;
  replaceVehiclePhoto: (
    vehicleId: number,
    oldPhotoId: string,
    file: File,
  ) => Promise<ReplaceVehiclePhotoResult>;
  deleteVehiclePhoto: (vehicleId: number, photoId: string) => Promise<boolean>;
  clearPhotoActionError: () => void;
  uploadVehicleVideo: (vehicleId: number, file: File) => Promise<boolean>;
  deleteVehicleVideo: (vehicleId: number) => Promise<boolean>;
  clearVideoActionError: () => void;
}

export function useVehicle(): UseVehicleResult {
  const detail = useVehiclesStore((state) => state.detail);
  const detailStatus = useVehiclesStore((state) => state.detailStatus);
  const detailError = useVehiclesStore((state) => state.detailError);
  const isPhotoActionPending = useVehiclesStore((state) => state.isPhotoActionPending);
  const photoActionError = useVehiclesStore((state) => state.photoActionError);
  const isVideoActionPending = useVehiclesStore((state) => state.isVideoActionPending);
  const videoActionError = useVehiclesStore((state) => state.videoActionError);
  const fetchVehicle = useVehiclesStore((state) => state.fetchVehicle);
  const clearDetail = useVehiclesStore((state) => state.clearDetail);
  const uploadVehiclePhotoForVehicle = useVehiclesStore(
    (state) => state.uploadVehiclePhotoForVehicle,
  );
  const replaceVehiclePhotoForVehicle = useVehiclesStore(
    (state) => state.replaceVehiclePhotoForVehicle,
  );
  const deleteVehiclePhotoForVehicle = useVehiclesStore(
    (state) => state.deleteVehiclePhotoForVehicle,
  );
  const clearPhotoActionError = useVehiclesStore((state) => state.clearPhotoActionError);
  const uploadVehicleVideoForVehicle = useVehiclesStore(
    (state) => state.uploadVehicleVideoForVehicle,
  );
  const deleteVehicleVideoForVehicle = useVehiclesStore(
    (state) => state.deleteVehicleVideoForVehicle,
  );
  const clearVideoActionError = useVehiclesStore((state) => state.clearVideoActionError);

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

  const deleteVehiclePhoto = useCallback(
    (vehicleId: number, photoId: string) => deleteVehiclePhotoForVehicle(vehicleId, photoId),
    [deleteVehiclePhotoForVehicle],
  );

  const uploadVehicleVideo = useCallback(
    (vehicleId: number, file: File) => uploadVehicleVideoForVehicle(vehicleId, file),
    [uploadVehicleVideoForVehicle],
  );

  const deleteVehicleVideo = useCallback(
    (vehicleId: number) => deleteVehicleVideoForVehicle(vehicleId),
    [deleteVehicleVideoForVehicle],
  );

  return useMemo(
    () => ({
      detail,
      isLoading: detailStatus === "loading",
      isReady: detailStatus === "ready",
      error: detailStatus === "error" ? detailError : null,
      isPhotoActionPending,
      photoActionError,
      isVideoActionPending,
      videoActionError,
      loadVehicle,
      clearVehicle: clearDetail,
      uploadVehiclePhoto,
      replaceVehiclePhoto,
      deleteVehiclePhoto,
      clearPhotoActionError,
      uploadVehicleVideo,
      deleteVehicleVideo,
      clearVideoActionError,
    }),
    [
      detail,
      detailStatus,
      detailError,
      isPhotoActionPending,
      photoActionError,
      isVideoActionPending,
      videoActionError,
      loadVehicle,
      clearDetail,
      uploadVehiclePhoto,
      replaceVehiclePhoto,
      deleteVehiclePhoto,
      clearPhotoActionError,
      uploadVehicleVideo,
      deleteVehicleVideo,
      clearVideoActionError,
    ],
  );
}
