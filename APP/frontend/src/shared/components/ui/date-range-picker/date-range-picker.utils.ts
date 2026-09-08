import type { DateRangeDraft, DateRangePresetId, DateRangeValue } from "./date-range-picker.types";

/** Parse `YYYY-MM-DD` into a local calendar `Date` (no UTC shift). */
export function parseCalendarDate(value: string): Date | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}

/** Serialize a local calendar `Date` to `YYYY-MM-DD` without timezone shift. */
export function formatCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function valueToDraft(value: DateRangeValue): DateRangeDraft {
  const from = parseCalendarDate(value.from);
  const to = parseCalendarDate(value.to);
  if (!from && !to) return {};
  return { from, to };
}

export function draftToValue(draft: DateRangeDraft): DateRangeValue {
  return {
    from: draft.from ? formatCalendarDate(draft.from) : "",
    to: draft.to ? formatCalendarDate(draft.to) : "",
  };
}

export function isCompleteRange(draft: DateRangeDraft): boolean {
  return Boolean(draft.from && draft.to);
}

export function countDaysInclusive(from: Date, to: Date): number {
  const start = startOfDay(from).getTime();
  const end = startOfDay(to).getTime();
  if (end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return startOfDay(next);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function formatDisplayDate(date: Date, locale: string): string {
  const intlLocale = locale === "ar" ? "ar" : "en";
  return new Intl.DateTimeFormat(intlLocale, {
    day: "numeric",
    month: locale === "ar" ? "long" : "short",
    year: "numeric",
  }).format(date);
}

export function formatDisplayRange(
  value: DateRangeValue,
  locale: string,
  separator = " — ",
): string {
  const from = parseCalendarDate(value.from);
  const to = parseCalendarDate(value.to);
  if (!from || !to) return "";
  return `${formatDisplayDate(from, locale)}${separator}${formatDisplayDate(to, locale)}`;
}

export function formatDaysSelected(
  count: number,
  daysSelected: (count: number) => string,
): string {
  return daysSelected(count);
}

export function resolvePresetRange(
  preset: DateRangePresetId,
  today = startOfDay(new Date()),
): DateRangeDraft | null {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "last30":
      return { from: addDays(today, -29), to: today };
    case "thisMonth":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "lastMonth": {
      const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    }
    case "custom":
      return null;
    default:
      return null;
  }
}

export const DATE_RANGE_PRESET_ORDER: DateRangePresetId[] = [
  "today",
  "last7",
  "last30",
  "thisMonth",
  "lastMonth",
  "custom",
];

export function detectPreset(
  draft: DateRangeDraft,
  today = startOfDay(new Date()),
): DateRangePresetId {
  if (!isCompleteRange(draft)) return "custom";
  const value = draftToValue(draft);
  for (const preset of DATE_RANGE_PRESET_ORDER) {
    if (preset === "custom") continue;
    const expected = resolvePresetRange(preset, today);
    if (!expected?.from || !expected.to || !draft.from || !draft.to) continue;
    if (
      formatCalendarDate(expected.from) === value.from &&
      formatCalendarDate(expected.to) === value.to
    ) {
      return preset;
    }
  }
  return "custom";
}

/** Whether Apply should be enabled for the current draft. */
export function canApplyDraft(draft: DateRangeDraft): boolean {
  if (!draft.from || !draft.to) return false;
  return draft.from.getTime() <= draft.to.getTime();
}

/** Popover should reset draft from applied value when opened. */
export function openDraftFromValue(value: DateRangeValue): DateRangeDraft {
  return valueToDraft(value);
}
