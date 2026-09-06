/** Diamond money formatting — AED with Latin digits, always read left-to-right. */
export function formatAed(value: number): string {
  return `AED ${Math.round(value).toLocaleString("en-US")}`;
}

/** Compact axis form: 41k / 550 (no currency, ticks stay light). */
export function formatCompactAmount(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${Math.round(value / 1000)}k`;
  }
  return String(Math.round(value));
}
