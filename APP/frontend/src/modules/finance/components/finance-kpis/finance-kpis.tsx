"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Icon } from "@/shared/components/ui/icon";
import { StatCard } from "@/shared/components/ui/stat-card";
import type { FinanceSummaryDto } from "../../types/finance.types";
import { formatFinanceAed } from "../../utils/format-finance-money";
import styles from "./finance-kpis.module.css";

export interface FinanceKpisProps {
  summary: FinanceSummaryDto | null;
  loading: boolean;
}

export function FinanceKpis({ summary, loading }: FinanceKpisProps) {
  const t = useTranslations("Finance");
  const format = useFormatter();

  if (loading && !summary) {
    return (
      <div className={styles.kpis} data-testid="finance-kpis-loading" aria-busy="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className={styles.skeleton} aria-hidden="true" />
        ))}
      </div>
    );
  }

  const outstandingAsOf = summary?.outstandingAsOf
    ? format.dateTime(new Date(summary.outstandingAsOf), {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className={styles.kpis} data-testid="finance-kpis">
      <div data-testid="finance-kpi-collected">
        <StatCard
          icon={<Icon name="mdi:cash-check" size={16} />}
          label={t("kpi.collected")}
          value={formatFinanceAed(summary?.collected ?? 0)}
          note={t("kpi.collectedNote")}
        />
      </div>
      <div data-testid="finance-kpi-outstanding">
        <StatCard
          icon={<Icon name="mdi:account-clock-outline" size={16} />}
          label={t("kpi.outstanding")}
          value={formatFinanceAed(summary?.outstanding ?? 0)}
          note={
            summary
              ? t("kpi.outstandingNote", {
                  count: summary.openReceivablesCount,
                  asOf: outstandingAsOf ?? "",
                })
              : t("kpi.outstandingCurrent")
          }
        />
      </div>
      <div data-testid="finance-kpi-expenses">
        <StatCard
          icon={<Icon name="mdi:cash-minus" size={16} />}
          label={t("kpi.expenses")}
          value={formatFinanceAed(summary?.expenses ?? 0)}
          note={t("kpi.expensesNote")}
        />
      </div>
      <div data-testid="finance-kpi-net">
        <StatCard
          icon={<Icon name="mdi:swap-horizontal" size={16} />}
          label={t("kpi.netMovement")}
          value={formatFinanceAed(summary?.netMovement ?? 0)}
          note={t("kpi.netMovementNote")}
        />
      </div>
    </div>
  );
}
