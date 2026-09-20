"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { CompanyIdentity } from "@/shared/components/company-identity";
import { VehicleImage } from "@/modules/vehicles/components/vehicle-image/vehicle-image";
import { formatAed } from "@/modules/dashboard/utils/money";
import { useMaintenanceActions } from "../../hooks/use-maintenance";
import type { MaintenanceOrderDetailDto } from "../../types/maintenance.types";
import {
  canCancelMaintenance,
  canCompleteMaintenance,
  canEditMaintenance,
  canMarkReady,
  canStartMaintenance,
} from "../../utils/maintenance-status";
import { MaintenanceStatusChip } from "../maintenance-status-chip/maintenance-status-chip";
import styles from "./maintenance-card.module.css";

export interface MaintenanceCardProps {
  order: MaintenanceOrderDetailDto;
  canManage: boolean;
  onOpen: (order: MaintenanceOrderDetailDto) => void;
  onEdit: (order: MaintenanceOrderDetailDto) => void;
  onComplete: (order: MaintenanceOrderDetailDto) => void;
  onCancel: (order: MaintenanceOrderDetailDto) => void;
}

function stopOpen(event: MouseEvent | KeyboardEvent) {
  event.stopPropagation();
}

export function MaintenanceCard({
  order,
  canManage,
  onOpen,
  onEdit,
  onComplete,
  onCancel,
}: MaintenanceCardProps) {
  const t = useTranslations("Maintenance");
  const format = useFormatter();
  const { startMaintenance, markReadyForPickup, isMutating } =
    useMaintenanceActions();

  const plate = order.vehicle.plateNumber?.trim() || t("noPlate");
  const name = order.vehicle.displayName || t("vehicleUnknown");
  const started = order.startedAt ?? order.scheduledAt;
  const eta = order.expectedCompletionAt;

  return (
    <article
      className={styles.card}
      tabIndex={0}
      onClick={() => onOpen(order)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(order);
        }
      }}
      data-testid="maintenance-card"
    >
      <div className={styles.head}>
        <VehicleImage
          path={order.vehicle.primaryImageUrl}
          alt=""
          className={styles.photo}
        />
        <div className={styles.headBody}>
          <div className={styles.identityRow}>
            <h4 className={styles.name}>{name}</h4>
            {/* Company is read from the order's Vehicle projection — no lookup. */}
            <CompanyIdentity company={order.vehicle.company} compact />
          </div>
          <p className={styles.garage}>
            <span dir="ltr" className={styles.plate}>
              {plate}
            </span>
            {order.workshopName ? ` · ${order.workshopName}` : ""}
          </p>
          <div className={styles.chipRow}>
            <MaintenanceStatusChip status={order.status} overdue={order.overdue} />
          </div>
        </div>
        <span className={styles.id} dir="ltr">
          #{order.id}
        </span>
      </div>

      <p className={styles.type}>{t(`type.${order.maintenanceType}`)}</p>
      <p className={styles.issue}>{order.issueDescription}</p>

      <div className={styles.dates}>
        <span>
          {started
            ? t("card.started", {
                date: format.dateTime(new Date(started), {
                  dateStyle: "medium",
                }),
              })
            : t("card.notStarted")}
        </span>
        <span>
          {eta
            ? t("card.eta", {
                date: format.dateTime(new Date(eta), { dateStyle: "medium" }),
              })
            : t("card.etaUnknown")}
        </span>
      </div>

      {order.notes ? <p className={styles.notes}>{order.notes}</p> : null}

      <div className={styles.foot} onClick={stopOpen} onKeyDown={stopOpen}>
        <span className={styles.cost}>
          {order.cost != null ? formatAed(order.cost) : t("card.costPending")}
        </span>

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
          <Button
            type="button"
            size="sm"
            onClick={() => onComplete(order)}
          >
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

        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onOpen(order)}
        >
          {t("actions.details")}
        </Button>
      </div>
    </article>
  );
}
