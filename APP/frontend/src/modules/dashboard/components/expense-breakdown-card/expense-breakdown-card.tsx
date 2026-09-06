"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/shared/components/ui/card";
import { DonutChart } from "@/shared/components/charts/donut-chart";
import { NAVIGATION_ICONS } from "@/modules/navigation";
import { formatAed } from "../../utils/money";
import type { ExpenseBreakdown } from "../../types/dashboard.types";
import styles from "./expense-breakdown-card.module.css";

export interface ExpenseBreakdownCardProps {
  expenses: ExpenseBreakdown;
}

/** Where the last 7 days of office spending went. */
export function ExpenseBreakdownCard({ expenses }: ExpenseBreakdownCardProps) {
  const t = useTranslations("Dashboard");
  const InvoicesIcon = NAVIGATION_ICONS.invoices;

  const slices = expenses.slices.map((slice) => ({
    label: t(`expenseCategory.${slice.key}`),
    value: slice.amount,
    share: slice.share,
  }));

  return (
    <Card as="section" className={styles.card}>
      <Card.Title icon={<InvoicesIcon />}>{t("expenses.title")}</Card.Title>
      <p className={styles.subtitle}>{t("expenses.subtitle")}</p>

      <DonutChart
        slices={slices}
        centerValue={formatAed(expenses.total)}
        centerLabel={t("expenses.centerLabel")}
        format={formatAed}
      />
    </Card>
  );
}
