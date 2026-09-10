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

  const tracked = summary?.trackedVehicles ?? 0;
  const online = summary?.online ?? 0;
  const moving = summary?.moving ?? 0;
  const offline = summary?.offline ?? 0;
  const parked = summary?.parked ?? 0;

  return (
    <div className={styles.kpis} data-testid="gps-summary">
      <StatCard
        compact
        icon={<Icon name="mdi:car-connected" size={15} />}
        label={t("kpi.tracked")}
        value={loading && !summary ? "—" : tracked}
        note={t("kpi.trackedNote")}
      />
      <StatCard
        compact
        icon={<Icon name="mdi:access-point" size={15} />}
        label={t("kpi.online")}
        value={loading && !summary ? "—" : online}
        note={t("kpi.onlineNote")}
      />
      <StatCard
        compact
        icon={<Icon name="mdi:navigation-variant" size={15} />}
        label={t("kpi.moving")}
        value={loading && !summary ? "—" : moving}
        note={t("kpi.parkedCount", { count: parked })}
      />
      <StatCard
        compact
        icon={<Icon name="mdi:signal-off" size={15} />}
        label={t("kpi.offline")}
        value={loading && !summary ? "—" : offline}
        note={t("kpi.offlineNote")}
      />
    </div>
  );
}
