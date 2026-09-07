"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { useVehicles } from "../../hooks/use-vehicles";
import type { VehicleCardDto } from "../../types/vehicle.types";
import { resolveVehiclesErrorMessage } from "../../utils/resolve-vehicles-error";
import styles from "./vehicle-deactivate-dialog.module.css";

export interface VehicleDeactivateDialogProps {
  vehicle: VehicleCardDto | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function VehicleDeactivateDialog({
  vehicle,
  onClose,
  onSuccess,
}: VehicleDeactivateDialogProps) {
  const t = useTranslations("Vehicles");
  const {
    deactivateVehicle,
    isDeactivating,
    deactivateError,
    clearDeactivateError,
  } = useVehicles();

  useEffect(() => {
    if (vehicle) clearDeactivateError();
  }, [vehicle, clearDeactivateError]);

  const errorMessage = resolveVehiclesErrorMessage(t, deactivateError);

  const handleConfirm = async () => {
    if (!vehicle) return;
    const succeeded = await deactivateVehicle(vehicle.id);
    if (succeeded) {
      onSuccess?.();
      onClose();
    }
  };

  return (
    <Dialog
      open={vehicle !== null}
      onClose={onClose}
      closeLabel={t("form.close")}
      title={t("deactivate.title")}
      description={
        vehicle
          ? t("deactivate.description", { name: vehicle.displayName })
          : t("deactivate.descriptionGeneric")
      }
    >
      {errorMessage ? (
        <p className={styles.error} role="alert">{errorMessage}</p>
      ) : null}

      <div className={styles.buttons}>
        <Button
          type="button"
          variant="ghost"
          size="md"
          className={styles.confirmDelete}
          loading={isDeactivating}
          onClick={() => void handleConfirm()}
        >
          {t("deactivate.confirm")}
        </Button>
        <Button type="button" variant="ghost" size="md" onClick={onClose}>
          {t("form.cancel")}
        </Button>
      </div>
    </Dialog>
  );
}
