"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DayPicker } from "react-day-picker";
import { addMonths } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Button } from "@/shared/components/ui/button";
import { Icon } from "@/shared/components/ui/icon";
import { Popover } from "@/shared/components/ui/popover";
import type {
  DateRangePickerProps,
  DateRangePresetId,
} from "./date-range-picker.types";
import {
  canApplyDraft,
  countDaysInclusive,
  DATE_RANGE_PRESET_ORDER,
  detectPreset,
  draftToValue,
  formatDaysSelected,
  formatDisplayRange,
  isCompleteRange,
  openDraftFromValue,
  parseCalendarDate,
  resolvePresetRange,
  startOfMonth,
} from "./date-range-picker.utils";
import styles from "./date-range-picker.module.css";

const DESKTOP_MONTHS_QUERY = "(min-width: 769px)";

function useTwoMonthCalendar(): boolean {
  const [twoMonths, setTwoMonths] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_MONTHS_QUERY);
    const sync = () => setTwoMonths(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return twoMonths;
}

export function DateRangePicker({
  value,
  locale,
  labels,
  onApply,
  onClear,
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);
  const [activePreset, setActivePreset] = useState<DateRangePresetId>("custom");
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => startOfMonth(new Date()));
  const twoMonths = useTwoMonthCalendar();
  const isRtl = locale === "ar";

  const dayPickerLocale = locale === "ar" ? ar : enUS;
  const displayText = useMemo(
    () => formatDisplayRange(value, locale),
    [locale, value],
  );

  const syncDraftFromValue = useCallback(() => {
    const next = openDraftFromValue(value);
    setDraft(
      next.from || next.to ? { from: next.from, to: next.to } : undefined,
    );
    setActivePreset(detectPreset(next));
    const anchor = parseCalendarDate(value.from) ?? parseCalendarDate(value.to);
    setVisibleMonth(startOfMonth(anchor ?? new Date()));
  }, [value]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) syncDraftFromValue();
      setOpen(nextOpen);
    },
    [syncDraftFromValue],
  );

  const handleSelect = useCallback((range: DateRange | undefined) => {
    setDraft(range);
    setActivePreset(detectPreset(range ?? {}));
  }, []);

  const handlePreset = useCallback((preset: DateRangePresetId) => {
    if (preset === "custom") {
      setActivePreset("custom");
      return;
    }
    const range = resolvePresetRange(preset);
    if (!range?.from || !range.to) return;
    setDraft({ from: range.from, to: range.to });
    setActivePreset(preset);
  }, []);

  const handleApply = useCallback(() => {
    if (!canApplyDraft(draft ?? {})) return;
    onApply(draftToValue(draft ?? {}));
    setOpen(false);
  }, [draft, onApply]);

  const handleClear = useCallback(() => {
    setDraft(undefined);
    setActivePreset("custom");
    onClear();
    setOpen(false);
  }, [onClear]);

  const handlePreviousMonth = useCallback(() => {
    setVisibleMonth((current) => startOfMonth(addMonths(current, -1)));
  }, []);

  const handleNextMonth = useCallback(() => {
    setVisibleMonth((current) => startOfMonth(addMonths(current, 1)));
  }, []);

  const summaryRange = useMemo(() => {
    if (!isCompleteRange(draft ?? {})) return "";
    return formatDisplayRange(draftToValue(draft ?? {}), locale);
  }, [draft, locale]);

  const summaryDays = useMemo(() => {
    if (!draft?.from || !draft.to) return "";
    const count = countDaysInclusive(draft.from, draft.to);
    return formatDaysSelected(count, labels.daysSelected);
  }, [draft, labels.daysSelected]);

  const classNames = useMemo(
    () => ({
      root: [styles.calendar, twoMonths ? styles.calendarTwoMonths : ""]
        .filter(Boolean)
        .join(" "),
      months: styles.months,
      month: styles.month,
      month_caption: styles.monthCaption,
      month_grid: styles.monthGrid,
      weekdays: styles.weekdays,
      weekday: styles.weekday,
      weeks: styles.weeks,
      week: styles.week,
      day: styles.day,
      day_button: styles.dayButton,
      today: styles.dayToday,
      outside: styles.dayOutside,
      hidden: styles.dayHidden,
      selected: styles.daySelected,
      range_start: styles.dayRangeStart,
      range_middle: styles.dayRangeMiddle,
      range_end: styles.dayRangeEnd,
      disabled: styles.dayDisabled,
    }),
    [twoMonths],
  );

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      disabled={disabled}
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
      maxHeight={twoMonths ? 520 : 460}
      trigger={({ ref, id, ...triggerProps }) => (
        <>
          <span className={styles.fieldLabel}>{labels.fieldLabel}</span>
          <button
            {...triggerProps}
            ref={ref}
            id={id}
            type="button"
            className={styles.trigger}
            disabled={disabled}
            aria-label={ariaLabel ?? labels.fieldLabel}
          >
            <Icon name="mdi:calendar-range" size={16} className={styles.triggerIcon} />
            <span
              className={[styles.triggerText, displayText ? "" : styles.placeholder]
                .filter(Boolean)
                .join(" ")}
            >
              {displayText || labels.placeholder}
            </span>
            <span className={styles.caret} aria-hidden="true" />
          </button>
        </>
      )}
    >
      <div
        className={[
          styles.panelBody,
          twoMonths ? styles.panelBodyTwoMonths : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className={styles.presets} role="group" aria-label={labels.fieldLabel}>
          {DATE_RANGE_PRESET_ORDER.map((preset) => (
            <button
              key={preset}
              type="button"
              className={[
                styles.preset,
                activePreset === preset ? styles.presetActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => handlePreset(preset)}
            >
              {labels.presets[preset]}
            </button>
          ))}
        </div>

        <div className={styles.calendarWrap}>
          <div className={styles.calendarShell}>
            <button
              type="button"
              className={styles.edgeNav}
              aria-label={labels.previousMonth}
              onClick={handlePreviousMonth}
            >
              <Icon
                name={isRtl ? "mdi:chevron-right" : "mdi:chevron-left"}
                size={18}
              />
            </button>

            <div className={styles.calendarBody}>
              <DayPicker
                mode="range"
                locale={dayPickerLocale}
                dir={isRtl ? "rtl" : "ltr"}
                numberOfMonths={twoMonths ? 2 : 1}
                month={visibleMonth}
                onMonthChange={setVisibleMonth}
                hideNavigation
                selected={draft}
                onSelect={handleSelect}
                showOutsideDays={false}
                fixedWeeks={false}
                classNames={classNames}
              />
            </div>

            <button
              type="button"
              className={styles.edgeNav}
              aria-label={labels.nextMonth}
              onClick={handleNextMonth}
            >
              <Icon
                name={isRtl ? "mdi:chevron-left" : "mdi:chevron-right"}
                size={18}
              />
            </button>
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={styles.summary}>
          {summaryRange ? (
            <p className={styles.summaryRange}>{summaryRange}</p>
          ) : null}
          {summaryDays ? <p className={styles.summaryDays}>{summaryDays}</p> : null}
        </div>
        <div className={styles.footerActions}>
          <Button type="button" variant="secondary" size="sm" onClick={handleClear}>
            {labels.clear}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleApply}
            disabled={!canApplyDraft(draft ?? {})}
          >
            {labels.apply}
          </Button>
        </div>
      </footer>
    </Popover>
  );
}
