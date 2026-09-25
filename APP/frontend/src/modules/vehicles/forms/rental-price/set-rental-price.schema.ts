import { z } from "zod";
import type {
  ContractDurationUnit,
  ContractPriceType,
} from "@/modules/contracts/types/contract.types";

function parsePositiveInt(value: string): number | typeof Number.NaN {
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) return Number.NaN;
  return parsed;
}

export const DURATION_UNITS: readonly ContractDurationUnit[] = [
  "HOUR",
  "DAY",
  "WEEK",
  "MONTH",
];

export const customRentalPriceFormSchema = z
  .object({
    durationValue: z.string().trim().min(1, { message: "required" }),
    durationUnit: z.enum(["HOUR", "DAY", "WEEK", "MONTH"], { message: "required" }),
    agreedAmount: z.string().trim().min(1, { message: "required" }),
  })
  .superRefine((values, ctx) => {
    const durationValue = parsePositiveInt(values.durationValue);
    if (Number.isNaN(durationValue) || durationValue > 3650) {
      ctx.addIssue({
        code: "custom",
        message: "invalidDurationValue",
        path: ["durationValue"],
      });
    }

    const agreedAmount = parsePositiveInt(values.agreedAmount);
    if (Number.isNaN(agreedAmount)) {
      ctx.addIssue({
        code: "custom",
        message: "positiveAmount",
        path: ["agreedAmount"],
      });
    }
  });

export type CustomRentalPriceFormValues = z.infer<typeof customRentalPriceFormSchema>;

export function toCustomRentalPricePayload(
  values: CustomRentalPriceFormValues,
): { durationValue: number; durationUnit: ContractDurationUnit; agreedAmount: number } {
  return {
    durationValue: Number(values.durationValue.trim()),
    durationUnit: values.durationUnit,
    agreedAmount: Number(values.agreedAmount.trim()),
  };
}

/** @deprecated Use customRentalPriceFormSchema — kept for imports migrating off coerce schema. */
export const customRentalPriceSchema = customRentalPriceFormSchema;

export type CustomRentalPriceValues = CustomRentalPriceFormValues;

export const PRICE_TYPES: readonly ContractPriceType[] = [
  "HOURLY",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "CUSTOM",
];

export function defaultDaysForPriceType(priceType: ContractPriceType): number {
  if (priceType === "HOURLY") return 1;
  if (priceType === "DAILY") return 1;
  if (priceType === "WEEKLY") return 7;
  if (priceType === "MONTHLY") return 30;
  return 1;
}

export function priceTypeChipKey(
  priceType: ContractPriceType,
): "hour" | "day" | "week" | "month" | "custom" {
  if (priceType === "HOURLY") return "hour";
  if (priceType === "DAILY") return "day";
  if (priceType === "WEEKLY") return "week";
  if (priceType === "MONTHLY") return "month";
  return "custom";
}

export function isStandardPriceType(priceType: ContractPriceType): boolean {
  return priceType !== "CUSTOM";
}
