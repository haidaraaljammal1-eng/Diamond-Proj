import { z } from "zod";
import type { ContractPriceType } from "../../types/contract.types";

export const offerFormSchema = z.object({
  rentalDays: z.coerce.number().int().positive().max(3650),
  agreedAmount: z.coerce.number().int().positive(),
});

export type OfferFormValues = z.infer<typeof offerFormSchema>;

export const PRICE_TYPES: readonly ContractPriceType[] = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "CUSTOM",
];

export function defaultDaysForPriceType(priceType: ContractPriceType): number {
  if (priceType === "DAILY") return 1;
  if (priceType === "WEEKLY") return 7;
  if (priceType === "MONTHLY") return 30;
  return 1;
}
