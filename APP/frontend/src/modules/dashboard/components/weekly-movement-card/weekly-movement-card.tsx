"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/shared/components/ui/card";
import { TrendChart } from "@/shared/components/charts/trend-chart";
import { NAVIGATION_ICONS } from "@/modules/navigation";
import { formatAed, formatCompactAmount } from "../../utils/money";
import type { WeeklyPoint } from "../../types/dashboard.types";
import styles from "./weekly-movement-card.module.css";

export interface WeeklyMovementCardProps {
  week: WeeklyPoint[];
}

/** Revenue vs expense over the last 7 days, with the resulting net line. */
export function WeeklyMovementCard({ week }: WeeklyMovementCardProps) {
  const t = useTranslations("Dashboard");
  const FinanceIcon = NAVIGATION_ICONS.finance;

  const data = week.map((point) => ({
    label: t(`week.${point.key}`),
    revenue: point.revenue,
    expense: point.expense,
    net: point.net,
  }));

  return (
    <Card as="section">
      <Card.Title icon={<FinanceIcon />}>{t("weekly.title")}</Card.Title>
      <p className={styles.subtitle}>{t("weekly.subtitle")}</p>

      <TrendChart
        data={data}
        labels={{
          revenue: t("weekly.revenue"),
          expense: t("weekly.expense"),
          net: t("weekly.net"),
        }}
        format={formatAed}
        formatCompact={formatCompactAmount}
      />
    </Card>
  );
}
