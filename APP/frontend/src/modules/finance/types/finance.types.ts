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

/** Operational Movement filter — VOIDED is UI-only; accounting direction stays EXPENSE. */
export type LedgerMovementFilter = LedgerDirection | "VOIDED";

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

/** Origin of a ledger row — never a movement label such as Expense Reversal. */
export type LedgerDisplaySource =
  | "RENTAL_PAYMENT"
  | "RENEWAL_PAYMENT"
  | "RECONCILIATION_PAYMENT"
  | "POST_CLOSE_RECEIVABLE_PAYMENT"
  | "MAINTENANCE_EXPENSE"
  | "MANUAL_EXPENSE";

export type FinancePeriodPreset = "today" | "week" | "month" | "custom";

/** Real operating company. GENERAL is `null`, never a synthetic company object. */
export interface FinanceCompanyRef {
  id: number;
  code: string;
  displayName: string;
  accentColor: string;
}

/**
 * Page-level Finance scope. ALL sends no company parameter so the backend
 * includes UNIQUE, ELITE and GENERAL. GENERAL is not an operating company.
 */
export type FinanceCompanyScopeSelection =
  | { kind: "ALL" }
  | { kind: "COMPANY"; companyId: number }
  | { kind: "GENERAL" };

export const ALL_FINANCE_SCOPE: FinanceCompanyScopeSelection = { kind: "ALL" };

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
  /** Derived from Contract.company. `null` is GENERAL and yields no contract receivables. */
  company?: FinanceCompanyRef | null;
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
  /** Persisted classification. `null` is GENERAL. Absent only on older simulated rows. */
  company?: FinanceCompanyRef | null;
  category: string | null;
  description: string | null;
  contractPaymentId: string | null;
  maintenanceOrderId: number | null;
  manualExpenseId: string | null;
  vendorName?: string | null;
  reference?: string | null;
  /** Present when the row is tied to a ManualExpense. VOID originals are not active Expense. */
  manualExpenseStatus?: "ACTIVE" | "VOID" | null;
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
  /** Backend-resolved. A Vehicle selects that Vehicle's company; no Vehicle is GENERAL (`null`). */
  company?: FinanceCompanyRef | null;
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
  correctionHistory: ManualExpenseRevisionDto[];
}

export type ManualExpenseChangeField =
  | "amount"
  | "category"
  | "recognizedAt"
  | "description"
  | "vehicle"
  | "vendorName"
  | "receiptNumber"
  | "note";

export interface ManualExpenseFieldChangeDto {
  field: ManualExpenseChangeField | string;
  before: unknown;
  after: unknown;
}

export interface ManualExpenseRevisionDto {
  id: string;
  changedAt: string;
  changedBy: { id: number; name: string | null; email: string };
  changes: ManualExpenseFieldChangeDto[];
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

export interface CorrectManualExpensePayload {
  amount: number;
  category: ManualExpenseCategory;
  recognizedAt: string;
  description: string;
  vehicleId?: number | null;
  vendorName?: string | null;
  receiptNumber?: string | null;
  note?: string | null;
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
  /** UI Source filter (origin). Mapped to backend `kind` / `sourceType` at request time. */
  displaySource: LedgerDisplaySource | null;
  kind: LedgerKind | null;
  sourceType: LedgerSourceType | null;
  direction: LedgerMovementFilter | null;
  sort: string;
}

export type ReceivableSortKey =
  | "obligationCreatedAt:desc"
  | "obligationCreatedAt:asc"
  | "amount:desc"
  | "amount:asc";
