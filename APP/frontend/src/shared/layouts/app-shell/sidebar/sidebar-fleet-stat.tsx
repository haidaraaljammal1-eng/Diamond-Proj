"use client";

import { useTranslations } from "next-intl";
import styles from "./sidebar.module.css";

/**
 * SidebarFleetStat — "cars rented now" KPI card at the foot of the rail, with
 * a two-item breakdown row (overdue / in service) for visual weight.
 *
 * PLACEHOLDER VALUES: there is no fleet/rentals module or Backend endpoint yet
 * (only `dashboard.read` exists today — see `navigation.config.ts`), so every
 * number here is a static mock, not live data. Replace the three MOCK_*
 * constants with a real query the moment a fleet API exists; never invent a
 * permission or endpoint to unblock it sooner.
 */
const MOCK_RENTED_COUNT = 24;
const MOCK_OVERDUE_COUNT = 3;
const MOCK_MAINTENANCE_COUNT = 5;

export function SidebarFleetStat() {
  const t = useTranslations("Shell");

  return (
    <div className={styles.fleetStat}>
      <div className={styles.fleetStatHead} title={t("fleetStatLabel")}>
        <span className={styles.fleetStatDot} aria-hidden="true" />
        <span className={styles.fleetStatValue}>{MOCK_RENTED_COUNT}</span>
        <span className={styles.fleetStatLabel}>{t("fleetStatLabel")}</span>
      </div>

      <div className={styles.fleetStatBreakdown}>
        <span
          className={styles.fleetStatMetric}
          title={t("fleetStatOverdue")}
        >
          <svg
            viewBox="0 0 24 24"
            className={styles.fleetStatMetricIcon}
            aria-hidden="true"
          >
            <path d="M12 3 21 19H3L12 3z" />
            <path d="M12 9v4M12 16h.01" />
          </svg>
          {MOCK_OVERDUE_COUNT}
          <span className={styles.fleetStatMetricLabel}>
            {t("fleetStatOverdue")}
          </span>
        </span>

        <span className={styles.fleetStatDivider} aria-hidden="true" />

        <span
          className={styles.fleetStatMetric}
          title={t("fleetStatMaintenance")}
        >
          <svg
            viewBox="0 0 24 24"
            className={styles.fleetStatMetricIcon}
            aria-hidden="true"
          >
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          {MOCK_MAINTENANCE_COUNT}
          <span className={styles.fleetStatMetricLabel}>
            {t("fleetStatMaintenance")}
          </span>
        </span>
      </div>
    </div>
  );
}
