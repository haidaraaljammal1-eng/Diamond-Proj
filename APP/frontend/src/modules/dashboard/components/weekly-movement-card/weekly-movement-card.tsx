"use client";

import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { GroupedBarChart } from "@/shared/components/charts/grouped-bar-chart";
import { NAVIGATION_ICONS } from "@/modules/navigation";
import { formatDashboardChartDay } from "../../utils/dashboard-chart-days";
import type { WeeklyRentalActivityPointDto } from "../../types/dashboard.types";
import styles from "./weekly-movement-card.module.css";

export interface WeeklyMovementCardProps {
  series: WeeklyRentalActivityPointDto[] | null;
}

export function WeeklyMovementCard({ series }: WeeklyMovementCardProps) {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const FinanceIcon = NAVIGATION_ICONS.finance;

  if (series == null) return null;

  const data = series.map((point) => ({
    label: formatDashboardChartDay(point.date, locale),
    rented: point.rented,
    returned: point.returned,
  }));

  return (
    <Card as="section">
      <Card.Title icon={<FinanceIcon />}>{t("weekly.title")}</Card.Title>
      <p className={styles.subtitle}>{t("weekly.subtitle")}</p>

      {series.length === 0 ? (
        <EmptyState variant="inline" title={t("weekly.empty")} />
      ) : (
        <GroupedBarChart
          data={data}
          labels={{
            rented: t("weekly.rented"),
            returned: t("weekly.returned"),
          }}
        />
      )}
    </Card>
  );
}
