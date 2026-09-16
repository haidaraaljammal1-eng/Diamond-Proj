import type { ContractPaymentPurpose, FinancialLedgerKind } from "@prisma/client";

export const FINANCE_CURRENCY = "AED";

export const COLLECTION_LEDGER_KINDS: FinancialLedgerKind[] = [
  "RENTAL_PAYMENT",
  "RENEWAL_PAYMENT",
  "RECONCILIATION_PAYMENT",
  "POST_CLOSE_RECEIVABLE_PAYMENT",
];

export const EXPENSE_LEDGER_KINDS: FinancialLedgerKind[] = [
  "MAINTENANCE_EXPENSE",
  "MANUAL_EXPENSE",
];

export const PAYMENT_PURPOSE_TO_LEDGER_KIND: Record<ContractPaymentPurpose, FinancialLedgerKind> = {
  RENTAL: "RENTAL_PAYMENT",
  RENEWAL: "RENEWAL_PAYMENT",
  RECONCILIATION: "RECONCILIATION_PAYMENT",
  POST_CLOSE_RECEIVABLE: "POST_CLOSE_RECEIVABLE_PAYMENT",
};

export const OPEN_RECEIVABLE_SOURCE_TYPES = [
  "RENTAL",
  "RENEWAL",
  "RECONCILIATION",
  "POST_CLOSE_RECEIVABLE",
] as const;

export type OpenReceivableSourceType = (typeof OPEN_RECEIVABLE_SOURCE_TYPES)[number];

export const MAX_FINANCE_PERIOD_DAYS = 366;
