import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";

export const InvoiceTypeSchema = z.enum(["RENTAL", "RECONCILIATION", "ROAD_LIABILITY", "RENEWAL"]);
export const InvoiceStatusSchema = z.enum(["ISSUED", "VOID"]);

export const InvoiceListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().optional(),
  companyId: z.coerce.number().int().positive().optional(),
  companyCode: z.enum(["ELITE", "UNIQUE"]).optional(),
  invoiceType: InvoiceTypeSchema.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  contractId: z.string().uuid().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  vehicleId: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
});

export const InvoiceLineSchema = z.object({
  id: z.string().uuid(),
  position: z.number().int(),
  lineType: z.string(),
  serviceLabel: z.string(),
  description: z.string(),
  quantity: z.number().int(),
  unitRate: z.number().int(),
  amount: z.number().int(),
  sourceType: z.string(),
  sourceId: z.string(),
});

export const InvoiceListItemSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.number().int(),
  invoiceType: InvoiceTypeSchema,
  status: InvoiceStatusSchema,
  companyId: z.number().int(),
  companyCode: z.string(),
  companyName: z.string(),
  contractId: z.string().uuid(),
  contractNumber: z.string(),
  vehicleId: z.number().int(),
  vehicleName: z.string(),
  plateNumber: z.string(),
  customerId: z.number().int(),
  customerName: z.string(),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  currency: z.string(),
  totalAmount: z.number().int(),
  sourceLabel: z.string(),
  latestDeliveryStatus: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export const InvoiceDetailSchema = InvoiceListItemSchema.extend({
  termsSnapshot: z.string(),
  balanceDueSnapshot: z.number().int(),
  subtotalAmount: z.number().int(),
  templateVersion: z.string(),
  originEventKey: z.string(),
  companyDisplayNameSnapshot: z.string(),
  companyAddressSnapshot: z.string().nullable(),
  companyEmailSnapshot: z.string().nullable(),
  lines: z.array(InvoiceLineSchema),
  deliveriesSummary: z.array(
    z.object({
      id: z.string().uuid(),
      channel: z.string(),
      status: z.string(),
      requestedAt: z.coerce.date(),
      sentAt: z.coerce.date().nullable(),
      deliveredAt: z.coerce.date().nullable(),
      failedAt: z.coerce.date().nullable(),
      failureCode: z.string().nullable(),
    }),
  ),
});

export const InvoiceDeliverySchema = z.object({
  id: z.string().uuid(),
  channel: z.string(),
  status: z.string(),
  recipientPhoneSnapshot: z.string(),
  recipientNameSnapshot: z.string().nullable(),
  messageSnapshot: z.string(),
  provider: z.string().nullable(),
  requestedAt: z.coerce.date(),
  sentAt: z.coerce.date().nullable(),
  deliveredAt: z.coerce.date().nullable(),
  failedAt: z.coerce.date().nullable(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  requestedByUserId: z.number().int(),
});

export const WhatsAppDeliveryRequestSchema = z.object({
  idempotencyKey: z.string().min(8).max(128).optional(),
});
