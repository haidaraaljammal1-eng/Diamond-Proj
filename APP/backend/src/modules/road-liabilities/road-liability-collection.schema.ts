import { z } from "zod";

export const RoadLiabilityCollectionOperationalStateSchema = z.enum([
  "collectible",
  "processing",
  "paid",
  "failed",
  "requires_action",
  "manual_pending",
  "payment_link_ready",
]);

export const RoadLiabilityCollectionCapabilitySchema = z.object({
  offSessionAvailable: z.boolean(),
  paymentLinkAvailable: z.boolean(),
  cashCollectionRequired: z.boolean(),
  authorizationStatus: z.enum(["active", "missing", "revoked", "scope_ineligible", "contract_mismatch", "method_inactive", "provider_mismatch"]),
  savedPaymentMethod: z
    .object({
      brand: z.string(),
      last4: z.string(),
    })
    .nullable(),
  reasonCode: z.string().nullable(),
});

export const RoadLiabilityCollectionChargeSchema = z.object({
  officialAmount: z.number().int(),
  customerChargeAmount: z.number().int(),
  currency: z.string(),
  adjustmentAmount: z.number().int().nullable(),
  adjustmentReason: z.string().nullable(),
  contractNumber: z.string(),
  customerName: z.string().nullable(),
});

export const RoadLiabilityCollectionViewSchema = z.object({
  liabilityId: z.string(),
  collectionStatus: z.enum(["not_ready", "open", "settled", "disputed", "void"]),
  operationalState: RoadLiabilityCollectionOperationalStateSchema.nullable(),
  capability: RoadLiabilityCollectionCapabilitySchema,
  charge: RoadLiabilityCollectionChargeSchema.nullable(),
  checkoutUrl: z.string().url().nullable(),
});

export const OffSessionCollectionInputSchema = z.object({
  customerChargeAmount: z.number().int().positive().optional(),
  adjustmentReason: z.string().trim().min(1).optional(),
  adjustmentNote: z.string().trim().max(500).optional(),
});

export const ManualCollectionConfirmInputSchema = z.object({
  amount: z.number().int().positive(),
  method: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
});

export const RoadLiabilityFailureCustomerSchema = z.object({
  fullName: z.string().nullable(),
  nationality: z.string().nullable(),
  identityNumber: z.string().nullable(),
  passportNumber: z.string().nullable(),
  passportIssueDate: z.string().nullable(),
  passportExpiryDate: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  sex: z.string().nullable(),
  issuingCountry: z.string().nullable(),
  drivingLicenseNumber: z.string().nullable(),
  drivingLicenseExpiry: z.string().nullable(),
  telephone: z.string().nullable(),
  address: z.string().nullable(),
});

export const RoadLiabilityCollectionFailureSchema = z.object({
  liability: z.object({
    id: z.string(),
    source: z.string().nullable(),
    type: z.string(),
    amount: z.number().int().nullable(),
    occurredAt: z.date(),
    externalReference: z.string().nullable(),
    contractNumber: z.string().nullable(),
    vehicleLabel: z.string().nullable(),
    plateNumber: z.string().nullable(),
  }),
  customer: RoadLiabilityFailureCustomerSchema,
  savedCard: z.object({ brand: z.string(), last4: z.string() }).nullable(),
  failure: z.object({
    reasonCode: z.string(),
    messageEn: z.string(),
    messageAr: z.string(),
    declineCode: z.string().nullable(),
    occurredAt: z.date(),
  }),
});

export const OffSessionCollectionResultSchema = z.object({
  status: z.enum(["succeeded", "failed", "requires_action", "processing"]),
  operationalState: RoadLiabilityCollectionOperationalStateSchema,
  failure: RoadLiabilityCollectionFailureSchema.nullable(),
});
