/** The one rental-period formula: end = start + days × 24h. */
export function derivedEndAt(startAt: Date | null | undefined, days: number, fallback = new Date()): Date {
  const start = startAt ?? fallback;
  return new Date(start.getTime() + days * 86_400_000);
}
