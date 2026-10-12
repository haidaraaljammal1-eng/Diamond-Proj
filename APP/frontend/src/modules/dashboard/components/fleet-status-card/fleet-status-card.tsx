"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/shared/components/ui/card";
import { NAVIGATION_ICONS } from "@/modules/navigation";
import { fleetUtilizationPercent } from "../../utils/dashboard.selectors";
import type { FleetStatusDto } from "../../types/dashboard.types";
import styles from "./fleet-status-card.module.css";

export interface FleetStatusCardProps {
  fleet: FleetStatusDto | null;
}

export function FleetStatusCard({ fleet }: FleetStatusCardProps) {
  const t = useTranslations("Dashboard");
  const CarsIcon = NAVIGATION_ICONS.cars;

  if (!fleet) return null;

  const percent = fleetUtilizationPercent(fleet);
  const rentedLabel = t("fleetRentedPercent.rentedLegend", { percent });
  const notRentedLabel = t("fleetRentedPercent.notRentedLegend", {
    percent: fleet.total > 0 ? 100 - percent : 0,
  });

  return (
    <Card as="section" className={styles.card}>
      <Card.Title icon={<CarsIcon />}>{t("fleetRentedPercent.title")}</Card.Title>

      <div className={styles.body}>
        <p className={styles.label}>{t("fleetRentedPercent.currentLabel")}</p>
        <p className={styles.percent} aria-describedby="dashboard-fleet-rented-bar">
          <span className={styles.percentValue}>{percent}</span>
          <span className={styles.percentSign}>%</span>
        </p>

        <div
          id="dashboard-fleet-rented-bar"
          className={styles.bar}
          role="img"
          aria-label={`${rentedLabel}; ${notRentedLabel}`}
        >
          <span
            className={styles.barRented}
            style={{ width: `${percent}%` }}
            title={rentedLabel}
          />
          <span
            className={styles.barRemainder}
            style={{ width: `${fleet.total > 0 ? 100 - percent : 0}%` }}
            title={notRentedLabel}
          />
        </div>

        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.dotRented} aria-hidden="true" />
            {rentedLabel}
          </span>
          <span className={styles.legendItem}>
            <span className={styles.dotRemainder} aria-hidden="true" />
            {notRentedLabel}
          </span>
        </div>
      </div>
    </Card>
  );
}
