import type { ManualExpense, ManualExpenseCategory, FinancialLedgerKind } from "@prisma/client";
import type { OpenReceivableSourceType } from "src/modules/finance/finance.constants";

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

export function toManualExpenseDetail(
  expense: ManualExpense & {
    createdBy: { id: number; name: string | null; email: string };
    voidedBy: { id: number; name: string | null; email: string } | null;
    vehicle: { id: number; vehicleName: string | null; plateNumber: string | null } | null;
    attachment: {
      id: string;
      originalName: string;
      mimeType: string;
      size: number;
      createdAt: Date;
    } | null;
    correctionOfExpense: { id: string } | null;
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
  };
}
