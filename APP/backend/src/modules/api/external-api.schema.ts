import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";

export const ApiListCustomersQuery = PaginationQuerySchema.extend({ search: z.string().trim().min(1).optional() });
export const ApiCustomerSchema = z.object({ id: z.number().int(), name: z.string(), type: z.string(), externalId: z.string().nullable(), mobile: z.string().nullable(), email: z.string().nullable() });


export const ApiCreateComplaint = z.object({
  customerId: z.number().int().positive(),
  purchaseExperienceId: z.number().int().positive().optional(),
  categoryId: z.number().int().positive().optional(),
  branchId: z.number().int().positive().optional(),
  priority: z.enum(["CRITICAL", "URGENT", "HIGH", "MEDIUM", "LOW"]).optional(),
  description: z.string().trim().min(1).max(4000),
});

export const ApiTransitionComplaint = z.object({
  revision: z.number().int().min(0),
  toStage: z.enum(["NEW", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]),
  reason: z.string().trim().max(500).optional(),
});


export const ApiKpiQuery = z.object({ periodType: z.enum(["MONTH", "QUARTER", "YEAR", "CUSTOM"]).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() });
export const ApiKpiSchema = z.object({
  period: z.object({ from: z.date(), to: z.date(), type: z.string().optional(), previousFrom: z.date().optional(), previousTo: z.date().optional() }),
  kpis: z.array(z.object({ code: z.string(), unit: z.string(), currentValue: z.number().nullable(), previousValue: z.number().nullable(), targetValue: z.number().nullable(), targetStatus: z.string() })),
});
