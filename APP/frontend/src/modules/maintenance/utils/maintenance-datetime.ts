import { format, isValid } from "date-fns";

/** Local `YYYY-MM-DD` for a date input, from an API ISO timestamp. */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!isValid(date)) return "";
  return format(date, "yyyy-MM-dd");
}

/** Local `HH:mm` for a time input, from an API ISO timestamp. */
export function isoToTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!isValid(date)) return "";
  return format(date, "HH:mm");
}

/**
 * Combines a local date + time into an ISO string for the API.
 * Empty date returns null. Missing time defaults to 09:00 local.
 */
export function dateAndTimeToIso(
  date: string,
  time: string,
): string | null {
  const day = date.trim();
  if (!day) return null;
  const clock = time.trim() || "09:00";
  const parsed = new Date(`${day}T${clock}`);
  if (!isValid(parsed)) return null;
  return parsed.toISOString();
}
