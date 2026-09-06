import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { BooleanQueryParam } from "src/lib/master-data/code";

/** Demo-aligned operational status values (stable API contract). */
export const VehicleOperationalStatusDtoSchema = z.enum(["available", "rented", "service"]);
export type VehicleOperationalStatusDto = z.infer<typeof VehicleOperationalStatusDtoSchema>;

export const VehiclePublicSchema = z.object({
  id: z.number().int(),
  vin: z.string().nullable(),
  modelId: z.number().int(),
  modelYear: z.number().int().nullable(),
  // CX display context only (free-text ERP/import label, e.g. "Pearl White").
  color: z.string().nullable(),
  plateNumber: z.string().nullable(),
  dailyRate: z.number().int().nullable(),
  monthlyRate: z.number().int().nullable(),
  operationalStatus: VehicleOperationalStatusDtoSchema,
  externalId: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type VehiclePublic = z.infer<typeof VehiclePublicSchema>;

const ModelRefSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
});

export const VehicleImageSchema = z.object({
  id: z.string(),
  attachmentId: z.string(),
  sortOrder: z.number().int(),
  isPrimary: z.boolean(),
  mimeType: z.string(),
  /** Authenticated download path (vehicles.read). */
  url: z.string(),
});
export type VehicleImage = z.infer<typeof VehicleImageSchema>;

/**
 * Current operational rental summary. Populated only when the Contracts domain
 * exposes an active/retout/review rental for the vehicle. Until then, always null.
 */
export const VehicleCurrentRentalSchema = z
  .object({
    contractId: z.string(),
    customerName: z.string(),
    endAt: z.date(),
    status: z.enum(["active", "retout", "review"]),
  })
  .nullable();

export const VehicleCardSchema = VehiclePublicSchema.extend({
  displayName: z.string(),
  model: ModelRefSchema,
  primaryImage: VehicleImageSchema.nullable(),
  currentRental: VehicleCurrentRentalSchema,
});
export type VehicleCard = z.infer<typeof VehicleCardSchema>;

export const VehicleDetailSchema = VehicleCardSchema.extend({
  gallery: z.array(VehicleImageSchema),
});
export type VehicleDetail = z.infer<typeof VehicleDetailSchema>;

export const ListVehiclesQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  modelId: z.coerce.number().int().positive().optional(),
  active: BooleanQueryParam,
  /** Fleet page filter — omit or `all` for every operational status. */
  status: z
    .enum(["all", "available", "rented", "service"])
    .optional()
    .default("all"),
  sort: z.string().optional(),
});

const Vin = z.string().trim().min(1).max(64);
const ModelYear = z.number().int().min(1900).max(2100);
const ExternalId = z.string().trim().min(1).max(100);
const Color = z.string().trim().min(1).max(60);
const PlateNumber = z.string().trim().min(1).max(20);
const Rate = z.number().int().nonnegative();

export const CreateVehicleSchema = z.object({
  vin: Vin.optional(),
  modelId: z.number().int().positive(),
  modelYear: ModelYear.optional(),
  color: Color.optional(),
  plateNumber: PlateNumber.optional(),
  dailyRate: Rate.optional(),
  monthlyRate: Rate.optional(),
  operationalStatus: VehicleOperationalStatusDtoSchema.optional(),
  externalId: ExternalId.optional(),
});

export const UpdateVehicleSchema = z
  .object({
    vin: Vin.nullable(),
    modelId: z.number().int().positive(),
    modelYear: ModelYear.nullable(),
    color: Color.nullable(),
    plateNumber: PlateNumber.nullable(),
    dailyRate: Rate.nullable(),
    monthlyRate: Rate.nullable(),
    operationalStatus: VehicleOperationalStatusDtoSchema,
    externalId: ExternalId.nullable(),
  })
  .partial();
