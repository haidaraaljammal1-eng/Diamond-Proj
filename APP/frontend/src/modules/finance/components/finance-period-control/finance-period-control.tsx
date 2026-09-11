"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { DateRangePicker } from "@/shared/components/ui/date-range-picker";
import type { DateRangePickerLabels } from "@/shared/components/ui/date-range-picker";
import type { FinancePeriodPreset } from "../../types/finance.types";
import styles from "./finance-period-control.module.css";

const PRESETS: FinancePeriodPreset[] = ["today", "week", "month", "custom"];

export interface FinancePeriodControlProps {
  preset: FinancePeriodPreset;
  customFrom: string;
  customTo: string;
  lastUpdatedAt: string | null;
  onPresetChange: (preset: FinancePeriodPreset) => void;
  onCustomRangeApply: (from: string, to: string) => void;
}

export function FinancePeriodControl({
  preset,
  customFrom,
  customTo,
  lastUpdatedAt,
  onPresetChange,
  onCustomRangeApply,
}: FinancePeriodControlProps) {
  const t = useTranslations("Finance");
  const tDateRange = useTranslations("DateRangePicker");
  const locale = useLocale();
  const format = useFormatter();

  const dateRangeLabels: DateRangePickerLabels = {
    fieldLabel: tDateRange("fieldLabel"),
    placeholder: tDateRange("placeholder"),
    apply: tDateRange("apply"),
    clear: tDateRange("clear"),
    daysSelected: (count) => tDateRange("daysSelected", { count }),
    previousMonth: tDateRange("previousMonth"),
    nextMonth: tDateRange("nextMonth"),
    presets: {
      today: tDateRange("presets.today"),
      last7: tDateRange("presets.last7"),
      last30: tDateRange("presets.last30"),
      thisMonth: tDateRange("presets.thisMonth"),
      lastMonth: tDateRange("presets.lastMonth"),
      custom: tDateRange("presets.custom"),
    },
  };

  const lastUpdatedLabel =
    lastUpdatedAt
      ? format.dateTime(new Date(lastUpdatedAt), {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : null;

  return (
    <div className={styles.wrap} data-testid="finance-period-control">
      <div className={styles.segments} role="group" aria-label={t("period.label")}>
        {PRESETS.map((value) => (
          <button
            key={value}
            type="button"
            className={[styles.segment, preset === value ? styles.segmentActive : ""]
              .filter(Boolean)
              .join(" ")}
            data-testid={`finance-period-${value}`}
            onClick={() => onPresetChange(value)}
          >
            {t(`period.${value}`)}
          </button>
        ))}
      </div>

      {preset === "custom" ? (
        <div className={styles.custom}>
          <DateRangePicker
            value={{ from: customFrom, to: customTo }}
            locale={locale}
            labels={dateRangeLabels}
            onApply={(range) => onCustomRangeApply(range.from, range.to)}
            onClear={() => onCustomRangeApply("", "")}
          />
        </div>
      ) : null}

      {lastUpdatedLabel ? (
        <p className={styles.updated}>
          {t("lastUpdated", { value: lastUpdatedLabel })}
        </p>
      ) : null}
    </div>
  );
}
