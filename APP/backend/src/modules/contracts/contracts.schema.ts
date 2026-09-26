import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { UuidIdParam } from "src/lib/http/common-schemas";
import {
  FUEL_LEVELS,
  INSPECTION_ANGLES,
  CAR_OUT_PHOTO_ANGLES,
} from "src/modules/contracts/contracts.constants";
import { DAMAGE_MARK_TYPES, DAMAGE_ZONES } from "src/modules/contracts/official-contract-interactive";
import {
  TarsOtpPublicStateSchema,
  TarsOtpVerifyBodySchema,
} from "src/modules/integrations/tars/tars.schema";

export { TarsOtpPublicStateSchema, TarsOtpVerifyBodySchema };

export const ContractStatusSchema = z.enum([
  "AWAITING",
  "FORM",
  "SIGNED",
  "PAID",
  "ACTIVE",
  "RETOUT",
  "REVIEW",
  "CLOSED",
]);
export const ContractPriceTypeSchema = z.enum(["HOURLY", "DAILY", "WEEKLY", "MONTHLY", "CUSTOM"]);
export const ContractDurationUnitSchema = z.enum(["HOUR", "DAY", "WEEK", "MONTH"]);
export const ContractLinkTypeSchema = z.enum(["RENTAL", "RETURN", "RENEWAL"]);
export const ContractPaymentMethodSchema = z.enum(["BANK_TRANSFER", "CARD", "CASH", "MANUAL"]);

export const RentalCollectionModeSchema = z.enum(["ELECTRONIC", "CASH"]);
export const ContractPaymentStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "CONFIRMED",
  "FAILED",
  "CANCELLED",
]);
export const CustomerDocumentTypeSchema = z.enum(["IDENTITY", "PASSPORT", "DRIVING_LICENSE"]);
export const DrivingLicenseVerificationStatusSchema = z.enum([
  "PENDING",
  "VALID",
  "EXPIRED",
  "UNREADABLE",
  "REVIEW_REQUIRED",
  "PROVIDER_UNAVAILABLE",
]);
export const IdentityLicenseStatusSchema = z.enum([
  "LICENSE_REQUIRED",
  "LICENSE_PROCESSING",
  "LICENSE_VALID",
  "LICENSE_INVALID",
]);
export const IdentityPassportStatusSchema = z.enum([
  "PASSPORT_REQUIRED",
  "PASSPORT_PROCESSING",
  "PASSPORT_READY",
  "PASSPORT_FAILED",
]);
export const PublicPassportStatusSchema = z.enum([
  "REQUIRED",
  "PROCESSING",
  "READY",
  "NOT_RECOGNIZED",
  "FAILED",
  "PROVIDER_UNAVAILABLE",
]);
export const PublicRentalFlowStepSchema = z.enum([
  "LICENSE_VERIFICATION",
  "CONTRACT",
  "PAYMENT",
  "READY_FOR_HANDOVER",
]);
export const ReconciliationLineTypeSchema = z.enum([
  "DAMAGE",
  "FUEL",
  "LATE",
  "SALIK",
  "VIOLATION",
  "OTHER",
]);
export const InspectionAngleSchema = z.enum(INSPECTION_ANGLES);
export const FuelLevelSchema = z.enum(FUEL_LEVELS);

export const ContractIdParam = UuidIdParam;
export const ContractTokenParam = z.object({ token: z.string().min(16).max(128) });

const MoneyAed = z.number().int().nonnegative();
const Days = z.number().int().positive().max(3650);
const DurationValue = z.number().int().positive().max(3650);

export const CreateOfferSchema = z
  .object({
    vehicleId: z.number().int().positive(),
    priceType: ContractPriceTypeSchema,
    rentalDays: Days.optional(),
    durationValue: DurationValue.optional(),
    durationUnit: ContractDurationUnitSchema.optional(),
    agreedAmount: MoneyAed.min(1),
    collectionMode: RentalCollectionModeSchema,
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    customerId: z.number().int().positive().optional(),
    assignedEmployeeUserId: z.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.priceType === "CUSTOM") {
      if (data.durationValue == null) {
        ctx.addIssue({ code: "custom", message: "durationValue required", path: ["durationValue"] });
      }
      if (!data.durationUnit) {
        ctx.addIssue({ code: "custom", message: "durationUnit required", path: ["durationUnit"] });
      }
      return;
    }
    if (data.rentalDays == null) {
      ctx.addIssue({ code: "custom", message: "rentalDays required", path: ["rentalDays"] });
    }
  });

export const ListContractsQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  /** Filters on Contract.companyId — historical ownership, never the Vehicle's current company. */
  companyId: z.coerce.number().int().positive().optional(),
  status: ContractStatusSchema.optional(),
  vehicleId: z.coerce.number().int().positive().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.string().optional(),
});

export const ConfirmPaymentSchema = z.object({
  amount: MoneyAed.min(1).optional(),
  method: ContractPaymentMethodSchema.default("MANUAL"),
  externalReference: z.string().trim().min(1).max(200).optional(),
});

export const InspectionPhotoInputSchema = z.object({
  attachmentId: z.string().uuid(),
  angle: InspectionAngleSchema,
});
export const CarOutPhotoInputSchema = z.object({
  attachmentId: z.string().uuid(),
  angle: z.enum(CAR_OUT_PHOTO_ANGLES),
});

export const DamageMarkTypeSchema = z.enum(DAMAGE_MARK_TYPES);
export const DamageMarkSchema = z
  .object({
    zone: z.string().refine((zone) => DAMAGE_ZONES.includes(zone), "Unknown damage zone"),
    type: DamageMarkTypeSchema,
  })
  .strict();

/** Vehicle condition marked on the paper diagrams + the hirer's custody signature (PNG attachment). */
const CustodyPaperInputSchema = {
  damage: z.array(DamageMarkSchema).max(DAMAGE_ZONES.length).optional(),
  hirerSignatureAttachmentId: z.string().uuid().optional(),
};

export const CarOutSchema = z.object({
  occurredAt: z.coerce.date().optional(),
  mileageOut: z.number().int().nonnegative(),
  fuelOut: FuelLevelSchema,
  notes: z.string().trim().max(2000).optional(),
  photos: z.array(CarOutPhotoInputSchema).min(8).max(CAR_OUT_PHOTO_ANGLES.length),
  ...CustodyPaperInputSchema,
});

export const CarOutDraftPatchSchema = z.object({
  mileageOut: z.number().int().nonnegative().optional(),
  fuelOut: FuelLevelSchema.optional(),
  damageOut: z.array(DamageMarkSchema).max(DAMAGE_ZONES.length).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  hirerSignatureAttachmentId: z.string().uuid().nullable().optional(),
}).strict();
export const CarOutPhotoQuerySchema = z.object({ angle: z.enum(CAR_OUT_PHOTO_ANGLES) });
/// The full stored-angle union: legacy INSPECTION_ANGLES rows can still exist on a
/// final Car-In created through the legacy public single-shot flow (see CarInSchema),
/// alongside the current CAR_OUT_PHOTO_ANGLES vocabulary used by both custody events.
export const CarOutEvidenceAngleSchema = z.enum([...INSPECTION_ANGLES, ...CAR_OUT_PHOTO_ANGLES]);

/// Staged Car-In draft, mirroring CarOutDraftPatchSchema. The IN signature is
/// uploaded through its own endpoint, not patched here, same as OUT.
export const CarInDraftPatchSchema = z.object({
  mileageIn: z.number().int().nonnegative().optional(),
  fuelIn: FuelLevelSchema.optional(),
  damageIn: z.array(DamageMarkSchema).max(DAMAGE_ZONES.length).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
}).strict();
export const CarInPhotoQuerySchema = z.object({ angle: z.enum(CAR_OUT_PHOTO_ANGLES) });

/// Legacy single-shot Car-In payload. Still used by the public return-token
/// route with the original 8-angle INSPECTION_ANGLES vocabulary — see
/// DOCU/05-pages/contracts-backend.md for the compatibility note. The staged
/// staff workflow (CarInDraftPatchSchema + CarInPhotoQuerySchema + complete)
/// uses CAR_OUT_PHOTO_ANGLES instead.
export const CarInSchema = z.object({
  occurredAt: z.coerce.date().optional(),
  mileageIn: z.number().int().nonnegative(),
  fuelIn: FuelLevelSchema,
  notes: z.string().trim().max(2000).optional(),
  photos: z.array(InspectionPhotoInputSchema).length(8),
  ...CustodyPaperInputSchema,
});

export const ReconciliationLineInputSchema = z.object({
  type: ReconciliationLineTypeSchema,
  description: z.string().trim().min(1).max(300),
  amount: z.number().int(),
  externalReference: z.string().trim().min(1).max(200).nullable().optional(),
  sourceDomain: z.string().trim().min(1).max(50).nullable().optional(),
});

export const ReconciliationLineParam = ContractIdParam.extend({
  lineId: z.uuid(),
});

export const ReconciliationTotalsSchema = z.object({
  damages: z.number().int(),
  fuel: z.number().int(),
  late: z.number().int(),
  other: z.number().int(),
  salik: z.number().int(),
  violations: z.number().int(),
  finalAmount: z.number().int(),
});

export const ReconciliationImagePairSchema = z.object({
  angle: z.string(),
  outPhoto: z.object({ id: z.string().uuid(), url: z.string() }).nullable(),
  inPhoto: z.object({ id: z.string().uuid(), url: z.string() }).nullable(),
});

export const ReconciliationRoadLiabilityReadSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["RTA_VIOLATION", "SALIK_TOLL", "SALIK_VIOLATION"]),
  occurredAt: z.date(),
  officialAmount: z.number().int(),
  adminFee: z.number().int(),
  customerCharge: z.number().int(),
  collectionStatus: z.string(),
  externalReference: z.string().nullable(),
  attached: z.boolean(),
  reconciliationLineId: z.string().uuid().nullable(),
});

export const FullReconciliationReadSchema = z.object({
  contract: z.object({
    contractId: z.string().uuid(),
    contractNumber: z.string(),
    status: ContractStatusSchema,
    vehicle: z.object({
      id: z.number().int(),
      displayName: z.string(),
      plateNumber: z.string().nullable(),
    }),
  }),
  custody: z.object({
    mileageOut: z.number().int().nullable(),
    mileageIn: z.number().int().nullable(),
    mileageDifference: z.number().int().nullable(),
    fuelOut: z.string().nullable(),
    fuelIn: z.string().nullable(),
    fuelDifference: z.number().int().nullable(),
  }),
  imagePairs: z.array(ReconciliationImagePairSchema),
  lines: z.array(
    z.object({
      id: z.string().uuid(),
      type: ReconciliationLineTypeSchema,
      description: z.string(),
      amount: z.number().int(),
      roadLiabilityId: z.string().uuid().nullable(),
      externalReference: z.string().nullable(),
      officialAmountSnapshot: z.number().int().nullable(),
      adjustmentAmount: z.number().int().nullable(),
      adjustmentReason: z.string().nullable(),
    }),
  ),
  roadLiabilities: z.object({
    attached: z.array(ReconciliationRoadLiabilityReadSchema),
    available: z.array(ReconciliationRoadLiabilityReadSchema),
  }),
  totals: ReconciliationTotalsSchema,
  reconciliation: z.object({
    id: z.string().uuid(),
    approvedAt: z.date().nullable(),
    finalizedAt: z.date().nullable(),
    finalizedByUserId: z.number().int().nullable(),
    settledAt: z.date().nullable(),
    settled: z.boolean(),
  }),
  paymentLink: z.object({
    active: z.boolean(),
    expiresAt: z.date().nullable(),
  }),
  collection: z.object({
    paymentStatus: z.string().nullable(),
    paymentMethod: z.string().nullable(),
  }),
  outstandingRenewals: z.array(
    z.object({
      id: z.string().uuid(),
      createdAt: z.date(),
      previousEndAt: z.date(),
      newEndAt: z.date(),
      additionalDays: z.number().int(),
      amount: z.number().int(),
      state: z.literal("OFFICE_UNPAID"),
    }),
  ),
  outstandingRenewalAmount: z.number().int(),
  reconciliationChargesAmount: z.number().int(),
  settlementAmountDue: z.number().int(),
});

export const PublicReconciliationReadSchema = z.object({
  contractNumber: z.string(),
  vehicle: z.object({
    displayName: z.string(),
    plateNumber: z.string().nullable(),
  }),
  totals: ReconciliationTotalsSchema,
  lines: z.array(
    z.object({
      type: ReconciliationLineTypeSchema,
      description: z.string(),
      amount: z.number().int(),
    }),
  ),
  finalAmount: z.number().int(),
  reconciliationChargesAmount: z.number().int(),
  outstandingRenewalAmount: z.number().int(),
  settlementAmountDue: z.number().int(),
  payment: z.object({
    required: z.boolean(),
    settled: z.boolean(),
    status: z.string().nullable(),
    method: z.string().nullable(),
  }),
});

export const ReconciliationLinkIssuedSchema = z.object({
  contractId: z.string().uuid(),
  contractNumber: z.string(),
  link: z.object({
    token: z.string(),
    expiresAt: z.date(),
    type: z.literal("RECONCILIATION"),
  }),
  publicUrl: z.string(),
  finalAmount: z.number().int(),
});

export const FinalReconciliationDetailSchema = z.object({
  custody: FullReconciliationReadSchema.shape.custody,
  imagePairs: z.array(ReconciliationImagePairSchema),
  lines: FullReconciliationReadSchema.shape.lines,
  totals: ReconciliationTotalsSchema,
  settlement: z.object({
    method: z.string().nullable(),
    paymentId: z.string().uuid().nullable(),
    paymentStatus: z.string().nullable(),
    settledAt: z.date().nullable(),
  }),
  finalizedAt: z.date().nullable(),
  finalizedBy: z.object({ id: z.number().int(), name: z.string() }).nullable(),
  reconciliationChargesAmount: z.number().int(),
  outstandingRenewalAmount: z.number().int(),
  settlementAmountDue: z.number().int(),
});

export const ReconcileSchema = z.object({
  lines: z.array(ReconciliationLineInputSchema).min(1).max(50),
});

export const ConfirmRoadLiabilityChargeParam = ContractIdParam.extend({
  roadLiabilityId: z.uuid(),
});

export const ConfirmRoadLiabilityChargeSchema = z
  .object({
    customerChargeAmount: MoneyAed.min(1),
    adjustmentReason: z.string().trim().min(1).max(200).optional(),
    adjustmentNote: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export const ReconciliationRoadLiabilityAvailableSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["RTA_VIOLATION", "SALIK_TOLL", "SALIK_VIOLATION"]),
  sourceKey: z.string().nullable(),
  occurredAt: z.date(),
  officialAmount: z.number().int(),
  currency: z.string(),
  suggestedCustomerChargeAmount: z.number().int(),
  minimumCustomerChargeAmount: z.number().int(),
  externalReference: z.string().nullable(),
  locationLabel: z.string().nullable(),
  predictedByGps: z.boolean(),
  vehicle: z
    .object({
      id: z.number().int(),
      displayName: z.string(),
      plateNumber: z.string().nullable(),
    })
    .nullable(),
});

export const ReconciliationRoadLiabilityAttachedSchema = z.object({
  roadLiabilityId: z.string().uuid(),
  reconciliationLineId: z.string().uuid(),
  type: z.enum(["RTA_VIOLATION", "SALIK_TOLL", "SALIK_VIOLATION"]),
  sourceKey: z.string().nullable(),
  occurredAt: z.date(),
  officialAmount: z.number().int(),
  customerChargeAmount: z.number().int(),
  adjustmentAmount: z.number().int(),
  adjustmentReason: z.string().nullable(),
  adjustmentNote: z.string().nullable(),
  locked: z.literal(true),
});

export const ReconciliationRoadLiabilitiesSchema = z.object({
  available: z.array(ReconciliationRoadLiabilityAvailableSchema),
  attached: z.array(ReconciliationRoadLiabilityAttachedSchema),
});

export const RenewSchema = z.object({
  additionalDays: Days,
  additionalAmount: MoneyAed,
});

/** Public confirm applies the stored offer. Extra body fields are ignored. */
export const ConfirmPublicRenewalSchema = z.object({}).passthrough();

export const PublicRenewalOfferSchema = z.object({
  additionalDays: z.number().int(),
  additionalAmount: z.number().int(),
  previousEndAt: z.date(),
  newEndAt: z.date(),
  confirmed: z.boolean(),
  awaitingPayment: z.boolean().optional(),
});

export const PublicFormSchema = z.object({
  name: z.string().trim().min(1).max(200),
  mobile: z.string().trim().min(3).max(30),
  email: z.string().trim().email().max(200).optional(),
  nationality: z.string().trim().min(2).max(80),
  identityNumber: z.string().trim().min(3).max(50).optional(),
  passportNumber: z.string().trim().min(3).max(50).optional(),
  address: z.string().trim().max(400).optional(),
});

export const PublicAcceptSchema = z.object({
  termsVersion: z.string().trim().min(1).max(80).optional(),
  signatureAttachmentId: z.string().uuid().optional(),
});

export const PhotoAngleQuerySchema = z.object({
  angle: InspectionAngleSchema.optional(),
  documentType: CustomerDocumentTypeSchema.optional(),
});

const LinkIssuedSchema = z.object({
  token: z.string(),
  expiresAt: z.date(),
  type: ContractLinkTypeSchema,
});

export const ContractRoadLiabilitySignalsSchema = z.object({
  hasSalikGpsSignal: z.boolean(),
  salikGpsSignalCount: z.number().int(),
  unconfirmedSalikGpsSignalCount: z.number().int(),
  latestSalikGpsSignalAt: z.date().nullable(),
});

export const ContractPostCloseReceivableItemSchema = z.object({
  id: z.string().uuid(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.enum(["OPEN", "SETTLED", "VOID"]),
  settledAt: z.date().nullable().optional(),
  roadLiabilityType: z.enum(["RTA_VIOLATION", "SALIK_TOLL", "SALIK_VIOLATION"]),
  createdAt: z.date(),
});

export const ContractPostCloseReceivablesSummarySchema = z.object({
  count: z.number().int(),
  openAmount: z.number().int(),
  items: z.array(ContractPostCloseReceivableItemSchema),
});

/// The Contract's own company (historical ownership), not the Vehicle's current
/// one. Legal names live on the official contract, not on operational lists.
export const ContractCompanyRefSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  displayName: z.string(),
  accentColor: z.string(),
});

export const ContractListItemSchema = z.object({
  id: z.string(),
  contractNumber: z.string(),
  status: ContractStatusSchema,
  company: ContractCompanyRefSchema,
  vehicleId: z.number().int(),
  vehicleName: z.string(),
  plateNumber: z.string().nullable(),
  customerId: z.number().int().nullable(),
  customerName: z.string().nullable(),
  priceType: ContractPriceTypeSchema,
  rentalDays: z.number().int(),
  durationValue: z.number().int(),
  durationUnit: ContractDurationUnitSchema,
  agreedAmount: z.number().int(),
  currency: z.string(),
  startAt: z.date().nullable(),
  endAt: z.date().nullable(),
  createdAt: z.date(),
  hasSalikGpsSignal: z.boolean(),
  actions: z.object({ canCarOut: z.boolean(), canCarIn: z.boolean(), canReconcile: z.boolean() }),
  carOutStatus: z.enum(["NOT_STARTED", "DRAFT", "READY", "COMPLETED"]),
});

const InspectionPhotoPublicSchema = z.object({
  id: z.string(),
  attachmentId: z.string(),
  angle: CarOutEvidenceAngleSchema,
  url: z.string(),
});

export const CarOutHandoverSchema = z.object({
  status: z.enum(["NOT_STARTED", "DRAFT", "READY", "COMPLETED"]),
  mileageOut: z.number().int().nonnegative().nullable(),
  fuelOut: z.string().nullable(),
  damageOut: z.array(DamageMarkSchema),
  notes: z.string().nullable(),
  photoEvidence: z.object({
    required: z.number().int(), completed: z.number().int(),
    missing: z.array(z.enum(CAR_OUT_PHOTO_ANGLES)), complete: z.boolean(), ready: z.boolean(),
    photos: z.array(z.object({
      id: z.string().uuid(), contractId: z.string().uuid(), vehicleId: z.number().int(),
      stage: z.literal("OUT"), attachmentId: z.string().uuid(), angle: CarOutEvidenceAngleSchema,
      url: z.string(), uploadedAt: z.date(), uploadedByUserId: z.number().int().nullable(),
      checksum: z.string().nullable(),
    })),
  }),
  signature: z.object({ present: z.boolean(), attachmentId: z.string().uuid().nullable(), url: z.string().nullable() }),
  actualHandoverAt: z.date().nullable(),
  actions: z.object({
    canEdit: z.boolean(), canUploadPhotos: z.boolean(), canDeletePhotos: z.boolean(),
    canSign: z.boolean(), canSaveDraft: z.boolean(), canComplete: z.boolean(),
  }),
});

/// The staged Car-In work state: draft-in-progress or the completed handover,
/// same shape as CarOutHandoverSchema. Unlike OUT, the IN signature is
/// mandatory for `actions.canComplete` to ever become true.
export const CarInHandoverSchema = z.object({
  status: z.enum(["NOT_STARTED", "DRAFT", "READY", "COMPLETED"]),
  mileageIn: z.number().int().nonnegative().nullable(),
  fuelIn: z.string().nullable(),
  damageIn: z.array(DamageMarkSchema),
  notes: z.string().nullable(),
  photoEvidence: z.object({
    required: z.number().int(), completed: z.number().int(),
    missing: z.array(z.enum(CAR_OUT_PHOTO_ANGLES)), complete: z.boolean(), ready: z.boolean(),
    photos: z.array(z.object({
      id: z.string().uuid(), contractId: z.string().uuid(), vehicleId: z.number().int().nullable(),
      stage: z.literal("IN"), attachmentId: z.string().uuid(), angle: CarOutEvidenceAngleSchema,
      url: z.string(), uploadedAt: z.date(), uploadedByUserId: z.number().int().nullable(),
      checksum: z.string().nullable(),
    })),
  }),
  signature: z.object({ present: z.boolean(), attachmentId: z.string().uuid().nullable(), url: z.string().nullable() }),
  actualReturnAt: z.date().nullable(),
  actions: z.object({
    canEdit: z.boolean(), canUploadPhotos: z.boolean(), canDeletePhotos: z.boolean(),
    canSign: z.boolean(), canSaveDraft: z.boolean(), canComplete: z.boolean(),
  }),
});

export const ContractDetailSchema = z.object({
  id: z.string(),
  contractNumber: z.string(),
  status: ContractStatusSchema,
  company: ContractCompanyRefSchema,
  vehicleId: z.number().int(),
  customerId: z.number().int().nullable(),
  createdByUserId: z.number().int(),
  assignedEmployeeUserId: z.number().int().nullable(),
  priceType: ContractPriceTypeSchema,
  rentalDays: z.number().int(),
  durationValue: z.number().int(),
  durationUnit: ContractDurationUnitSchema,
  agreedAmount: z.number().int(),
  currency: z.string(),
  collectionMode: RentalCollectionModeSchema.nullable(),
  startAt: z.date().nullable(),
  endAt: z.date().nullable(),
  termsVersion: z.string(),
  snapshot: z.unknown().nullable(),
  activatedAt: z.date().nullable(),
  closedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  vehicle: z.object({
    id: z.number().int(),
    displayName: z.string(),
    plateNumber: z.string().nullable(),
    operationalStatus: z.string(),
  }),
  customer: z
    .object({
      id: z.number().int(),
      name: z.string(),
      mobile: z.string().nullable(),
      email: z.string().nullable(),
    })
    .nullable(),
  payment: z
    .object({
      id: z.string(),
      amount: z.number().int(),
      currency: z.string(),
      method: ContractPaymentMethodSchema,
      status: ContractPaymentStatusSchema,
      confirmedAt: z.date().nullable(),
    })
    .nullable(),
  carOutHandover: CarOutHandoverSchema,
  carInHandover: CarInHandoverSchema,
  carOut: z
    .object({
      id: z.string(),
      occurredAt: z.date(),
      mileageOut: z.number().int(),
      fuelOut: z.string(),
      notes: z.string().nullable(),
      damageOut: z.array(DamageMarkSchema),
      vehicleId: z.number().int(),
      hirerSignatureAttachmentId: z.string().uuid().nullable(),
      photos: z.array(InspectionPhotoPublicSchema),
    })
    .nullable(),
  carIn: z
    .object({
      id: z.string(),
      occurredAt: z.date(),
      mileageIn: z.number().int(),
      fuelIn: z.string(),
      notes: z.string().nullable(),
      photos: z.array(InspectionPhotoPublicSchema),
    })
    .nullable(),
  reconciliation: z
    .object({
      id: z.string(),
      chargesTotal: z.number().int(),
      finalAmount: z.number().int(),
          approvedAt: z.date().nullable(),
          finalizedAt: z.date().nullable().optional(),
          finalizedByUserId: z.number().int().nullable().optional(),
          settledAt: z.date().nullable().optional(),
      settled: z.boolean().optional(),
          lines: z.array(
            z.object({
              id: z.string(),
              type: ReconciliationLineTypeSchema,
              description: z.string(),
              amount: z.number().int(),
              externalReference: z.string().nullable(),
              sourceDomain: z.string().nullable(),
              roadLiabilityId: z.string().uuid().nullable(),
              officialAmountSnapshot: z.number().int().nullable(),
              adjustmentAmount: z.number().int().nullable(),
              adjustmentReason: z.string().nullable(),
            }),
          ),
    })
    .nullable(),
  finalReconciliation: FinalReconciliationDetailSchema.nullable().optional(),
  renewals: z.array(
    z.object({
      id: z.string(),
      additionalDays: z.number().int(),
      additionalAmount: z.number().int(),
      previousEndAt: z.date(),
      newEndAt: z.date(),
      createdAt: z.date(),
      approvedAt: z.date().nullable(),
      appliedAt: z.date().nullable().optional(),
      settledPaymentId: z.string().nullable().optional(),
      collectionState: z.enum([
        "PENDING",
        "AWAITING_PAYMENT",
        "OFFICE_UNPAID",
        "PAID",
        "COMPLETED_NO_CHARGE",
      ]),
      extensionApplied: z.boolean(),
      collectable: z.boolean(),
      awaitingPayment: z.boolean().optional(),
      paymentMethod: z.enum(["BANK_TRANSFER", "CARD", "CASH", "MANUAL"]).nullable().optional(),
      paymentStatus: z
        .enum(["PENDING", "PROCESSING", "CONFIRMED", "FAILED", "CANCELLED"])
        .nullable()
        .optional(),
    }),
  ),
  actions: z.object({
    canGenerateRentalLink: z.boolean(),
    canConfirmPayment: z.boolean(),
    canCarOut: z.boolean(),
    canGenerateReturnLink: z.boolean(),
    canCarIn: z.boolean(),
    canReconcile: z.boolean(),
    canClose: z.boolean(),
    canRenew: z.boolean(),
  }),
  roadLiabilitySignals: ContractRoadLiabilitySignalsSchema,
  postCloseReceivables: ContractPostCloseReceivablesSummarySchema,
});

export const ContractOfferCreatedSchema = z.object({
  contract: ContractDetailSchema,
});

export const ContractLinkIssuedSchema = z.object({
  contractId: z.string(),
  contractNumber: z.string(),
  link: LinkIssuedSchema,
});

export const PublicContractViewSchema = z.object({
  office: z.object({
    displayName: z.string(),
    company: ContractCompanyRefSchema.pick({ code: true, displayName: true }).extend({
      legalNameAr: z.string(),
      legalNameEn: z.string(),
    }),
  }),
  contractNumber: z.string(),
  status: ContractStatusSchema,
  priceType: ContractPriceTypeSchema,
  rentalDays: z.number().int(),
  durationValue: z.number().int(),
  durationUnit: ContractDurationUnitSchema,
  agreedAmount: z.number().int(),
  currency: z.string(),
  startAt: z.date().nullable(),
  endAt: z.date().nullable(),
  termsVersion: z.string(),
  vehicle: z.object({
    displayName: z.string(),
    plateNumber: z.string().nullable(),
    color: z.string().nullable(),
    modelYear: z.number().int().nullable(),
  }),
  renewal: PublicRenewalOfferSchema.nullable().optional(),
  payment: z
    .object({
      providerAvailable: z.boolean(),
    })
    .optional(),
});

export const PublicLicenseVerificationSchema = z.object({
  status: DrivingLicenseVerificationStatusSchema,
  licenseNumber: z.string().nullable(),
  licenseNumberMasked: z.string().nullable(),
  expiryDate: z.string().nullable(),
  confidence: z.number().nullable(),
});

/** Normalized passport fields only — never a raw OCR payload. */
export const PublicPassportFieldsSchema = z.object({
  fullName: z.string().nullable(),
  passportNumber: z.string().nullable(),
  nationality: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  sex: z.string().nullable(),
  passportIssueDate: z.string().nullable(),
  passportExpiryDate: z.string().nullable(),
  issuingCountry: z.string().nullable(),
});

export const PublicIdentityStatusSchema = z.object({
  licenseStatus: IdentityLicenseStatusSchema,
  passport: z.object({
    status: PublicPassportStatusSchema,
    fields: PublicPassportFieldsSchema.nullable(),
  }),
  identityReady: z.boolean(),
});

/** ContractIdentityDraft public projection (provenance stays server-side). */
export const PublicIdentityDraftSchema = z.object({
  fullName: z.string().nullable(),
  nationality: z.string().nullable(),
  passportNumber: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  sex: z.string().nullable(),
  passportIssueDate: z.string().nullable(),
  passportExpiryDate: z.string().nullable(),
  issuingCountry: z.string().nullable(),
  driverLicenseNumber: z.string().nullable(),
  driverLicenseExpiryDate: z.string().nullable(),
  licenseStatus: IdentityLicenseStatusSchema,
  passportStatus: IdentityPassportStatusSchema,
  identityReady: z.boolean(),
  updatedAt: z.date().nullable(),
});

export const PublicRentalContextSchema = z.object({
  office: z.object({
    displayName: z.string(),
    company: ContractCompanyRefSchema.pick({ code: true, displayName: true }).extend({
      legalNameAr: z.string(),
      legalNameEn: z.string(),
    }),
  }),
  flow: z.object({ step: PublicRentalFlowStepSchema }),
  collection: z.object({
    mode: RentalCollectionModeSchema.nullable(),
  }),
  contract: z.object({
    contractNumber: z.string(),
    status: ContractStatusSchema,
    termsVersion: z.string(),
  }),
  vehicle: z.object({
    displayName: z.string(),
    vehicleType: z.string().nullable(),
    plateNumber: z.string().nullable(),
    modelYear: z.number().int().nullable(),
    color: z.string().nullable(),
    vin: z.string().nullable(),
  }),
  rental: z.object({
    rentalDays: z.number().int(),
    durationValue: z.number().int(),
    durationUnit: ContractDurationUnitSchema,
    agreedAmount: z.number().int(),
    currency: z.string(),
    startAt: z.date().nullable(),
    endAt: z.date().nullable(),
    actualPickupAt: z.date().nullable(),
    actualReturnAt: z.date().nullable(),
  }),
  customer: z
    .object({
      name: z.string(),
      mobile: z.string().nullable(),
      email: z.string().nullable(),
      nationality: z.string().nullable(),
      identityNumber: z.string().nullable(),
      passportNumber: z.string().nullable(),
      address: z.string().nullable(),
      drivingLicenseNumber: z.string().nullable(),
      drivingLicenseExpiry: z.string().nullable(),
    })
    .nullable(),
  licenseVerification: PublicLicenseVerificationSchema,
  identity: PublicIdentityStatusSchema,
  payment: z.object({
    status: ContractPaymentStatusSchema.nullable(),
    method: ContractPaymentMethodSchema.nullable(),
    amount: z.number().int().nullable(),
    currency: z.string(),
    providerAvailable: z.boolean(),
    devSimulationAvailable: z.boolean(),
    requiresCardSetupBeforeSigning: z.boolean(),
    /** Safe Stripe-derived card reference after free card linking; never PAN/CVV. */
    cardLast4: z.string().nullable().optional(),
    cardBrand: z.string().nullable().optional(),
    cardReady: z.boolean(),
    futureUseConsentAvailable: z.boolean(),
    futureUseConsent: z
      .object({
        version: z.string(),
        locale: z.enum(["en", "ar"]),
        text: z.string(),
        scope: z.string(),
      })
      .nullable(),
    /** PROCESSING without a persisted Checkout URL — Pay may recover the provider attempt. */
    checkoutRecoverable: z.boolean(),
  }),
  tarsOtp: TarsOtpPublicStateSchema,
});

export const PublicPaymentContextSchema = z.object({
  office: z.object({ displayName: z.string() }),
  contractNumber: z.string(),
  vehicle: z.object({
    displayName: z.string(),
    plateNumber: z.string().nullable(),
  }),
  rentalDays: z.number().int(),
  durationValue: z.number().int(),
  durationUnit: ContractDurationUnitSchema,
  agreedAmount: z.number().int(),
  currency: z.string(),
  payment: z.object({
    status: ContractPaymentStatusSchema.nullable(),
    method: ContractPaymentMethodSchema.nullable(),
  }),
  providerAvailable: z.boolean(),
  cardLast4: z.string().regex(/^\d{4}$/).nullable(),
  cardBrand: z.string().nullable(),
});

export const PaymentCheckoutSchema = z.object({
  payment: z.object({
    id: z.string().uuid().optional(),
    status: ContractPaymentStatusSchema,
    amount: z.number().int(),
    currency: z.string(),
    purpose: z.enum(["RENTAL", "RENEWAL", "RECONCILIATION", "POST_CLOSE_RECEIVABLE", "ROAD_LIABILITY"]).optional(),
    checkoutUrl: z.string().url().nullable().optional(),
    checkoutExpiresAt: z.date().nullable().optional(),
  }),
  checkoutUrl: z.string().url().nullable().optional(),
  statusToken: z.string().nullable(),
  providerAvailable: z.boolean(),
  noPaymentRequired: z.boolean().optional(),
});

export const PublicPaymentStartBodySchema = z.object({
  savePaymentMethodForFutureUse: z.boolean().optional().default(false),
  consentVersion: z.string().optional(),
});

export const PublicPaymentAttemptSchema = PaymentCheckoutSchema.extend({
  payment: PaymentCheckoutSchema.shape.payment.extend({
    method: ContractPaymentMethodSchema,
  }),
});

export const PublicCardSetupSchema = z.object({
  checkoutUrl: z.string().url(),
  providerAvailable: z.boolean(),
});

export const PublicCardSetupReturnQuerySchema = z.object({
  setupSessionId: z.string().min(8).max(255),
});

export const PublicCardSetupReturnSchema = z.object({
  status: z.enum(["PROCESSING", "CONFIRMED", "FAILED", "CANCELLED", "EXPIRED", "UNKNOWN"]),
  cardLast4: z.string().regex(/^\d{4}$/).nullable(),
  cardBrand: z.string().nullable(),
  providerAvailable: z.boolean(),
});

export const PublicPaymentStatusSchema = z.object({
  status: ContractPaymentStatusSchema,
  contractStatus: ContractStatusSchema.nullable(),
  purpose: z.enum(["RENTAL", "RENEWAL", "RECONCILIATION", "POST_CLOSE_RECEIVABLE", "ROAD_LIABILITY"]).optional(),
  checkoutUrl: z.string().url().nullable().optional(),
  summary: z
    .object({
      contractNumber: z.string(),
      vehicle: z.object({
        displayName: z.string(),
        plateNumber: z.string().nullable(),
      }),
      amount: z.number().int(),
      currency: z.string(),
      cardLast4: z.string().regex(/^\d{4}$/).nullable(),
      cardBrand: z.string().nullable(),
      paymentMethodSavedForFutureUse: z.boolean().optional(),
    })
    .optional(),
});

export const ContractPaymentPurposeSchema = z.enum([
  "RENTAL",
  "RENEWAL",
  "RECONCILIATION",
  "POST_CLOSE_RECEIVABLE",
  "ROAD_LIABILITY",
]);

export const PaymentStatusTokenParam = z.object({
  statusToken: z.string().min(16).max(128),
});

export const AttachmentRefSchema = z.object({
  id: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
});

// ── Official contract (one authoritative DTO; sections follow the paper agreement) ──

const SignatureStatusSchema = z.enum(["NOT_SIGNED", "SIGNED"]);
const CustodyEventStatusSchema = z.enum(["NOT_AVAILABLE", "RECORDED"]);
export const OfficialSignatureSlotSchema = z.enum([
  "HIRER",
  "ADDITIONAL_DRIVER",
  "SPONSOR",
  "VEHICLE_OUT_HIRER",
  "VEHICLE_IN_HIRER",
]);

const OfficialCustodySchema = z.object({
  status: CustodyEventStatusSchema,
  occurredAt: z.date().nullable(),
  mileage: z.number().int().nullable(),
  fuel: z.string().nullable(),
  /** Inspection angles photographed at the event (condition evidence). No file references. */
  inspectionAngles: z.array(CarOutEvidenceAngleSchema),
  /** Structured damage marks on the paper diagrams. */
  damage: z.array(z.object({ zone: z.string(), type: DamageMarkTypeSchema })),
  signatureStatus: SignatureStatusSchema,
});

const OfficialSignatureSchema = z.object({
  status: SignatureStatusSchema,
  /** When the signature image was captured (or the legacy acceptance time). */
  signedAt: z.date().nullable(),
  /** A stored image can be streamed from the token-scoped signature route. */
  hasImage: z.boolean(),
  required: z.boolean(),
});

/// Company identity as printed on the agreement. Frozen into the signed snapshot
/// at SIGNED, so a later fleet transfer never re-brands an existing contract.
/// Contracts signed before multi-company existed carry no company block; the
/// backend resolves those to UNIQUE on read WITHOUT rewriting the stored JSON.
export const OfficialContractCompanySchema = z.object({
  code: z.string(),
  displayName: z.string(),
  legalNameAr: z.string(),
  legalNameEn: z.string(),
  accentColor: z.string(),
});

export const OfficialContractViewSchema = z.object({
  header: z.object({
    officeDisplayName: z.string(),
    company: OfficialContractCompanySchema,
  }),
  contract: z.object({
    agreementNumber: z.string(),
    status: ContractStatusSchema,
    templateVersion: z.string(),
    termsVersion: z.string(),
  }),
  vehicle: z.object({
    plateCode: z.string().nullable(),
    plateNumber: z.string().nullable(),
    vehicleType: z.string().nullable(),
    yearMade: z.number().int().nullable(),
    color: z.string().nullable(),
    notes: z.string().nullable(),
  }),
  hirer: z.object({
    name: z.string().nullable(),
    nationality: z.string().nullable(),
    passportNumber: z.string().nullable(),
    address: z.string().nullable(),
    telephone: z.string().nullable(),
    driverLicenseNumber: z.string().nullable(),
    driverLicenseExpiryDate: z.string().nullable(),
  }),
  additionalDriver: z.object({
    name: z.string().nullable(),
    nationality: z.string().nullable(),
    driverLicenseNumber: z.string().nullable(),
  }),
  sponsor: z.object({
    name: z.string().nullable(),
    idNumber: z.string().nullable(),
  }),
  rental: z.object({
    plannedStartAt: z.date().nullable(),
    plannedEndAt: z.date().nullable(),
    durationValue: z.number().int(),
    durationUnit: ContractDurationUnitSchema,
    /** Legacy calendar-day count kept for frozen snapshots signed before structured duration. */
    numberOfDays: z.number().int().optional(),
    /** True when the planned end equals start + structured duration. */
    periodConsistent: z.boolean().nullable(),
    // Price policy: no rental price, rate amount or rate basis on the official contract.
    // Pricing stays internal (Contract, payment, Finance, staff APIs).
    includedKmPerDay: z.number().int().nullable(),
    extraKmRate: z.number().nullable(),
  }),
  /** Contract-only card reference: last 4 digits. The full number is never stored. */
  card: z.object({ last4: z.string().nullable() }),
  vehicleOut: OfficialCustodySchema,
  vehicleIn: OfficialCustodySchema,
  signatures: z.object({
    hirer: OfficialSignatureSchema,
    additionalDriver: OfficialSignatureSchema,
    sponsor: OfficialSignatureSchema,
    vehicleOutHirer: OfficialSignatureSchema,
    vehicleInHirer: OfficialSignatureSchema,
  }),
  identity: z.object({ identityReady: z.boolean() }),
  permissions: z.object({
    canEdit: z.boolean(),
    editableFields: z.array(z.string()),
    /** Backend-owned custody capabilities. Public contract review keeps both locked. */
    vehicleOut: z.object({
      canEditDamage: z.boolean(),
      canEditMileage: z.boolean(),
      canEditFuel: z.boolean(),
      canSign: z.boolean(),
    }),
    vehicleIn: z.object({
      canEditDamage: z.boolean(),
      canEditMileage: z.boolean(),
      canEditFuel: z.boolean(),
      canSign: z.boolean(),
    }),
    /** Signature slots the customer may capture now. */
    signableSlots: z.array(OfficialSignatureSlotSchema),
    /** All sign preconditions except the action itself are satisfied. */
    canSign: z.boolean(),
    missingRequirements: z.array(z.string()),
  }),
  /** Semantic paper order for the A4 renderer (field paths, no styling). */
  layout: z.object({
    sections: z.array(z.string()),
    infoGrid: z.array(z.array(z.array(z.string()))),
  }),
});

const ReviewText = (max: number) => z.string().trim().min(1).max(max).nullable();

/**
 * Customer review overrides. Strict: any system-locked key (vehicle, rate,
 * days, dates, agreement number, staff terms, Car-Out/Car-In, deposit, full
 * card data) is rejected. `null` clears an override.
 */
export const OfficialContractReviewPatchSchema = z
  .object({
    hirerName: ReviewText(200),
    nationality: ReviewText(80),
    passportNumber: ReviewText(50),
    address: ReviewText(400),
    telephone: z
      .string()
      .trim()
      .regex(/^\+?[\d\s()-]{6,30}$/, "Invalid telephone")
      .nullable(),
    additionalDriverName: ReviewText(200),
    additionalDriverNationality: ReviewText(80),
    additionalDriverLicenseNumber: ReviewText(50),
    sponsorName: ReviewText(200),
    sponsorIdNumber: ReviewText(50),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

/** Staff-only official-contract terms that have no other Diamond source. */
export const OfficialContractStaffTermsSchema = z
  .object({
    plateCode: z.string().trim().min(1).max(20).nullable(),
    contractNotes: z.string().trim().min(1).max(500).nullable(),
    includedKmPerDay: z.number().int().min(0).max(10_000).nullable(),
    extraKmRate: z
      .number()
      .min(0)
      .max(100_000)
      .refine((n) => Math.round(n * 100) === n * 100, "At most 2 decimals")
      .nullable(),
    damageIn: z.array(DamageMarkSchema).max(DAMAGE_ZONES.length).nullable(),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const OfficialContractSignSchema = z
  .object({ termsVersion: z.string().trim().min(1).max(80).optional() })
  .strict();

export const OFFICIAL_SIGNATURE_SLOT_PATHS = {
  hirer: "HIRER",
  "additional-driver": "ADDITIONAL_DRIVER",
  sponsor: "SPONSOR",
  "vehicle-out-hirer": "VEHICLE_OUT_HIRER",
  "vehicle-in-hirer": "VEHICLE_IN_HIRER",
} as const;

export const OfficialSignatureSlotParam = ContractTokenParam.extend({
  slot: z.enum(["hirer", "additional-driver", "sponsor", "vehicle-out-hirer", "vehicle-in-hirer"]),
});

export type OfficialContractView = z.infer<typeof OfficialContractViewSchema>;
export type OfficialContractReviewPatch = z.infer<typeof OfficialContractReviewPatchSchema>;
export type OfficialContractStaffTerms = z.infer<typeof OfficialContractStaffTermsSchema>;

export type CreateOfferInput = z.infer<typeof CreateOfferSchema>;
export type ContractDetail = z.infer<typeof ContractDetailSchema>;
export type ContractListItem = z.infer<typeof ContractListItemSchema>;
