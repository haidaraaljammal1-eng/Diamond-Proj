"use client";

import { useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { useVehicle } from "../../hooks/use-vehicle";
import { resolveVehiclesErrorMessage } from "../../utils/resolve-vehicles-error";
import type { VehicleCardDto } from "../../types/vehicle.types";
import { VehicleDetail } from "./vehicle-detail";
import styles from "./vehicle-detail-dialog.module.css";

export interface VehicleDetailDialogProps {
  vehicle: VehicleCardDto | null;
  canManage: boolean;
  onClose: () => void;
  onSetPrice: (vehicle: VehicleCardDto) => void;
  onPrimaryAction: (vehicle: VehicleCardDto) => void;
  onGps: (vehicle: VehicleCardDto) => void;
  onMaintenance: () => void;
  onPhotoNotice?: (message: string) => void;
}

export function VehicleDetailDialog({
  vehicle,
  canManage,
  onClose,
  onSetPrice,
  onPrimaryAction,
  onGps,
  onMaintenance,
  onPhotoNotice,
}: VehicleDetailDialogProps) {
  const t = useTranslations("Vehicles");
  const {
    detail,
    isLoading,
    isReady,
    error,
    isPhotoActionPending,
    photoActionError,
    loadVehicle,
    clearVehicle,
    uploadVehiclePhoto,
    replaceVehiclePhoto,
    clearPhotoActionError,
  } = useVehicle();

  useEffect(() => {
    if (!vehicle) {
      clearVehicle();
      return;
    }
    clearPhotoActionError();
    void loadVehicle(vehicle.id);
  }, [vehicle, loadVehicle, clearVehicle, clearPhotoActionError]);

  const photoActionErrorMessage = resolveVehiclesErrorMessage(t, photoActionError);

  const handleUploadPhoto = useCallback(
    async (file: File) => {
      if (!detail) return;
      const result = await uploadVehiclePhoto(detail.id, file);
      if (result.ok) {
        onPhotoNotice?.(t("detail.photoUploadSuccess"));
      }
    },
    [detail, uploadVehiclePhoto, onPhotoNotice, t],
  );

  const handleReplacePhoto = useCallback(
    async (file: File) => {
      if (!detail?.primaryImage) return;
      const result = await replaceVehiclePhoto(
        detail.id,
        detail.primaryImage.id,
        file,
      );
      if (!result.ok) return;
      if (result.deleteFailed) {
        onPhotoNotice?.(t("detail.photoReplaceDeleteFailed"));
        return;
      }
      onPhotoNotice?.(t("detail.photoReplaceSuccess"));
    },
    [detail, replaceVehiclePhoto, onPhotoNotice, t],
  );

  const open = vehicle != null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={vehicle?.displayName ?? t("title")}
      closeLabel={t("detail.close")}
      presentation="flush"
    >
      {isLoading ? (
        <div className={styles.loading} role="status">{t("detail.loading")}</div>
      ) : null}
      {error ? (
        <div className={styles.error} role="alert">
          <p>{t("detail.error")}</p>
          <Button type="button" size="sm" onClick={onClose}>{t("detail.close")}</Button>
        </div>
      ) : null}
      {isReady && detail ? (
        <VehicleDetail
          vehicle={detail}
          canManage={canManage}
          isPhotoActionPending={isPhotoActionPending}
          photoActionErrorMessage={photoActionErrorMessage}
          onUploadPhoto={(file) => void handleUploadPhoto(file)}
          onReplacePhoto={(file) => void handleReplacePhoto(file)}
          onSetPrice={() => {
            onClose();
            onSetPrice(detail);
          }}
          onPrimaryAction={() => {
            onClose();
            onPrimaryAction(detail);
          }}
          onGps={() => {
            onClose();
            onGps(detail);
          }}
          onMaintenance={() => {
            onClose();
            onMaintenance();
          }}
        />
      ) : null}
    </Dialog>
  );
}
