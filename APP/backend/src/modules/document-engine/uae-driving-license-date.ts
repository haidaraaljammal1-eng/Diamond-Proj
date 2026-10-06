import {
  formatCalendarDate,
  parseCalendarDate,
  type CalendarDate,
} from "src/modules/contracts/license-calendar";

/** OCR visible dates (DD/MM/YYYY or DD-MM-YYYY) → ISO calendar `YYYY-MM-DD`. */
export function ocrVisibleDateToIso(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const match = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(trimmed);
  if (!match) return null;
  const d = Number(match[1]);
  const m = Number(match[2]);
  const y = Number(match[3]);
  const cal: CalendarDate = { y, m, d };
  const iso = formatCalendarDate(cal);
  return parseCalendarDate(iso) ? iso : null;
}
