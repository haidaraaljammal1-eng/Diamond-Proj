"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/shared/components/ui/card";
import { TrendChart } from "@/shared/components/charts/trend-chart";
import { formatCompactAmount } from "@/modules/dashboard/utils/money";
import type { FinanceAnalyticsDto } from "../../types/finance.types";
import {
  expenseCategoryLabel,
  receivableSourceLabel,
} from "../../utils/finance-labels";
import { formatFinanceAed } from "../../utils/format-finance-money";
import { resolveFinanceErrorMessage } from "../../utils/resolve-finance-error";
import { FinanceBreakdownList } from "../finance-breakdown-list/finance-breakdown-list";
import styles from "./finance-analytics.module.css";

export interface FinanceAnalyticsProps {
  analytics: FinanceAnalyticsDto | null;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}

export function FinanceAnalyticsSection({
  analytics,
  loading,
  error,
  onRetry,
}: FinanceAnalyticsProps) {
  const t = useTranslations("Finance");
  const errorMessage = resolveFinanceErrorMessage(t, error as never);

  const trendData = useMemo(
    () =>
      (analytics?.trend ?? []).map((point) => ({
        label: point.date,
        revenue: point.collected,
        expense: point.expenses,
        net: point.netMovement,
      })),
    [analytics?.trend],
  );

  const outstandingItems = useMemo(
    () =>
      (analytics?.outstandingBreakdown ?? [])
        .filter((row) => row.amount > 0 || row.count > 0)
        .map((row) => ({
          key: row.sourceType,
          label: receivableSourceLabel(row.sourceType, t),
          amount: row.amount,
          count: row.count,
        })),
    [analytics?.outstandingBreakdown, t],
  );

  const expenseItems = useMemo(
    () =>
      (analytics?.expenseBreakdown ?? [])
        .filter((row) => row.amount > 0)
        .map((row) => ({
          key: row.category,
          label:
            row.category === "MAINTENANCE"
              ? t("expenseCategory.MAINTENANCE")
              : expenseCategoryLabel(row.category, t),
          amount: row.amount,
        })),
    [analytics?.expenseBreakdown, t],
  );

  return (
    <section className={styles.section} data-testid="finance-analytics">
      <div className={styles.grid}>
        <Card as="section" className={styles.trend}>
          <Card.Title>{t("analytics.trendTitle")}</Card.Title>
          <p className={styles.subtitle}>{t("analytics.trendSubtitle")}</p>
          {errorMessage ? (
            <div className={styles.error} role="alert">
              <p>{errorMessage}</p>
              <button type="button" onClick={onRetry}>{t("retry")}</button>
            </div>
          ) : loading && !analytics ? (
            <div className={styles.skeleton} aria-busy="true" />
          ) : (
            <TrendChart
              data={trendData}
              labels={{
                revenue: t("analytics.collected"),
                expense: t("analytics.expenses"),
                net: t("analytics.netMovement"),
              }}
              format={formatFinanceAed}
              formatCompact={formatCompactAmount}
            />
          )}
        </Card>

        <div className={styles.side}>
          <Card as="section">
            <Card.Title>{t("analytics.outstandingTitle")}</Card.Title>
            <p className={styles.currentNote}>{t("analytics.outstandingCurrent")}</p>
            <FinanceBreakdownList
              items={outstandingItems}
              emptyLabel={t("analytics.outstandingEmpty")}
              countLabel={(count) => t("analytics.items", { count })}
            />
          </Card>

          <Card as="section">
            <Card.Title>{t("analytics.expenseTitle")}</Card.Title>
            <p className={styles.subtitle}>{t("analytics.expenseSubtitle")}</p>
            <FinanceBreakdownList
              items={expenseItems}
              emptyLabel={t("analytics.expenseEmpty")}
            />
          </Card>
        </div>
      </div>
    </section>
  );
}
