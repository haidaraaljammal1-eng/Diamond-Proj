"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/shared/components/ui/icon";
import { StatCard } from "@/shared/components/ui/stat-card";
import type { GpsSummaryDto } from "../../types/gps.types";
import styles from "./gps-summary.module.css";

export interface GpsSummaryProps {
  summary: GpsSummaryDto | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function GpsSummaryStrip({ summary, loading, error, onRetry }: GpsSummaryProps) {
  const t = useTranslations("Gps");

  if (error) {
    return (
      <div className={styles.error} role="status">
        <p>{error}</p>
        <button type="button" className={styles.retry} onClick={onRetry}>
          {t("retry")}
        </button>
      </div>
    );
  }

  const total = summary?.totalVehicles ?? 0;
  const moving = summary?.moving ?? 0;
  const idle = summary?.idle ?? 0;
  const parked = summary?.parked ?? 0;

  return (
    <div className={styles.kpis} data-testid="gps-summary">
      <StatCard
        compact
        className={styles.kpiTotal}
        icon={<Icon name="mdi:car-multiple" size={14} />}
        label={t("kpi.total")}
        value={loading && !summary ? "—" : total}
        note={t("kpi.totalNote")}
      />
      <StatCard
        compact
        className={styles.kpiMoving}
        icon={<Icon name="mdi:navigation-variant" size={14} />}
        label={t("kpi.moving")}
        value={loading && !summary ? "—" : moving}
        note={t("kpi.movingNote")}
      />
      <StatCard
        compact
        className={styles.kpiIdle}
        icon={<Icon name="mdi:engine" size={14} />}
        label={t("kpi.idle")}
        value={loading && !summary ? "—" : idle}
        note={t("kpi.idleNote")}
      />
      <StatCard
        compact
        className={styles.kpiParked}
        icon={<Icon name="mdi:parking" size={14} />}
        label={t("kpi.parked")}
        value={loading && !summary ? "—" : parked}
        note={t("kpi.parkedNote")}
      />
    </div>
  );
}
