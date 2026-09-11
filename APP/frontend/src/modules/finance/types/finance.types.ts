export type OpenReceivableSourceType =
  | "RENTAL"
  | "RENEWAL"
  | "RECONCILIATION"
  | "POST_CLOSE_RECEIVABLE";

export type ManualExpenseCategory =
  | "VEHICLE_CLEANING"
  | "FUEL"
  | "PARKING"
  | "GOVERNMENT_FEES"
  | "OFFICE_ADMIN"
  | "MARKETING"
  | "OPERATIONS"
  | "OTHER";

export type LedgerDirection = "COLLECTION" | "EXPENSE" | "EXPENSE_REVERSAL";

export type LedgerKind =
  | "RENTAL_PAYMENT"
  | "RENEWAL_PAYMENT"
  | "RECONCILIATION_PAYMENT"
  | "POST_CLOSE_RECEIVABLE_PAYMENT"
  | "MAINTENANCE_EXPENSE"
  | "MANUAL_EXPENSE"
  | "MANUAL_EXPENSE_REVERSAL";

export type LedgerSourceType =
  | "CONTRACT_PAYMENT"
  | "MAINTENANCE_ORDER"
  | "MANUAL_EXPENSE";

export type FinancePeriodPreset = "today" | "week" | "month" | "custom";

export interface FinancePeriodRange {
  from: string;
  to: string;
}

export interface FinanceSummaryDto {
  period: { from: string; to: string };
  collected: number;
  outstanding: number;
  expenses: number;
  netMovement: number;
  openReceivablesCount: number;
  currency: string;
  outstandingAsOf: string;
}

export interface FinanceTrendPointDto {
  date: string;
  collected: number;
  expenses: number;
  netMovement: number;
}

export interface FinanceOutstandingBreakdownDto {
  sourceType: OpenReceivableSourceType;
  count: number;
  amount: number;
}

export interface FinanceExpenseBreakdownDto {
  category: string;
  amount: number;
}

export interface FinanceAnalyticsDto {
  period: { from: string; to: string };
  currency: string;
  trend: FinanceTrendPointDto[];
  outstandingBreakdown: FinanceOutstandingBreakdownDto[];
  expenseBreakdown: FinanceExpenseBreakdownDto[];
}

export interface OpenReceivableDto {
  sourceType: OpenReceivableSourceType;
  sourceId: string;
  contractId: string;
  contractNumber: string;
  customer: { id: number; name: string } | null;
  vehicle: {
    id: number;
    vehicleName: string | null;
    plateNumber: string | null;
  } | null;
  amountDue: number;
  amountPaid: number;
  outstandingAmount: number;
  currency: string;
  obligationCreatedAt: string;
  paymentState: string;
  paymentPurpose: string;
  latestPaymentId: string | null;
}

export interface LedgerEntryDto {
  id: string;
  kind: string;
  direction: LedgerDirection;
  sourceType: string;
  sourceId: string;
  amount: number;
  currency: string;
  occurredAt: string;
  contract: { id: string; contractNumber: string } | null;
  customer: { id: number; name: string } | null;
  vehicle: {
    id: number;
    vehicleName: string | null;
    plateNumber: string | null;
  } | null;
  category: string | null;
  description: string | null;
  contractPaymentId: string | null;
  maintenanceOrderId: number | null;
  manualExpenseId: string | null;
}

export interface ManualExpenseAttachmentDto {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface ManualExpenseDetailDto {
  id: string;
  amount: number;
  currency: string;
  category: ManualExpenseCategory;
  recognizedAt: string;
  description: string;
  vehicle: {
    id: number;
    vehicleName: string | null;
    plateNumber: string | null;
  } | null;
  vendorName: string | null;
  receiptNumber: string | null;
  attachment: ManualExpenseAttachmentDto | null;
  note: string | null;
  status: "ACTIVE" | "VOID";
  correctionOfExpenseId: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdBy: { id: number; name: string | null; email: string };
  voidedBy: { id: number; name: string | null; email: string } | null;
  createdAt: string;
}

export interface CreateManualExpensePayload {
  amount: number;
  category: ManualExpenseCategory;
  recognizedAt: string;
  description: string;
  vehicleId?: number;
  vendorName?: string;
  receiptNumber?: string;
  attachmentId?: string;
  note?: string;
}

export interface VoidManualExpensePayload {
  voidReason: string;
}

export interface CorrectManualExpensePayload extends CreateManualExpensePayload {
  voidReason: string;
}

export interface OpenReceivablesQuery {
  page: number;
  pageSize: number;
  search: string;
  sourceType: OpenReceivableSourceType | null;
  sort: string;
}

export interface LedgerQuery {
  page: number;
  pageSize: number;
  search: string;
  from: string;
  to: string;
  kind: LedgerKind | null;
  sourceType: LedgerSourceType | null;
  direction: LedgerDirection | null;
  sort: string;
}

export type ReceivableSortKey =
  | "obligationCreatedAt:desc"
  | "obligationCreatedAt:asc"
  | "amount:desc"
  | "amount:asc";
