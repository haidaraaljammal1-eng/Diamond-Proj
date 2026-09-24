/**
 * Archive calendar-date helpers — DATE-only fields must not shift across timezones.
 * API `@db.Date` values arrive as UTC-midnight ISO strings; we read/write YYYY-MM-DD.
 */

const ISO_DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

/** Extract `YYYY-MM-DD` from an API ISO date string without local timezone conversion. */
export function archiveDateFromApi(value: string | null | undefined): string {
  if (!value) return "";
  const match = ISO_DATE_PREFIX.exec(value);
  return match?.[1] ?? "";
}

/** Serialize a date input value for PATCH (empty → null). */
export function archiveDateToApi(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!ISO_DATE_PREFIX.test(trimmed)) return null;
  return trimmed.slice(0, 10);
}
