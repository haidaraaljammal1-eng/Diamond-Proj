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

/** Operational Ledger amount: voided Manual Expense is unsigned and struck through in CSS. */
export function formatOperationalLedgerAmount(
  amount: number,
  entry: {
    kind: string;
    direction: "COLLECTION" | "EXPENSE" | "EXPENSE_REVERSAL";
    manualExpenseStatus?: "ACTIVE" | "VOID" | null;
  },
): string {
  if (entry.kind === "MANUAL_EXPENSE" && entry.manualExpenseStatus === "VOID") {
    return formatFinanceAed(amount);
  }
  return formatSignedFinanceAed(amount, entry.direction);
}
