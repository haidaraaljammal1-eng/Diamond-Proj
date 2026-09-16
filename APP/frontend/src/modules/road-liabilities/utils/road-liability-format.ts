import { formatAed } from "../../dashboard/utils/money.ts";
import type { RoadLiabilityListItemDto } from "../types/road-liabilities.types.ts";

export type AmountDisplay =
  | { kind: "awaiting" }
  | { kind: "amount"; formatted: string };

/**
 * GPS predictions with a null amount must never render as AED 0.
 * Confirmed amounts always come from the backend value — never inferred.
 */
export function formatLiabilityAmount(
  item: Pick<RoadLiabilityListItemDto, "amount">,
): AmountDisplay {
  if (item.amount == null) return { kind: "awaiting" };
  return { kind: "amount", formatted: formatAed(item.amount) };
}

export function formatConfirmedOpenAmount(amount: number): string {
  return formatAed(amount);
}

export function toValidOccurredDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}
