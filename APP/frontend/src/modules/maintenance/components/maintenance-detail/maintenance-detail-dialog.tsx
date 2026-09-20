"use client";

import { useEffect } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { CompanyIdentity } from "@/shared/components/company-identity";
import { formatAed } from "@/modules/dashboard/utils/money";
import { useMaintenanceActions, useMaintenanceDetail } from "../../hooks/use-maintenance";
import type { MaintenanceOrderDetailDto } from "../../types/maintenance.types";
import {
  canCancelMaintenance,
  canCompleteMaintenance,
  canEditMaintenance,
  canMarkReady,
  canStartMaintenance,
} from "../../utils/maintenance-status";
import { resolveMaintenanceErrorMessage } from "../../utils/resolve-maintenance-error";
import { MaintenanceStatusChip } from "../maintenance-status-chip/maintenance-status-chip";
import styles from "./maintenance-detail-dialog.module.css";

export interface MaintenanceDetailDialogProps {
  orderId: number | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: (order: MaintenanceOrderDetailDto) => void;
  onComplete: (order: MaintenanceOrderDetailDto) => void;
  onCancel: (order: MaintenanceOrderDetailDto) => void;
}

function Kv({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className={styles.row}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function MaintenanceDetailDialog({
  orderId,
  canManage,
  onClose,
  onEdit,
  onComplete,
  onCancel,
}: MaintenanceDetailDialogProps) {
  const t = useTranslations("Maintenance");
  const tCompany = useTranslations("OperatingCompanies");
  const format = useFormatter();
  const { detail, isLoading, error, loadDetail, clearDetail } =
    useMaintenanceDetail();
  const { startMaintenance, markReadyForPickup, isMutating } =
    useMaintenanceActions();

  useEffect(() => {
    if (orderId != null) void loadDetail(orderId);
    else clearDetail();
  }, [orderId, loadDetail, clearDetail]);

  const errorMessage = resolveMaintenanceErrorMessage(t, error);
  const order = detail;
  const dt = (iso: string | null) =>
    iso
      ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" })
      : null;

  return (
    <Dialog
      open={orderId != null}
      onClose={onClose}
      closeLabel={t("form.close")}
      title={order ? t(`type.${order.maintenanceType}`) : t("detail.title")}
      description={
        order
          ? `${order.vehicle.displayName} · ${order.vehicle.plateNumber ?? t("noPlate")}`
          : undefined
      }
    >
      {isLoading ? <p className={styles.muted}>{t("detail.loading")}</p> : null}
      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}

      {order ? (
        <>
          <div className={styles.summ}>
            <div className={styles.row}>
              <span>{t("detail.id")}</span>
              <b className={styles.num} dir="ltr">
                #{order.id}
              </b>
            </div>
            <div className={styles.row}>
              <span>{t("detail.status")}</span>
              <b>
                <MaintenanceStatusChip
                  status={order.status}
                  overdue={order.overdue}
                />
              </b>
            </div>
            <Kv label={t("detail.vehicle")} value={order.vehicle.displayName} />
            <div className={styles.row}>
              <span>{tCompany("company")}</span>
              <b>
                <CompanyIdentity company={order.vehicle.company} compact />
              </b>
            </div>
            <div className={styles.row}>
              <span>{t("detail.plate")}</span>
              <b className={styles.num} dir="ltr">
                {order.vehicle.plateNumber || t("noPlate")}
              </b>
            </div>
            <Kv label={t("form.type")} value={t(`type.${order.maintenanceType}`)} />
            <Kv label={t("form.issue")} value={order.issueDescription} />
            <Kv label={t("form.workshop")} value={order.workshopName} />
            <Kv
              label={t("form.odometer")}
              value={
                order.odometerIn != null
                  ? t("history.km", { value: format.number(order.odometerIn) })
                  : null
              }
            />
            <Kv label={t("detail.scheduledAt")} value={dt(order.scheduledAt)} />
            <Kv label={t("detail.startedAt")} value={dt(order.startedAt)} />
            <Kv label={t("detail.readyAt")} value={dt(order.readyAt)} />
            <Kv label={t("detail.completedAt")} value={dt(order.completedAt)} />
            <Kv
              label={t("detail.expectedAt")}
              value={dt(order.expectedCompletionAt)}
            />
            <Kv label={t("form.notes")} value={order.notes} />
            <div className={`${styles.row} ${styles.tot}`}>
              <span>{t("form.cost")}</span>
              <b className={styles.num}>
                {order.cost != null ? formatAed(order.cost) : t("card.costPending")}
              </b>
            </div>
          </div>

          <div className={styles.actions}>
            {canManage && canStartMaintenance(order.status) ? (
              <Button
                type="button"
                size="sm"
                loading={isMutating(order.id, "start")}
                onClick={() => void startMaintenance(order.id)}
              >
                {t("actions.start")}
              </Button>
            ) : null}
            {canManage && canMarkReady(order.status) ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={isMutating(order.id, "ready")}
                onClick={() => void markReadyForPickup(order.id)}
              >
                {t("actions.ready")}
              </Button>
            ) : null}
            {canManage && canCompleteMaintenance(order.status) ? (
              <Button type="button" size="sm" onClick={() => onComplete(order)}>
                {t("actions.complete")}
              </Button>
            ) : null}
            {canManage && canEditMaintenance(order.status) ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onEdit(order)}
              >
                {t("actions.edit")}
              </Button>
            ) : null}
            {canManage && canCancelMaintenance(order.status) ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onCancel(order)}
              >
                {t("actions.cancel")}
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="ghost" onClick={onClose}>
              {t("form.close")}
            </Button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
