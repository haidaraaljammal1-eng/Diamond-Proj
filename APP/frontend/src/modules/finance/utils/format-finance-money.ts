/** Whole-AED finance display — consistent across Finance V1. */
export function formatFinanceAed(value: number): string {
  return `AED ${Math.round(value).toLocaleString("en-US")}`;
}

export function formatSignedFinanceAed(
  value: number,
  direction: "COLLECTION" | "EXPENSE" | "EXPENSE_REVERSAL",
): string {
  const prefix =
    direction === "EXPENSE" ? "- " : direction === "EXPENSE_REVERSAL" ? "+ " : "+ ";
  return `${prefix}${formatFinanceAed(value)}`;
}
