import type { ContractDurationUnit, ContractPriceType } from "@prisma/client";
import { derivedEndAt } from "src/modules/contracts/contracts-period";

export type { ContractDurationUnit };

const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

export function durationToMilliseconds(value: number, unit: ContractDurationUnit): number {
  switch (unit) {
    case "HOUR":
      return value * MS_HOUR;
    case "DAY":
      return value * MS_DAY;
    case "WEEK":
      return value * 7 * MS_DAY;
    case "MONTH":
      return value * 30 * MS_DAY;
    default:
      return value * MS_DAY;
  }
}

/** Calendar end instant from a structured duration. */
export function durationToEndAt(startAt: Date, value: number, unit: ContractDurationUnit): Date {
  return new Date(startAt.getTime() + durationToMilliseconds(value, unit));
}

/**
 * Legacy calendar-day count used by renewal math and older projections.
 * Sub-day rentals store at least 1 day.
 */
export function durationToRentalDays(value: number, unit: ContractDurationUnit): number {
  switch (unit) {
    case "HOUR":
      return Math.max(1, Math.ceil(value / 24));
    case "DAY":
      return value;
    case "WEEK":
      return value * 7;
    case "MONTH":
      return value * 30;
    default:
      return value;
  }
}

export function standardDurationForPriceType(
  priceType: ContractPriceType,
  rentalDays: number,
): { durationValue: number; durationUnit: ContractDurationUnit } {
  switch (priceType) {
    case "HOURLY":
      return { durationValue: 1, durationUnit: "HOUR" };
    case "DAILY":
      return { durationValue: rentalDays, durationUnit: "DAY" };
    case "WEEKLY":
      return { durationValue: 1, durationUnit: "WEEK" };
    case "MONTHLY":
      return { durationValue: 1, durationUnit: "MONTH" };
    default:
      return { durationValue: rentalDays, durationUnit: "DAY" };
  }
}

export interface ResolvedOfferPeriod {
  startAt: Date;
  endAt: Date;
  rentalDays: number;
  durationValue: number;
  durationUnit: ContractDurationUnit;
}

export interface OfferPeriodInput {
  priceType: ContractPriceType;
  rentalDays?: number;
  durationValue?: number;
  durationUnit?: ContractDurationUnit;
  startAt?: Date;
  endAt?: Date;
}

/** Resolves calendar bounds and structured duration for offer creation. */
export function resolveOfferPeriod(input: OfferPeriodInput): ResolvedOfferPeriod {
  const startAt = input.startAt ?? new Date();

  if (input.priceType === "CUSTOM") {
    const durationValue = input.durationValue!;
    const durationUnit = input.durationUnit!;
    const endAt = input.endAt ?? durationToEndAt(startAt, durationValue, durationUnit);
    return {
      startAt,
      endAt,
      rentalDays: durationToRentalDays(durationValue, durationUnit),
      durationValue,
      durationUnit,
    };
  }

  const rentalDays = input.rentalDays!;
  const { durationValue, durationUnit } = standardDurationForPriceType(input.priceType, rentalDays);
  let endAt = input.endAt ?? derivedEndAt(startAt, rentalDays, startAt);

  if (input.priceType === "HOURLY" && input.startAt && input.endAt) {
    const hours = Math.max(1, Math.round((input.endAt.getTime() - startAt.getTime()) / MS_HOUR));
    return {
      startAt,
      endAt: input.endAt,
      rentalDays,
      durationValue: hours,
      durationUnit: "HOUR",
    };
  }

  return { startAt, endAt, rentalDays, durationValue, durationUnit };
}

/** True when endAt matches the structured duration formula from startAt. */
export function isPeriodConsistent(
  startAt: Date | null | undefined,
  endAt: Date | null | undefined,
  durationValue: number,
  durationUnit: ContractDurationUnit,
): boolean | null {
  if (!startAt || !endAt) return null;
  return durationToEndAt(startAt, durationValue, durationUnit).getTime() === endAt.getTime();
}
