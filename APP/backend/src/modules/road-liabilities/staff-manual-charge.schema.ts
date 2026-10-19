import { z } from "zod";

export const StaffRoadChargeCategorySchema = z.enum(["TRAFFIC_VIOLATION", "SALIK"]);

const StaffReferenceNumberSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(120));

export const StaffManualChargeInputSchema = z.object({
  chargeCategory: StaffRoadChargeCategorySchema,
  amountAed: z.number().int().positive(),
  referenceNumber: StaffReferenceNumberSchema,
});

export type StaffManualChargeInput = z.infer<typeof StaffManualChargeInputSchema>;

export const ReturnedContractsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  companyId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(120).optional(),
});

export const ReturnedContractListItemSchema = z.object({
  contractId: z.string().uuid(),
  contractNumber: z.string(),
  status: z.enum(["ACTIVE", "RETOUT", "REVIEW", "CLOSED"]),
  collectionMode: z.string(),
  company: z
    .object({
      id: z.number().int(),
      code: z.string(),
      displayName: z.string(),
      accentColor: z.string(),
    })
    .nullable(),
  customerName: z.string().nullable(),
  vehicleDisplayName: z.string(),
  plateNumber: z.string().nullable(),
  carInOccurredAt: z.date().nullable(),
  cardAvailability: z.enum(["available", "unavailable"]),
  capabilityReasonCode: z.string().nullable(),
  savedPaymentMethod: z
    .object({ brand: z.string(), last4: z.string() })
    .nullable(),
});

export const StaffManualRecoveryStateSchema = z.enum([
  "none",
  "orphan_idempotency_cleared",
  "collection_resumed",
  "awaiting_provider",
  "manual_review",
]);

export const StaffManualChargeResultSchema = z.object({
  roadLiabilityId: z.string().uuid(),
  status: z.enum(["succeeded", "processing", "failed", "requires_action", "blocked"]),
  operationalState: z.string().nullable(),
  invoicePending: z.boolean(),
  failure: z.any().nullable().optional(),
  recoveryState: StaffManualRecoveryStateSchema.optional().default("none"),
});

export const StaffDeferredRegisterResultSchema = z.object({
  roadLiabilityId: z.string().uuid(),
});
