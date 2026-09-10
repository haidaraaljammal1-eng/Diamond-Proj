"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { useMaintenanceActions } from "../../hooks/use-maintenance";
import type { MaintenanceOrderDetailDto } from "../../types/maintenance.types";
import { resolveMaintenanceErrorMessage } from "../../utils/resolve-maintenance-error";
import styles from "./lifecycle-confirm-dialog.module.css";

export interface CompleteMaintenanceDialogProps {
  order: MaintenanceOrderDetailDto | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CompleteMaintenanceDialog({
  order,
  onClose,
  onSuccess,
}: CompleteMaintenanceDialogProps) {
  const t = useTranslations("Maintenance");
  const {
    completeMaintenance,
    isMutating,
    actionError,
    clearActionError,
  } = useMaintenanceActions();

  useEffect(() => {
    if (order) clearActionError();
  }, [order, clearActionError]);

  const errorMessage = resolveMaintenanceErrorMessage(t, actionError);
  const loading = order ? isMutating(order.id, "complete") : false;
  const plate = order?.vehicle.plateNumber ?? "";

  const handleConfirm = async () => {
    if (!order) return;
    const ok = await completeMaintenance(order.id);
    if (ok) {
      onSuccess?.();
      onClose();
    }
  };

  return (
    <Dialog
      open={order !== null}
      onClose={onClose}
      closeLabel={t("form.close")}
      title={t("complete.title")}
      description={
        order
          ? t("complete.description", {
              name: order.vehicle.displayName,
              plate,
            })
          : t("complete.descriptionGeneric")
      }
    >
      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}
      <div className={styles.buttons}>
        <Button
          type="button"
          size="md"
          loading={loading}
          onClick={() => void handleConfirm()}
        >
          {t("complete.confirm")}
        </Button>
        <Button type="button" variant="ghost" size="md" onClick={onClose}>
          {t("form.cancel")}
        </Button>
      </div>
    </Dialog>
  );
}

export interface CancelMaintenanceDialogProps {
  order: MaintenanceOrderDetailDto | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function CancelMaintenanceDialog({
  order,
  onClose,
  onSuccess,
}: CancelMaintenanceDialogProps) {
  const t = useTranslations("Maintenance");
  const {
    cancelMaintenance,
    isMutating,
    actionError,
    clearActionError,
  } = useMaintenanceActions();

  useEffect(() => {
    if (order) clearActionError();
  }, [order, clearActionError]);

  const errorMessage = resolveMaintenanceErrorMessage(t, actionError);
  const loading = order ? isMutating(order.id, "cancel") : false;

  const handleConfirm = async () => {
    if (!order) return;
    const ok = await cancelMaintenance(order.id);
    if (ok) {
      onSuccess?.();
      onClose();
    }
  };

  return (
    <Dialog
      open={order !== null}
      onClose={onClose}
      closeLabel={t("form.close")}
      title={t("cancel.title")}
      description={
        order
          ? t("cancel.description", { name: order.vehicle.displayName })
          : t("cancel.descriptionGeneric")
      }
    >
      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}
      <div className={styles.buttons}>
        <Button
          type="button"
          variant="ghost"
          size="md"
          className={styles.danger}
          loading={loading}
          onClick={() => void handleConfirm()}
        >
          {t("cancel.confirm")}
        </Button>
        <Button type="button" variant="ghost" size="md" onClick={onClose}>
          {t("form.cancel")}
        </Button>
      </div>
    </Dialog>
  );
}
