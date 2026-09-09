/** Whole AED integers from the Backend. Never recalculate. */
export function formatRentalAmount(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat("en-US").format(amount);
  return `${currency} ${formatted}`;
}

export function formatRentalDays(days: number, dayWord: string): string {
  return `${days} ${dayWord}`;
}
