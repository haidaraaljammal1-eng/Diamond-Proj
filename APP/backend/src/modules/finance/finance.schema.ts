import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { OPEN_RECEIVABLE_SOURCE_TYPES } from "src/modules/finance/finance.constants";

const wholeAed = z.number().int().positive();

export const FinancePeriodQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  periodType: z.enum(["MONTH", "QUARTER", "YEAR", "CUSTOM"]).optional(),
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
  direction: z.enum(["COLLECTION", "EXPENSE", "EXPENSE_REVERSAL"]).optional(),
  sort: z.string().optional(),
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
  category: z.string().nullable(),
  description: z.string().nullable(),
  contractPaymentId: z.string().nullable(),
  maintenanceOrderId: z.number().int().nullable(),
  manualExpenseId: z.string().nullable(),
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

export const CorrectManualExpenseSchema = CreateManualExpenseSchema.extend({
  voidReason: z.string().trim().min(1).max(500),
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
});
