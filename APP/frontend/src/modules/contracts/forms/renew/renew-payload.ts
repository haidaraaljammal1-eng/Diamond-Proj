import type { RenewPayload } from "../../types/contract.types";
import type { RenewFormValues } from "./renew.schema";

export function toRenewPayload(values: RenewFormValues): RenewPayload {
  return {
    additionalDurationValue: values.durationValue,
    additionalDurationUnit: values.durationUnit,
    additionalAmount: values.additionalAmount,
  };
}

const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

export function previewRenewalEndAt(
  previousEndAt: Date,
  durationValue: number,
  durationUnit: "HOUR" | "DAY",
): Date {
  const ms = durationUnit === "HOUR" ? durationValue * MS_HOUR : durationValue * MS_DAY;
  return new Date(previousEndAt.getTime() + ms);
}
