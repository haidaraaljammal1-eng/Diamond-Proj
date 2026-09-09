import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { UuidIdParam } from "src/lib/http/common-schemas";
import {
  FUEL_LEVELS,
  INSPECTION_ANGLES,
} from "src/modules/contracts/contracts.constants";

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
export const ContractPriceTypeSchema = z.enum(["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"]);
export const ContractLinkTypeSchema = z.enum(["RENTAL", "RETURN", "RENEWAL"]);
export const ContractPaymentMethodSchema = z.enum(["BANK_TRANSFER", "CARD", "MANUAL"]);
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

export const CreateOfferSchema = z.object({
  vehicleId: z.number().int().positive(),
  priceType: ContractPriceTypeSchema,
  rentalDays: Days,
  agreedAmount: MoneyAed.min(1),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  depositAmount: MoneyAed.optional(),
  customerId: z.number().int().positive().optional(),
  assignedEmployeeUserId: z.number().int().positive().optional(),
});

export const ListContractsQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
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

export const CarOutSchema = z.object({
  occurredAt: z.coerce.date().optional(),
  mileageOut: z.number().int().nonnegative(),
  fuelOut: FuelLevelSchema,
  notes: z.string().trim().max(2000).optional(),
  photos: z.array(InspectionPhotoInputSchema).length(8),
});

export const CarInSchema = z.object({
  occurredAt: z.coerce.date().optional(),
  mileageIn: z.number().int().nonnegative(),
  fuelIn: FuelLevelSchema,
  notes: z.string().trim().max(2000).optional(),
  photos: z.array(InspectionPhotoInputSchema).length(8),
});

export const ReconciliationLineInputSchema = z.object({
  type: ReconciliationLineTypeSchema,
  description: z.string().trim().min(1).max(300),
  amount: z.number().int(),
  externalReference: z.string().trim().min(1).max(200).nullable().optional(),
  sourceDomain: z.string().trim().min(1).max(50).nullable().optional(),
});

export const ReconcileSchema = z.object({
  lines: z.array(ReconciliationLineInputSchema).min(1).max(50),
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

export const ContractListItemSchema = z.object({
  id: z.string(),
  contractNumber: z.string(),
  status: ContractStatusSchema,
  vehicleId: z.number().int(),
  vehicleName: z.string(),
  plateNumber: z.string().nullable(),
  customerId: z.number().int().nullable(),
  customerName: z.string().nullable(),
  priceType: ContractPriceTypeSchema,
  rentalDays: z.number().int(),
  agreedAmount: z.number().int(),
  currency: z.string(),
  startAt: z.date().nullable(),
  endAt: z.date().nullable(),
  createdAt: z.date(),
});

const InspectionPhotoPublicSchema = z.object({
  id: z.string(),
  attachmentId: z.string(),
  angle: InspectionAngleSchema,
  url: z.string(),
});

export const ContractDetailSchema = z.object({
  id: z.string(),
  contractNumber: z.string(),
  status: ContractStatusSchema,
  vehicleId: z.number().int(),
  customerId: z.number().int().nullable(),
  createdByUserId: z.number().int(),
  assignedEmployeeUserId: z.number().int().nullable(),
  priceType: ContractPriceTypeSchema,
  rentalDays: z.number().int(),
  agreedAmount: z.number().int(),
  currency: z.string(),
  startAt: z.date().nullable(),
  endAt: z.date().nullable(),
  depositAmount: z.number().int().nullable(),
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
  carOut: z
    .object({
      id: z.string(),
      occurredAt: z.date(),
      mileageOut: z.number().int(),
      fuelOut: z.string(),
      notes: z.string().nullable(),
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
      depositAmount: z.number().int(),
      deductions: z.number().int(),
      finalAmount: z.number().int(),
      approvedAt: z.date().nullable(),
      lines: z.array(
        z.object({
          id: z.string(),
          type: ReconciliationLineTypeSchema,
          description: z.string(),
          amount: z.number().int(),
          externalReference: z.string().nullable(),
          sourceDomain: z.string().nullable(),
        }),
      ),
    })
    .nullable(),
  renewals: z.array(
    z.object({
      id: z.string(),
      additionalDays: z.number().int(),
      additionalAmount: z.number().int(),
      previousEndAt: z.date(),
      newEndAt: z.date(),
      createdAt: z.date(),
      approvedAt: z.date().nullable(),
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
  office: z.object({ displayName: z.string() }),
  contractNumber: z.string(),
  status: ContractStatusSchema,
  priceType: ContractPriceTypeSchema,
  rentalDays: z.number().int(),
  agreedAmount: z.number().int(),
  currency: z.string(),
  startAt: z.date().nullable(),
  endAt: z.date().nullable(),
  depositAmount: z.number().int().nullable(),
  termsVersion: z.string(),
  vehicle: z.object({
    displayName: z.string(),
    plateNumber: z.string().nullable(),
    color: z.string().nullable(),
    modelYear: z.number().int().nullable(),
  }),
  renewal: PublicRenewalOfferSchema.nullable().optional(),
});

export const PublicLicenseVerificationSchema = z.object({
  status: DrivingLicenseVerificationStatusSchema,
  licenseNumber: z.string().nullable(),
  licenseNumberMasked: z.string().nullable(),
  expiryDate: z.string().nullable(),
  confidence: z.number().nullable(),
});

export const PublicRentalContextSchema = z.object({
  office: z.object({ displayName: z.string() }),
  flow: z.object({ step: PublicRentalFlowStepSchema }),
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
    agreedAmount: z.number().int(),
    currency: z.string(),
    depositAmount: z.number().int().nullable(),
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
  payment: z.object({
    status: ContractPaymentStatusSchema.nullable(),
    method: ContractPaymentMethodSchema.nullable(),
    amount: z.number().int().nullable(),
    currency: z.string(),
    providerAvailable: z.boolean(),
  }),
});

export const PublicPaymentContextSchema = z.object({
  office: z.object({ displayName: z.string() }),
  contractNumber: z.string(),
  vehicle: z.object({
    displayName: z.string(),
    plateNumber: z.string().nullable(),
  }),
  rentalDays: z.number().int(),
  agreedAmount: z.number().int(),
  currency: z.string(),
  payment: z.object({
    status: ContractPaymentStatusSchema.nullable(),
    method: ContractPaymentMethodSchema.nullable(),
  }),
  providerAvailable: z.boolean(),
});

export const PublicPaymentAttemptSchema = z.object({
  payment: z.object({
    status: ContractPaymentStatusSchema,
    amount: z.number().int(),
    currency: z.string(),
    method: ContractPaymentMethodSchema,
  }),
  statusToken: z.string().nullable(),
  providerAvailable: z.boolean(),
});

export const PublicPaymentStatusSchema = z.object({
  status: ContractPaymentStatusSchema,
  contractStatus: ContractStatusSchema.nullable(),
});

export const PaymentStatusTokenParam = z.object({
  statusToken: z.string().min(16).max(128),
});

export const AttachmentRefSchema = z.object({
  id: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
});

export type CreateOfferInput = z.infer<typeof CreateOfferSchema>;
export type ContractDetail = z.infer<typeof ContractDetailSchema>;
export type ContractListItem = z.infer<typeof ContractListItemSchema>;
