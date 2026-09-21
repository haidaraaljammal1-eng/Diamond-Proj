import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { OPEN_RECEIVABLE_SOURCE_TYPES } from "src/modules/finance/finance.constants";

const wholeAed = z.number().int().positive();

/**
 * Company scope for every Finance read.
 *
 * - nothing        → ALL: UNIQUE + ELITE + GENERAL
 * - `companyId=N`  → that operating company only
 * - `companyScope=GENERAL` → `companyId IS NULL` only
 *
 * GENERAL is a classification, not a company, so it never travels as a real
 * `companyId`. Sending both is a contradiction and is refused rather than
 * silently resolved.
 */
export const FinanceCompanyScopeShape = {
  companyId: z.coerce.number().int().positive().optional(),
  companyScope: z.enum(["ALL", "GENERAL"]).optional(),
} as const;

export const FinanceCompanyRefSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  displayName: z.string(),
  accentColor: z.string(),
});

export const FinancePeriodQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  periodType: z.enum(["MONTH", "QUARTER", "YEAR", "CUSTOM"]).optional(),
  ...FinanceCompanyScopeShape,
});

export const FinanceSummarySchema = z.object({
  period: z.object({ from: z.date(), to: z.date() }),
  collected: z.number().int(),
  outstanding: z.number().int(),
  expenses: z.number().int(),
  netMovement: z.number().int(),
  openReceivablesCount: z.number().int(),
  currency: z.string(),
  outstandingAsOf: z.date(),
});

export const FinanceAnalyticsSchema = z.object({
  period: z.object({ from: z.date(), to: z.date() }),
  currency: z.string(),
  trend: z.array(
    z.object({
      date: z.string(),
      collected: z.number().int(),
      expenses: z.number().int(),
      netMovement: z.number().int(),
    }),
  ),
  outstandingBreakdown: z.array(
    z.object({
      sourceType: z.enum(OPEN_RECEIVABLE_SOURCE_TYPES),
      count: z.number().int(),
      amount: z.number().int(),
    }),
  ),
  expenseBreakdown: z.array(
    z.object({
      category: z.string(),
      amount: z.number().int(),
    }),
  ),
});

export const LedgerListQuerySchema = PaginationQuerySchema.extend({
  ...FinancePeriodQuerySchema.shape,
  search: z.string().optional(),
  kind: z
    .enum([
      "RENTAL_PAYMENT",
      "RENEWAL_PAYMENT",
      "RECONCILIATION_PAYMENT",
      "POST_CLOSE_RECEIVABLE_PAYMENT",
      "MAINTENANCE_EXPENSE",
      "MANUAL_EXPENSE",
      "MANUAL_EXPENSE_REVERSAL",
    ])
    .optional(),
  sourceType: z.enum(["CONTRACT_PAYMENT", "MAINTENANCE_ORDER", "MANUAL_EXPENSE"]).optional(),
  direction: z.enum(["COLLECTION", "EXPENSE", "EXPENSE_REVERSAL", "VOIDED"]).optional(),
  sort: z.string().optional(),
  ...FinanceCompanyScopeShape,
});

export const LedgerEntrySchema = z.object({
  id: z.string(),
  kind: z.string(),
  direction: z.enum(["COLLECTION", "EXPENSE", "EXPENSE_REVERSAL"]),
  sourceType: z.string(),
  sourceId: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  occurredAt: z.date(),
  contract: z
    .object({
      id: z.string(),
      contractNumber: z.string(),
    })
    .nullable(),
  customer: z
    .object({
      id: z.number().int(),
      name: z.string(),
    })
    .nullable(),
  vehicle: z
    .object({
      id: z.number().int(),
      vehicleName: z.string().nullable(),
      plateNumber: z.string().nullable(),
    })
    .nullable(),
  /** Persisted at write time from the entry's authoritative source. `null` = GENERAL. */
  company: FinanceCompanyRefSchema.nullable(),
  category: z.string().nullable(),
  description: z.string().nullable(),
  contractPaymentId: z.string().nullable(),
  maintenanceOrderId: z.number().int().nullable(),
  manualExpenseId: z.string().nullable(),
  /** Read projection: VOID originals are not active Expense movements. */
  manualExpenseStatus: z.enum(["ACTIVE", "VOID"]).nullable(),
});

export const OpenReceivableSchema = z.object({
  sourceType: z.enum(OPEN_RECEIVABLE_SOURCE_TYPES),
  sourceId: z.string(),
  contractId: z.string(),
  contractNumber: z.string(),
  customer: z
    .object({
      id: z.number().int(),
      name: z.string(),
    })
    .nullable(),
  vehicle: z
    .object({
      id: z.number().int(),
      vehicleName: z.string().nullable(),
      plateNumber: z.string().nullable(),
    })
    .nullable(),
  /** Derived from the owning Contract; receivables store no company column. */
  company: FinanceCompanyRefSchema.nullable(),
  amountDue: z.number().int(),
  amountPaid: z.number().int(),
  outstandingAmount: z.number().int(),
  currency: z.string(),
  obligationCreatedAt: z.date(),
  paymentState: z.string(),
  paymentPurpose: z.string(),
  latestPaymentId: z.string().nullable(),
});

export const OpenReceivablesQuerySchema = PaginationQuerySchema.extend({
  search: z.string().optional(),
  sourceType: z.enum(OPEN_RECEIVABLE_SOURCE_TYPES).optional(),
  sort: z.string().optional(),
  ...FinanceCompanyScopeShape,
});

export const ManualExpenseCategorySchema = z.enum([
  "VEHICLE_CLEANING",
  "FUEL",
  "PARKING",
  "GOVERNMENT_FEES",
  "OFFICE_ADMIN",
  "MARKETING",
  "OPERATIONS",
  "OTHER",
]);

export const CreateManualExpenseSchema = z.object({
  amount: wholeAed,
  category: ManualExpenseCategorySchema,
  recognizedAt: z.coerce.date(),
  description: z.string().trim().min(1).max(500),
  vehicleId: z.number().int().positive().optional(),
  vendorName: z.string().trim().max(200).optional(),
  receiptNumber: z.string().trim().max(100).optional(),
  attachmentId: z.uuid().optional(),
  note: z.string().trim().max(1000).optional(),
});

export const VoidManualExpenseSchema = z.object({
  voidReason: z.string().trim().min(1).max(500),
});

export const CorrectManualExpenseSchema = z.object({
  amount: wholeAed,
  category: ManualExpenseCategorySchema,
  recognizedAt: z.coerce.date(),
  description: z.string().trim().min(1).max(500),
  vehicleId: z.number().int().positive().nullable().optional(),
  vendorName: z.string().trim().max(200).nullable().optional(),
  receiptNumber: z.string().trim().max(100).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const ManualExpenseDetailSchema = z.object({
  id: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  category: ManualExpenseCategorySchema,
  recognizedAt: z.date(),
  description: z.string(),
  vehicle: z
    .object({
      id: z.number().int(),
      vehicleName: z.string().nullable(),
      plateNumber: z.string().nullable(),
    })
    .nullable(),
  /**
   * Backend-resolved classification. A Vehicle makes it that Vehicle's company;
   * no Vehicle makes it `null`, which the frontend renders as GENERAL / عام.
   * There is no company input on create or correct.
   */
  company: FinanceCompanyRefSchema.nullable(),
  vendorName: z.string().nullable(),
  receiptNumber: z.string().nullable(),
  attachment: z
    .object({
      id: z.string(),
      originalName: z.string(),
      mimeType: z.string(),
      size: z.number().int(),
      createdAt: z.date(),
    })
    .nullable(),
  note: z.string().nullable(),
  status: z.enum(["ACTIVE", "VOID"]),
  correctionOfExpenseId: z.string().nullable(),
  voidedAt: z.date().nullable(),
  voidReason: z.string().nullable(),
  createdBy: z.object({
    id: z.number().int(),
    name: z.string().nullable(),
    email: z.string(),
  }),
  voidedBy: z
    .object({
      id: z.number().int(),
      name: z.string().nullable(),
      email: z.string(),
    })
    .nullable(),
  createdAt: z.date(),
  correctionHistory: z.array(
    z.object({
      id: z.string(),
      changedAt: z.date(),
      changedBy: z.object({
        id: z.number().int(),
        name: z.string().nullable(),
        email: z.string(),
      }),
      changes: z.array(
        z.object({
          field: z.string(),
          before: z.union([
            z.string(),
            z.number(),
            z.boolean(),
            z.null(),
            z.object({
              id: z.number().int(),
              vehicleName: z.string().nullable(),
              plateNumber: z.string().nullable(),
            }),
          ]),
          after: z.union([
            z.string(),
            z.number(),
            z.boolean(),
            z.null(),
            z.object({
              id: z.number().int(),
              vehicleName: z.string().nullable(),
              plateNumber: z.string().nullable(),
            }),
          ]),
        }),
      ),
    }),
  ),
});
