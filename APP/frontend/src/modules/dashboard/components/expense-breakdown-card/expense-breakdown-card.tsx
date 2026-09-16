"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { DonutChart } from "@/shared/components/charts/donut-chart";
import { NAVIGATION_ICONS } from "@/modules/navigation";
import { formatFinanceAed } from "@/modules/finance/utils/format-finance-money";
import { ledgerSourceLabel } from "@/modules/finance/utils/finance-labels";
import {
  financeSliceHoverDetail,
  isWeeklyFinanceEmpty,
  visibleFinanceSlices,
} from "../../utils/dashboard.selectors";
import type { WeeklyFinanceDto } from "../../types/dashboard.types";
import styles from "./expense-breakdown-card.module.css";

export interface ExpenseBreakdownCardProps {
  finance: WeeklyFinanceDto | null;
}

export function ExpenseBreakdownCard({ finance }: ExpenseBreakdownCardProps) {
  const t = useTranslations("Dashboard");
  const financeT = useTranslations("Finance");
  const InvoicesIcon = NAVIGATION_ICONS.invoices;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (finance == null) return null;

  const slices = visibleFinanceSlices(finance).map((slice) => ({
    ...slice,
    label: ledgerSourceLabel(slice.key, financeT),
  }));
  const active = financeSliceHoverDetail(slices, activeIndex);

  return (
    <Card as="section" className={styles.card}>
      <Card.Title icon={<InvoicesIcon />}>{t("expenses.title")}</Card.Title>
      <p className={styles.subtitle}>{t("expenses.subtitle")}</p>

      {isWeeklyFinanceEmpty(finance) ? (
        <EmptyState variant="inline" title={t("expenses.empty")} />
      ) : (
        <>
          {slices.length > 0 ? (
            <>
              <DonutChart
                slices={slices.map((slice) => ({
                  label: slice.label,
                  value: slice.amount,
                  share: slice.share,
                }))}
                centerValue={formatFinanceAed(finance.netMovement)}
                centerLabel={t("expenses.netMovement")}
                format={formatFinanceAed}
                activeIndex={activeIndex}
                onActiveChange={setActiveIndex}
              />
              <div className={styles.detail} aria-live="polite">
                {active ? (
                  <>
                    <span className={styles.detailName}>{active.label}</span>
                    <b className={styles.detailAmount} dir="ltr">
                      {formatFinanceAed(active.amount)}
                    </b>
                    <span className={styles.detailMeta}>
                      {active.share}%
                      {" · "}
                      {active.direction === "COLLECTION"
                        ? t("expenses.collection")
                        : t("expenses.expense")}
                    </span>
                  </>
                ) : (
                  <>
                    <span className={styles.detailName}>{t("expenses.netMovement")}</span>
                    <b className={styles.detailAmount} dir="ltr">
                      {formatFinanceAed(finance.netMovement)}
                    </b>
                  </>
                )}
              </div>
            </>
          ) : null}
          <ul className={styles.summary}>
            <li>
              <span>{t("expenses.collected")}</span>
              <b dir="ltr">{formatFinanceAed(finance.collected)}</b>
            </li>
            <li>
              <span>{t("expenses.expenses")}</span>
              <b dir="ltr">{formatFinanceAed(finance.expenses)}</b>
            </li>
            <li>
              <span>{t("expenses.netMovement")}</span>
              <b dir="ltr">{formatFinanceAed(finance.netMovement)}</b>
            </li>
          </ul>
        </>
      )}
    </Card>
  );
}
