"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { DateRangePicker } from "@/shared/components/ui/date-range-picker";
import type { DateRangePickerLabels } from "@/shared/components/ui/date-range-picker";
import { fetchFinanceStatementBusinessToday } from "../../api/finance.api";
import type {
  FinanceStatementExportParams,
  StatementCompanyCode,
  StatementPeriodType,
} from "../../types/finance.types";
import { STATEMENT_PERIOD_TYPES } from "../../utils/finance-statement-period";
import styles from "./finance-statements-section.module.css";

export interface FinanceStatementExportDialogProps {
  open: boolean;
  companyCode: StatementCompanyCode | null;
  initial: FinanceStatementExportParams;
  loading: boolean;
  onClose: () => void;
  onDownload: (params: FinanceStatementExportParams) => void;
}

export function FinanceStatementExportDialog({
  open,
  companyCode,
  initial,
  loading,
  onClose,
  onDownload,
}: FinanceStatementExportDialogProps) {
  const t = useTranslations("Finance");
  const tDateRange = useTranslations("DateRangePicker");
  const locale = useLocale();
  const [periodType, setPeriodType] = useState<StatementPeriodType>("TODAY");
  const [date, setDate] = useState(initial.date ?? "");
  const [weekStart, setWeekStart] = useState(initial.weekStart ?? "");
  const [year, setYear] = useState(String(initial.year ?? new Date().getFullYear()));
  const [month, setMonth] = useState(String(initial.month ?? new Date().getMonth() + 1));
  const [customFrom, setCustomFrom] = useState(initial.from ?? "");
  const [customTo, setCustomTo] = useState(initial.to ?? "");
  const [businessToday, setBusinessToday] = useState<{
    displayAr: string;
    displayEn: string;
  } | null>(null);
  const openSessionActiveRef = useRef(false);

  const todayDisplay =
    businessToday == null
      ? null
      : locale === "ar"
        ? businessToday.displayAr
        : businessToday.displayEn;

  useEffect(() => {
    if (!open) {
      openSessionActiveRef.current = false;
      return;
    }
    if (openSessionActiveRef.current) return;
    openSessionActiveRef.current = true;

    setPeriodType("TODAY");
    setDate(initial.date ?? "");
    setWeekStart(initial.weekStart ?? "");
    setYear(String(initial.year ?? new Date().getFullYear()));
    setMonth(String(initial.month ?? new Date().getMonth() + 1));
    setCustomFrom(initial.from ?? "");
    setCustomTo(initial.to ?? "");

    let cancelled = false;
    void fetchFinanceStatementBusinessToday()
      .then((data) => {
        if (cancelled) return;
        setBusinessToday({ displayAr: data.displayAr, displayEn: data.displayEn });
      })
      .catch(() => {
        if (!cancelled) setBusinessToday(null);
      });

    return () => {
      cancelled = true;
    };
    // `initial` is read once when the dialog opens; omit from deps so finance page
    // re-renders (new prefill object identity) do not reset period selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional per open session
  }, [open]);

  const dateRangeLabels: DateRangePickerLabels = useMemo(
    () => ({
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
    }),
    [tDateRange],
  );

  const payload = (): FinanceStatementExportParams => {
    const base: FinanceStatementExportParams = {
      periodType,
      locale: locale === "ar" ? "ar" : "en",
    };
    if (periodType === "TODAY") return base;
    if (periodType === "DAILY") return { ...base, date };
    if (periodType === "WEEKLY") return { ...base, weekStart };
    if (periodType === "MONTHLY") {
      return { ...base, year: Number(year), month: Number(month) };
    }
    return { ...base, from: customFrom, to: customTo };
  };

  const canDownload =
    periodType === "TODAY" ||
    (periodType === "DAILY" && Boolean(date)) ||
    (periodType === "WEEKLY" && Boolean(weekStart)) ||
    (periodType === "MONTHLY" && Boolean(year) && Boolean(month)) ||
    (periodType === "CUSTOM" && Boolean(customFrom) && Boolean(customTo));

  const companyLabel =
    companyCode === "ELITE" ? t("statements.companyElite") : t("statements.companyUnique");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("statements.dialogTitle", { company: companyLabel })}
      description={t("statements.dialogDescription")}
      closeLabel={t("statements.cancel")}
    >
      <div className={styles.dialogBody} data-testid="finance-statement-export-dialog">
        <p className={styles.dialogMeta}>
          <span>{companyLabel}</span>
          <span>{t("statements.formatPdf")}</span>
        </p>
        <div className={styles.periodTypeRow} role="group" aria-label={t("statements.periodTypeLabel")}>
          {STATEMENT_PERIOD_TYPES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={periodType === value}
              className={[
                styles.periodChip,
                periodType === value ? styles.periodChipActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setPeriodType(value)}
            >
              {t(`statements.periodType.${value}`)}
            </button>
          ))}
        </div>
        {periodType === "TODAY" ? (
          <p className={styles.todayPreview} data-testid="finance-statement-today-label">
            {todayDisplay
              ? t("statements.todayPreview", { date: todayDisplay })
              : t("statements.periodType.TODAY")}
          </p>
        ) : null}
        {periodType === "DAILY" ? (
          <label className={styles.field}>
            <span>{t("statements.dateLabel")}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        ) : null}
        {periodType === "WEEKLY" ? (
          <label className={styles.field}>
            <span>{t("statements.weekStartLabel")}</span>
            <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
          </label>
        ) : null}
        {periodType === "MONTHLY" ? (
          <div className={styles.monthRow}>
            <label className={styles.field}>
              <span>{t("statements.yearLabel")}</span>
              <input type="number" min={2000} max={2100} value={year} onChange={(e) => setYear(e.target.value)} />
            </label>
            <label className={styles.field}>
              <span>{t("statements.monthLabel")}</span>
              <input
                type="number"
                min={1}
                max={12}
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </label>
          </div>
        ) : null}
        {periodType === "CUSTOM" ? (
          <DateRangePicker
            value={{ from: customFrom, to: customTo }}
            locale={locale}
            labels={dateRangeLabels}
            onApply={(range) => {
              setCustomFrom(range.from);
              setCustomTo(range.to);
            }}
            onClear={() => {
              setCustomFrom("");
              setCustomTo("");
            }}
          />
        ) : null}
        <div className={styles.dialogActions}>
          <Button
            type="button"
            variant="primary"
            size="md"
            loading={loading}
            disabled={!canDownload}
            data-testid="finance-statement-download"
            onClick={() => onDownload(payload())}
          >
            {t("statements.downloadPdf")}
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={onClose} disabled={loading}>
            {t("statements.cancel")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
