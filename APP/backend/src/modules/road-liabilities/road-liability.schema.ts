import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { VehicleOperationalStatusDtoSchema } from "src/modules/vehicles/vehicles.schema";

export const RoadLiabilityTypeDtoSchema = z.enum([
  "rta_violation",
  "salik_toll",
  "salik_violation",
]);
export type RoadLiabilityTypeDto = z.infer<typeof RoadLiabilityTypeDtoSchema>;

export const RoadLiabilityConfirmationDtoSchema = z.enum([
  "pending_confirmation",
  "confirmed",
  "rejected",
]);
export type RoadLiabilityConfirmationDto = z.infer<typeof RoadLiabilityConfirmationDtoSchema>;

export const RoadLiabilityAttributionDtoSchema = z.enum([
  "unresolved",
  "matched",
  "unmatched",
  "ambiguous",
]);
export type RoadLiabilityAttributionDto = z.infer<typeof RoadLiabilityAttributionDtoSchema>;

export const RoadLiabilityCollectionDtoSchema = z.enum([
  "not_ready",
  "open",
  "settled",
  "disputed",
  "void",
]);
export type RoadLiabilityCollectionDto = z.infer<typeof RoadLiabilityCollectionDtoSchema>;

export const RoadLiabilityWorkStateDtoSchema = z.enum([
  "awaiting_confirmation",
  "collectible",
  "needs_contract",
  "ambiguous_match",
  "attribution_pending",
  "disputed",
  "settled",
  "rejected",
  "void",
  "not_ready",
]);
export type RoadLiabilityWorkStateDto = z.infer<typeof RoadLiabilityWorkStateDtoSchema>;

export const RoadLiabilityQueueDtoSchema = z.enum([
  "collectible",
  "needs_attention",
  "settled",
]);
export type RoadLiabilityQueueDto = z.infer<typeof RoadLiabilityQueueDtoSchema>;

export const RoadLiabilityChannelDtoSchema = z.enum(["RTA", "SALIK"]);
export type RoadLiabilityChannelDto = z.infer<typeof RoadLiabilityChannelDtoSchema>;

export const RoadLiabilityConfidenceDtoSchema = z.enum(["high", "medium", "low"]);
export type RoadLiabilityConfidenceDto = z.infer<typeof RoadLiabilityConfidenceDtoSchema>;

/// Normalized owning company for a road liability. The Backend resolves the
/// precedence (attributed Contract first, then the Vehicle) so no client has to
/// reproduce it. A null company means the liability is still unmatched — it is
/// never a silent default company.
export const RoadLiabilityCompanyRefSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  displayName: z.string(),
  accentColor: z.string(),
});
export type RoadLiabilityCompanyRef = z.infer<typeof RoadLiabilityCompanyRefSchema>;

export const RoadLiabilityVehicleSchema = z.object({
  id: z.number().int(),
  displayName: z.string(),
  plateNumber: z.string().nullable(),
  primaryImageUrl: z.string().nullable(),
  operationalStatus: VehicleOperationalStatusDtoSchema,
});

export const RoadLiabilityContractSchema = z.object({
  id: z.string(),
  contractNumber: z.string(),
  status: z.string(),
});

export const RoadLiabilityCustomerSchema = z.object({
  displayName: z.string(),
});

export const RoadLiabilityGateSchema = z.object({
  id: z.string(),
  networkKey: z.string(),
  nameEn: z.string(),
  nameAr: z.string(),
  externalGateCode: z.string().nullable(),
});

export const RoadLiabilityListItemSchema = z.object({
  id: z.string(),
  type: RoadLiabilityTypeDtoSchema,
  source: z.string().nullable(),
  occurredAt: z.date(),
  amount: z.number().int().nullable(),
  currency: z.string().nullable(),
  confirmationStatus: RoadLiabilityConfirmationDtoSchema,
  attributionStatus: RoadLiabilityAttributionDtoSchema,
  collectionStatus: RoadLiabilityCollectionDtoSchema,
  workState: RoadLiabilityWorkStateDtoSchema,
  locationLabel: z.string().nullable(),
  gate: RoadLiabilityGateSchema.nullable(),
  vehicle: RoadLiabilityVehicleSchema.nullable(),
  contract: RoadLiabilityContractSchema.nullable(),
  company: RoadLiabilityCompanyRefSchema.nullable(),
  customer: RoadLiabilityCustomerSchema.nullable(),
  prediction: z.object({
    predictedByGps: z.boolean(),
    confidence: RoadLiabilityConfidenceDtoSchema.nullable(),
  }),
  authoritative: z.object({
    confirmed: z.boolean(),
    externalReference: z.string().nullable(),
  }),
  reconciliationAttached: z.boolean(),
  reconciliationLineId: z.string().uuid().nullable(),
  customerCharge: z.object({
    confirmed: z.boolean(),
    destination: z.enum(["RECONCILIATION", "POST_CLOSE_RECEIVABLE", "DIRECT_COLLECTION"]).nullable(),
  }),
});
export type RoadLiabilityListItem = z.infer<typeof RoadLiabilityListItemSchema>;

export const RoadLiabilityProvenanceSchema = z.object({
  id: z.string(),
  sourceKey: z.string(),
  authoritative: z.boolean(),
  eventType: RoadLiabilityTypeDtoSchema,
  occurredAt: z.date(),
  receivedAt: z.date(),
  confidence: RoadLiabilityConfidenceDtoSchema.nullable(),
  externalReference: z.string().nullable(),
  locationLabel: z.string().nullable(),
});

export const RoadLiabilityDetailSchema = RoadLiabilityListItemSchema.extend({
  confirmedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  provenance: z.array(RoadLiabilityProvenanceSchema),
});
export type RoadLiabilityDetail = z.infer<typeof RoadLiabilityDetailSchema>;

export const RoadLiabilitySummarySchema = z.object({
  total: z.number().int(),
  pendingConfirmationCount: z.number().int(),
  confirmedOpenCount: z.number().int(),
  confirmedOpenAmount: z.number().int(),
  matchedCount: z.number().int(),
  unmatchedCount: z.number().int(),
  ambiguousCount: z.number().int(),
  settledCount: z.number().int(),
  needsAttentionCount: z.number().int(),
  byType: z.object({
    rtaViolations: z.number().int(),
    salikTolls: z.number().int(),
    salikViolations: z.number().int(),
  }),
  providers: z.object({
    rtaConfigured: z.boolean(),
    salikConfigured: z.boolean(),
    tarsTrafficCapabilityVerified: z.boolean(),
  }),
});
export type RoadLiabilitySummary = z.infer<typeof RoadLiabilitySummarySchema>;

export const ListRoadLiabilitiesQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  type: RoadLiabilityTypeDtoSchema.optional(),
  sourceKey: z.string().trim().min(1).optional(),
  confirmationStatus: RoadLiabilityConfirmationDtoSchema.optional(),
  attributionStatus: RoadLiabilityAttributionDtoSchema.optional(),
  collectionStatus: RoadLiabilityCollectionDtoSchema.optional(),
  queue: RoadLiabilityQueueDtoSchema.optional(),
  channel: RoadLiabilityChannelDtoSchema.optional(),
  vehicleId: z.coerce.number().int().positive().optional(),
  contractId: z.string().uuid().optional(),
  /// Contract-first company scope: an attributed Contract's company wins, and a
  /// liability with no Contract falls back to its Vehicle's company. Unmatched
  /// rows (no Contract, no Vehicle) stay visible only under All Companies.
  companyId: z.coerce.number().int().positive().optional(),
  occurredFrom: z.coerce.date().optional(),
  occurredTo: z.coerce.date().optional(),
  sort: z.string().optional(),
});
export type ListRoadLiabilitiesQuery = z.infer<typeof ListRoadLiabilitiesQuerySchema>;

export const RoadLiabilityCustomerChargeDestinationSchema = z.enum([
  "RECONCILIATION",
  "POST_CLOSE_RECEIVABLE",
  "DIRECT_COLLECTION",
]);

export const RoadLiabilityCustomerChargeStateSchema = z.enum([
  "NOT_ELIGIBLE",
  "AVAILABLE",
  "LOCKED",
]);

export const RoadLiabilityCustomerChargeReviewSchema = z.object({
  state: RoadLiabilityCustomerChargeStateSchema,
  destination: RoadLiabilityCustomerChargeDestinationSchema.nullable(),
  officialAmount: z.number().int(),
  currency: z.string(),
  suggestedCustomerChargeAmount: z.number().int(),
  minimumCustomerChargeAmount: z.number().int(),
  customerChargeAmount: z.number().int().nullable(),
  adjustmentAmount: z.number().int().nullable(),
  adjustmentReason: z.string().nullable(),
  adjustmentNote: z.string().nullable(),
  confirmedAt: z.date().nullable(),
  reconciliationLineId: z.string().uuid().nullable(),
  postCloseReceivableId: z.string().uuid().nullable(),
  reasonCode: z.string().nullable(),
});
export type RoadLiabilityCustomerChargeReview = z.infer<
  typeof RoadLiabilityCustomerChargeReviewSchema
>;
