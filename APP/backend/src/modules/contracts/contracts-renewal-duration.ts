import type { ContractDurationUnit } from "@prisma/client";
import {
  durationToEndAt,
  durationToRentalDays,
} from "src/modules/contracts/contracts-duration";

export type RenewalDurationUnit = "HOUR" | "DAY";

export interface RenewDurationInput {
  additionalDays?: number;
  additionalDurationValue?: number;
  additionalDurationUnit?: RenewalDurationUnit;
}

export interface ResolvedRenewalDuration {
  durationValue: number;
  durationUnit: RenewalDurationUnit;
  rentalDayIncrement: number;
}

export function resolveRenewalDurationInput(input: RenewDurationInput): ResolvedRenewalDuration {
  if (input.additionalDurationValue != null) {
    const unit = input.additionalDurationUnit ?? "DAY";
    const value = input.additionalDurationValue;
    return {
      durationValue: value,
      durationUnit: unit,
      rentalDayIncrement: durationToRentalDays(value, unit as ContractDurationUnit),
    };
  }
  const days = input.additionalDays!;
  return {
    durationValue: days,
    durationUnit: "DAY",
    rentalDayIncrement: days,
  };
}

export function renewalNewEndAt(previousEndAt: Date, resolved: ResolvedRenewalDuration): Date {
  return durationToEndAt(
    previousEndAt,
    resolved.durationValue,
    resolved.durationUnit as ContractDurationUnit,
  );
}

export function buildRenewalPersistenceFields(
  input: RenewDurationInput & { additionalAmount: number },
  previousEndAt: Date,
): {
  additionalDays: number;
  additionalDurationValue: number;
  additionalDurationUnit: RenewalDurationUnit;
  additionalAmount: number;
  previousEndAt: Date;
  newEndAt: Date;
} {
  const resolved = resolveRenewalDurationInput(input);
  return {
    additionalDays: resolved.rentalDayIncrement,
    additionalDurationValue: resolved.durationValue,
    additionalDurationUnit: resolved.durationUnit,
    additionalAmount: input.additionalAmount,
    previousEndAt,
    newEndAt: renewalNewEndAt(previousEndAt, resolved),
  };
}
