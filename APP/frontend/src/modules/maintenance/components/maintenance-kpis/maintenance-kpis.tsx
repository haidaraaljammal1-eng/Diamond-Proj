"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/shared/components/ui/icon";
import { StatCard } from "@/shared/components/ui/stat-card";
import { formatAed } from "@/modules/dashboard/utils/money";
import type { MaintenanceSummaryDto } from "../../types/maintenance.types";
import styles from "./maintenance-kpis.module.css";

export interface MaintenanceKpisProps {
  summary: MaintenanceSummaryDto | null;
}

export function MaintenanceKpis({ summary }: MaintenanceKpisProps) {
  const t = useTranslations("Maintenance");
  const inService = summary?.inService ?? 0;
  const overdue = summary?.overdue ?? 0;
  const scheduled = summary?.scheduled ?? 0;
  const ready = summary?.readyForPickup ?? 0;
  const cost = summary?.totalCost ?? 0;

  return (
    <div className={styles.kpis}>
      <StatCard
        icon={<Icon name="mdi:wrench" size={16} />}
        label={t("kpi.inService")}
        value={inService}
        note={
          overdue
            ? t("kpi.inServiceNoteOverdue", { count: overdue })
            : t("kpi.inServiceNoteEmpty")
        }
        noteTone={overdue ? "down" : "neutral"}
      />
      <StatCard
        icon={<Icon name="mdi:calendar" size={16} />}
        label={t("kpi.scheduled")}
        value={scheduled}
        note={t("kpi.scheduledNote")}
      />
      <StatCard
        icon={<Icon name="mdi:check" size={16} />}
        label={t("kpi.ready")}
        value={ready}
        note={t("kpi.readyNote")}
        noteTone={ready ? "up" : "neutral"}
      />
      <StatCard
        icon={<Icon name="mdi:cash" size={16} />}
        label={t("kpi.cost")}
        value={formatAed(cost)}
        note={t("kpi.costNote")}
      />
    </div>
  );
}
