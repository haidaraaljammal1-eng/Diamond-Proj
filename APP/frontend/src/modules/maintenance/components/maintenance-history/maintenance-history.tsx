"use client";

import type { KeyboardEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Icon } from "@/shared/components/ui/icon";
import { CompanyIdentity } from "@/shared/components/company-identity";
import { formatAed } from "@/modules/dashboard/utils/money";
import type { MaintenanceOrderDetailDto } from "../../types/maintenance.types";
import { MaintenanceStatusChip } from "../maintenance-status-chip/maintenance-status-chip";
import styles from "./maintenance-history.module.css";

export interface MaintenanceHistoryProps {
  items: MaintenanceOrderDetailDto[];
  total: number;
  onOpen: (order: MaintenanceOrderDetailDto) => void;
}

export function MaintenanceHistory({
  items,
  total,
  onOpen,
}: MaintenanceHistoryProps) {
  const t = useTranslations("Maintenance");
  const format = useFormatter();

  function handleKey(event: KeyboardEvent, order: MaintenanceOrderDetailDto) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(order);
    }
  }

  return (
    <section className={styles.card} data-testid="maintenance-history">
      <div className={styles.head}>
        <h3 className={styles.title}>
          <Icon name="mdi:file-document-outline" size={16} />
          {t("history.title")}
        </h3>
        <span className={styles.count}>{total}</span>
      </div>
      <div className={styles.wrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t("history.id")}</th>
              <th scope="col">{t("history.vehicle")}</th>
              <th scope="col">{t("history.type")}</th>
              <th scope="col">{t("history.workshop")}</th>
              <th scope="col">{t("history.odometer")}</th>
              <th scope="col">{t("history.cost")}</th>
              <th scope="col">{t("history.status")}</th>
              <th scope="col">{t("history.completed")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((order) => (
              <tr
                key={order.id}
                tabIndex={0}
                onClick={() => onOpen(order)}
                onKeyDown={(event) => handleKey(event, order)}
              >
                <td>
                  <span className={styles.number} dir="ltr">
                    #{order.id}
                  </span>
                </td>
                <td>
                  {order.vehicle.displayName || t("vehicleUnknown")}
                  <div className={styles.muted} dir="ltr">
                    {order.vehicle.plateNumber || t("noPlate")}
                  </div>
                  <div className={styles.companyCell}>
                    <CompanyIdentity company={order.vehicle.company} compact />
                  </div>
                </td>
                <td>{t(`type.${order.maintenanceType}`)}</td>
                <td className={styles.mutedCell}>
                  {order.workshopName || "—"}
                </td>
                <td className={styles.num}>
                  {order.odometerIn != null
                    ? t("history.km", { value: format.number(order.odometerIn) })
                    : "—"}
                </td>
                <td className={styles.amount}>
                  {order.cost != null ? formatAed(order.cost) : "—"}
                </td>
                <td>
                  <MaintenanceStatusChip status={order.status} />
                </td>
                <td className={styles.mutedCell}>
                  {order.completedAt
                    ? format.dateTime(new Date(order.completedAt), {
                        dateStyle: "medium",
                      })
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
