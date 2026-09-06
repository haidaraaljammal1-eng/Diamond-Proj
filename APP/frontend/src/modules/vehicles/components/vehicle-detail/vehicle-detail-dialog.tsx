"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { useVehicle } from "../../hooks/use-vehicle";
import type { VehicleCardDto } from "../../types/vehicle.types";
import { VehicleDetail } from "./vehicle-detail";
import styles from "./vehicle-detail-dialog.module.css";

export interface VehicleDetailDialogProps {
  vehicle: VehicleCardDto | null;
  onClose: () => void;
  onSetPrice: (vehicle: VehicleCardDto) => void;
  onPrimaryAction: (vehicle: VehicleCardDto) => void;
  onGps: (vehicle: VehicleCardDto) => void;
  onMaintenance: () => void;
}

export function VehicleDetailDialog({
  vehicle,
  onClose,
  onSetPrice,
  onPrimaryAction,
  onGps,
  onMaintenance,
}: VehicleDetailDialogProps) {
  const t = useTranslations("Vehicles");
  const { detail, isLoading, isReady, error, loadVehicle, clearVehicle } = useVehicle();

  useEffect(() => {
    if (!vehicle) {
      clearVehicle();
      return;
    }
    void loadVehicle(vehicle.id);
  }, [vehicle, loadVehicle, clearVehicle]);

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
