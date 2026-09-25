import type { ContractPriceType } from "@/modules/contracts/types/contract.types";

export interface VehicleDefaultRates {
  hourlyRate: number | null;
  dailyRate: number | null;
  weeklyRate: number | null;
  monthlyRate: number | null;
}

export type RentalPricePeriod = "hourly" | "daily" | "weekly" | "monthly";

/** @deprecated Prefer stored vehicle rates via `defaultRateForPriceType`. */
export function deriveWeeklyRate(dailyRate: number | null): number {
  if (!dailyRate) return 0;
  return Math.round(dailyRate * 7 * 0.88);
}

/** @deprecated Prefer stored vehicle rates via `defaultRateForPriceType`. */
export function deriveMonthlyRate(
  dailyRate: number | null,
  monthlyRate: number | null,
): number {
  if (monthlyRate != null) return monthlyRate;
  if (!dailyRate) return 0;
  return dailyRate * 30;
}

/** @deprecated Prefer stored vehicle rates via `defaultRateForPriceType`. */
export function deriveHourlyRate(dailyRate: number | null): number {
  if (!dailyRate) return 0;
  return Math.round(dailyRate / 8);
}

export function defaultRateForPriceType(
  vehicle: VehicleDefaultRates,
  priceType: ContractPriceType,
): number | null {
  switch (priceType) {
    case "HOURLY":
      return vehicle.hourlyRate;
    case "DAILY":
      return vehicle.dailyRate;
    case "WEEKLY":
      return vehicle.weeklyRate;
    case "MONTHLY":
      return vehicle.monthlyRate;
    default:
      return null;
  }
}

/** @deprecated Prefer `defaultRateForPriceType` with stored vehicle rates. */
export function defaultPriceForPeriod(
  dailyRate: number | null,
  monthlyRate: number | null,
  period: RentalPricePeriod,
): number {
  if (period === "hourly") return deriveHourlyRate(dailyRate);
  if (period === "weekly") return deriveWeeklyRate(dailyRate);
  if (period === "monthly") return deriveMonthlyRate(dailyRate, monthlyRate);
  return dailyRate ?? 0;
}

export function isStandardPriceType(priceType: ContractPriceType): boolean {
  return priceType !== "CUSTOM";
}
