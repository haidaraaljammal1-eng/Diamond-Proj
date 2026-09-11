import type {
  LedgerDirection,
  LedgerDisplaySource,
  LedgerKind,
  LedgerSourceType,
  ManualExpenseCategory,
  OpenReceivableSourceType,
} from "../types/finance.types";

type LabelTranslator = (key: string) => string;

export function receivableSourceLabel(
  sourceType: OpenReceivableSourceType,
  t: LabelTranslator,
): string {
  return t(`receivableSource.${sourceType}`);
}

/**
 * Open Receivable `paymentState` from Finance Backend:
 * `UNPAID` when no ContractPayment exists, otherwise latest
 * `PENDING | PROCESSING | CONFIRMED | FAILED | CANCELLED`.
 */
export const RECEIVABLE_PAYMENT_STATES = [
  "UNPAID",
  "PENDING",
  "PROCESSING",
  "CONFIRMED",
  "FAILED",
  "CANCELLED",
] as const;

export type ReceivablePaymentState = (typeof RECEIVABLE_PAYMENT_STATES)[number];

export function receivablePaymentStateLabel(
  state: string,
  t: LabelTranslator,
): string {
  if (!RECEIVABLE_PAYMENT_STATES.includes(state as ReceivablePaymentState)) {
    return "—";
  }
  return t(`receivablePaymentState.${state}`);
}

export const LEDGER_DISPLAY_SOURCES: LedgerDisplaySource[] = [
  "RENTAL_PAYMENT",
  "RENEWAL_PAYMENT",
  "RECONCILIATION_PAYMENT",
  "POST_CLOSE_RECEIVABLE_PAYMENT",
  "MAINTENANCE_EXPENSE",
  "MANUAL_EXPENSE",
];

/** Maps backend `kind` to the Source column origin — reversals stay Manual Expense. */
export function ledgerSourceFromKind(kind: string): LedgerDisplaySource | null {
  if (kind === "MANUAL_EXPENSE_REVERSAL" || kind === "MANUAL_EXPENSE") {
    return "MANUAL_EXPENSE";
  }
  if (kind === "MAINTENANCE_EXPENSE") return "MAINTENANCE_EXPENSE";
  if (kind === "RENTAL_PAYMENT") return "RENTAL_PAYMENT";
  if (kind === "RENEWAL_PAYMENT") return "RENEWAL_PAYMENT";
  if (kind === "RECONCILIATION_PAYMENT") return "RECONCILIATION_PAYMENT";
  if (kind === "POST_CLOSE_RECEIVABLE_PAYMENT") return "POST_CLOSE_RECEIVABLE_PAYMENT";
  return null;
}

export function ledgerKindLabel(kind: string, t: LabelTranslator): string {
  const source = ledgerSourceFromKind(kind);
  if (source) return ledgerSourceLabel(source, t);
  const key = `ledgerKind.${kind}`;
  const translated = t(key);
  return translated === key ? kind : translated;
}

export function ledgerSourceLabel(
  source: LedgerDisplaySource,
  t: LabelTranslator,
): string {
  return t(`ledgerSource.${source}`);
}

/** Map independent Movement + Source UI filters onto existing ledger query params. */
export function toLedgerApiFilters(
  movement: LedgerDirection | null,
  source: LedgerDisplaySource | null,
): {
  kind: LedgerKind | null;
  sourceType: LedgerSourceType | null;
  direction: LedgerDirection | null;
} {
  if (source === "MANUAL_EXPENSE") {
    if (movement === "EXPENSE_REVERSAL") {
      return {
        kind: "MANUAL_EXPENSE_REVERSAL",
        sourceType: null,
        direction: "EXPENSE_REVERSAL",
      };
    }
    if (movement === "EXPENSE") {
      return { kind: "MANUAL_EXPENSE", sourceType: null, direction: "EXPENSE" };
    }
    if (movement === "COLLECTION") {
      return { kind: "MANUAL_EXPENSE", sourceType: null, direction: "COLLECTION" };
    }
    return { kind: null, sourceType: "MANUAL_EXPENSE", direction: null };
  }

  if (source === "MAINTENANCE_EXPENSE") {
    return { kind: "MAINTENANCE_EXPENSE", sourceType: null, direction: movement };
  }

  if (source) {
    return { kind: source, sourceType: null, direction: movement };
  }

  return { kind: null, sourceType: null, direction: movement };
}

export function ledgerMovementLabel(
  direction: LedgerDirection,
  t: LabelTranslator,
): string {
  return t(`ledgerMovement.${direction}`);
}

export function expenseCategoryLabel(
  category: string,
  t: LabelTranslator,
): string {
  const key = `expenseCategory.${category}`;
  const translated = t(key);
  return translated === key ? category : translated;
}

export const MANUAL_EXPENSE_CATEGORIES: ManualExpenseCategory[] = [
  "VEHICLE_CLEANING",
  "FUEL",
  "PARKING",
  "GOVERNMENT_FEES",
  "OFFICE_ADMIN",
  "MARKETING",
  "OPERATIONS",
  "OTHER",
];

export function formatVehicleLabel(
  vehicle: {
    vehicleName: string | null;
    plateNumber: string | null;
  } | null,
): string | null {
  if (!vehicle) return null;
  const name = vehicle.vehicleName?.trim();
  const plate = vehicle.plateNumber?.trim();
  if (name && plate) return `${name} · ${plate}`;
  return name ?? plate ?? null;
}
