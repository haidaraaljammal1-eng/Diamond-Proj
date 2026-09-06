export type RentalPricePeriod = "daily" | "weekly" | "monthly";

export interface RentalPricePeriodOption {
  id: "day" | "week" | "month";
  key: RentalPricePeriod;
  days: number;
}

export const RENTAL_PRICE_PERIOD_OPTIONS: RentalPricePeriodOption[] = [
  { id: "day", key: "daily", days: 1 },
  { id: "week", key: "weekly", days: 7 },
  { id: "month", key: "monthly", days: 30 },
];

export function deriveWeeklyRate(dailyRate: number | null): number {
  if (!dailyRate) return 0;
  return Math.round(dailyRate * 7 * 0.88);
}

export function deriveMonthlyRate(
  dailyRate: number | null,
  monthlyRate: number | null,
): number {
  if (monthlyRate != null) return monthlyRate;
  if (!dailyRate) return 0;
  return dailyRate * 30;
}

export function deriveHourlyRate(dailyRate: number | null): number {
  if (!dailyRate) return 0;
  return Math.round(dailyRate / 8);
}

export function defaultPriceForPeriod(
  dailyRate: number | null,
  monthlyRate: number | null,
  period: RentalPricePeriod,
): number {
  if (period === "weekly") return deriveWeeklyRate(dailyRate);
  if (period === "monthly") return deriveMonthlyRate(dailyRate, monthlyRate);
  return dailyRate ?? 0;
}
