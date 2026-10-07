/** Format whole AED for invoice PDF/display (e.g. AED1,950.00). */
export function formatInvoiceAed(amountWhole: number): string {
  const safe = Math.trunc(amountWhole);
  const negative = safe < 0;
  const abs = Math.abs(safe);
  const whole = Math.floor(abs);
  const formatted = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}AED${formatted}.00`;
}

export function addCalendarDaysUtc(date: Date, days: number): Date {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function formatInvoiceDateDdMmYyyy(date: Date): string {
  const d = date.getUTCDate().toString().padStart(2, "0");
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Derive rental line quantity/unit rate without floating-point division.
 * Falls back to qty=1 when rate would be ambiguous.
 */
export function deriveRentalQuantityAndRate(input: {
  durationValue: number;
  durationUnit: string;
  priceType: string;
  agreedAmount: number;
}): { quantity: number; unitRate: number } {
  const qty = input.durationValue > 0 ? input.durationValue : 1;
  if (qty <= 0 || input.agreedAmount <= 0) return { quantity: 1, unitRate: input.agreedAmount };
  if (input.agreedAmount % qty !== 0) return { quantity: 1, unitRate: input.agreedAmount };
  const unitRate = input.agreedAmount / qty;
  if (!Number.isInteger(unitRate)) return { quantity: 1, unitRate: input.agreedAmount };
  if (input.priceType === "CUSTOM") return { quantity: 1, unitRate: input.agreedAmount };
  return { quantity: qty, unitRate };
}
