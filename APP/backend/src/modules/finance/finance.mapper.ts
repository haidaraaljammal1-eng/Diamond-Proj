import type { ManualExpense, ManualExpenseCategory, FinancialLedgerKind, Prisma } from "@prisma/client";
import type { OpenReceivableSourceType } from "src/modules/finance/finance.constants";
import type { CompanyRef } from "src/modules/operating-companies/company-ref";

/**
 * Resolved company classification for a financial record.
 *
 * `null` is GENERAL: the record has no authoritative company-bearing source
 * behind it. The Backend resolves this — the frontend never infers a company
 * from the Vehicle, and no synthetic `{ code: "GENERAL" }` object is returned.
 */
export function toFinanceCompanyRef(company: CompanyRef | null | undefined): CompanyRef | null {
  if (!company) return null;
  return {
    id: company.id,
    code: company.code,
    displayName: company.displayName,
    accentColor: company.accentColor,
  };
}

export interface CustomerSummary {
  id: number;
  name: string;
}

export interface VehicleSummary {
  id: number;
  vehicleName: string | null;
  plateNumber: string | null;
}

export interface ContractSummary {
  id: string;
  contractNumber: string;
}

export interface OpenReceivableRow {
  sourceType: OpenReceivableSourceType;
  sourceId: string;
  contractId: string;
  contractNumber: string;
  customer: CustomerSummary | null;
  vehicle: VehicleSummary | null;
  company: CompanyRef | null;
  amountDue: number;
  amountPaid: number;
  outstandingAmount: number;
  currency: string;
  obligationCreatedAt: Date;
  paymentState: string;
  paymentPurpose: string;
  latestPaymentId: string | null;
}

export function toCustomerSummary(
  customer: { id: number; name: string } | null | undefined,
): CustomerSummary | null {
  if (!customer) return null;
  return { id: customer.id, name: customer.name };
}

export function toVehicleSummary(
  vehicle: { id: number; vehicleName: string | null; plateNumber: string | null } | null | undefined,
): VehicleSummary | null {
  if (!vehicle) return null;
  return {
    id: vehicle.id,
    vehicleName: vehicle.vehicleName,
    plateNumber: vehicle.plateNumber,
  };
}

export function ledgerDirection(kind: FinancialLedgerKind): "COLLECTION" | "EXPENSE" | "EXPENSE_REVERSAL" {
  if (
    kind === "RENTAL_PAYMENT" ||
    kind === "RENEWAL_PAYMENT" ||
    kind === "RECONCILIATION_PAYMENT" ||
    kind === "POST_CLOSE_RECEIVABLE_PAYMENT"
  ) {
    return "COLLECTION";
  }
  if (kind === "MANUAL_EXPENSE_REVERSAL") return "EXPENSE_REVERSAL";
  return "EXPENSE";
}

export function manualExpenseCategoryLabel(category: ManualExpenseCategory): string {
  return category;
}

export const MANUAL_EXPENSE_CHANGE_FIELDS = [
  "amount",
  "category",
  "recognizedAt",
  "description",
  "vehicle",
  "vendorName",
  "receiptNumber",
  "note",
] as const;

export type ManualExpenseChangeField = (typeof MANUAL_EXPENSE_CHANGE_FIELDS)[number];

export type ManualExpenseChangeValue =
  | string
  | number
  | boolean
  | { id: number; vehicleName: string | null; plateNumber: string | null }
  | null;

export interface ManualExpenseFieldChange {
  field: ManualExpenseChangeField;
  before: ManualExpenseChangeValue;
  after: ManualExpenseChangeValue;
}

function toChangeValue(value: unknown): ManualExpenseChangeValue {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "object" && !Array.isArray(value) && "id" in value) {
    const vehicle = value as { id: unknown; vehicleName?: unknown; plateNumber?: unknown };
    if (typeof vehicle.id === "number") {
      return {
        id: vehicle.id,
        vehicleName: typeof vehicle.vehicleName === "string" ? vehicle.vehicleName : null,
        plateNumber: typeof vehicle.plateNumber === "string" ? vehicle.plateNumber : null,
      };
    }
  }
  return null;
}

export function toCorrectionHistoryChanges(raw: Prisma.JsonValue): ManualExpenseFieldChange[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const entries: ManualExpenseFieldChange[] = [];
  for (const field of MANUAL_EXPENSE_CHANGE_FIELDS) {
    const value = (raw as Record<string, unknown>)[field];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const pair = value as { before?: unknown; after?: unknown };
    if (!("before" in pair) && !("after" in pair)) continue;
    entries.push({
      field,
      before: toChangeValue(pair.before),
      after: toChangeValue(pair.after),
    });
  }
  return entries;
}

type ExpenseStaff = { id: number; name: string | null; email: string };

export function toManualExpenseDetail(
  expense: ManualExpense & {
    createdBy: ExpenseStaff;
    voidedBy: ExpenseStaff | null;
    vehicle: { id: number; vehicleName: string | null; plateNumber: string | null } | null;
    company: CompanyRef | null;
    attachment: {
      id: string;
      originalName: string;
      mimeType: string;
      size: number;
      createdAt: Date;
    } | null;
    correctionOfExpense: { id: string } | null;
    revisions?: Array<{
      id: string;
      changedAt: Date;
      changes: Prisma.JsonValue;
      changedBy: ExpenseStaff;
    }>;
  },
) {
  return {
    id: expense.id,
    amount: expense.amount,
    currency: expense.currency,
    category: expense.category,
    recognizedAt: expense.recognizedAt,
    description: expense.description,
    vehicle: toVehicleSummary(expense.vehicle),
    /** Resolved by the Backend from the optional Vehicle. `null` = GENERAL. */
    company: toFinanceCompanyRef(expense.company),
    vendorName: expense.vendorName,
    receiptNumber: expense.receiptNumber,
    attachment: expense.attachment
      ? {
          id: expense.attachment.id,
          originalName: expense.attachment.originalName,
          mimeType: expense.attachment.mimeType,
          size: expense.attachment.size,
          createdAt: expense.attachment.createdAt,
        }
      : null,
    note: expense.note,
    status: expense.status,
    correctionOfExpenseId: expense.correctionOfExpenseId,
    voidedAt: expense.voidedAt,
    voidReason: expense.voidReason,
    createdBy: {
      id: expense.createdBy.id,
      name: expense.createdBy.name,
      email: expense.createdBy.email,
    },
    voidedBy: expense.voidedBy
      ? {
          id: expense.voidedBy.id,
          name: expense.voidedBy.name,
          email: expense.voidedBy.email,
        }
      : null,
    createdAt: expense.createdAt,
    correctionHistory: (expense.revisions ?? []).map((revision) => ({
      id: revision.id,
      changedAt: revision.changedAt,
      changedBy: {
        id: revision.changedBy.id,
        name: revision.changedBy.name,
        email: revision.changedBy.email,
      },
      changes: toCorrectionHistoryChanges(revision.changes),
    })),
  };
}
