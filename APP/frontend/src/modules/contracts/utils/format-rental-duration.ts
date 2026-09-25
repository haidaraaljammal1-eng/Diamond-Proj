export type ContractDurationUnit = "HOUR" | "DAY" | "WEEK" | "MONTH";

export interface RentalDuration {
  durationValue: number;
  durationUnit: ContractDurationUnit;
}

type DurationTranslator = (
  key: "hours" | "days" | "weeks" | "months",
  values: { count: number },
) => string;

const UNIT_MESSAGE_KEY: Record<ContractDurationUnit, "hours" | "days" | "weeks" | "months"> = {
  HOUR: "hours",
  DAY: "days",
  WEEK: "weeks",
  MONTH: "months",
};

/** Formats structured rental duration for staff/public contract surfaces. */
export function formatRentalDuration(
  duration: RentalDuration,
  t: DurationTranslator,
): string {
  return t(UNIT_MESSAGE_KEY[duration.durationUnit], { count: duration.durationValue });
}

/** Legacy fallback when only calendar days exist (pre-migration frozen views). */
export function formatRentalDurationFromDays(
  rentalDays: number,
  t: DurationTranslator,
): string {
  return t("days", { count: rentalDays });
}
