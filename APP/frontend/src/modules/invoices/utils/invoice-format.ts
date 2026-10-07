import { formatAed } from "../../dashboard/utils/money.ts";

/** Calendar date from API ISO or `YYYY-MM-DD` → `DD/MM/YYYY` without timezone shift. */
export function formatInvoiceCalendarDate(value: string | null | undefined): string {
  if (!value) return "";
  const iso = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

export function formatInvoiceAmount(amount: number, currency: string): string {
  if (currency === "AED") return formatAed(amount);
  return `${currency} ${Math.round(amount).toLocaleString("en-US")}`;
}

/** Mask phone for display — keep last 4 digits when long enough. */
export function maskRecipientPhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return phone;
  return `•••• ${digits.slice(-4)}`;
}
