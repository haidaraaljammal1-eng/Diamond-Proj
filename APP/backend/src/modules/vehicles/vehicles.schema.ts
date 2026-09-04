import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { BooleanQueryParam } from "src/lib/master-data/code";

export const VehiclePublicSchema = z.object({
  id: z.number().int(),
  vin: z.string().nullable(),
  modelId: z.number().int(),
  modelYear: z.number().int().nullable(),
  // CX display context only (free-text ERP/import label, e.g. "Pearl White").
  color: z.string().nullable(),
  externalId: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type VehiclePublic = z.infer<typeof VehiclePublicSchema>;

export const ListVehiclesQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  modelId: z.coerce.number().int().positive().optional(),
  active: BooleanQueryParam,
  sort: z.string().optional(),
});

const Vin = z.string().trim().min(1).max(64);
const ModelYear = z.number().int().min(1900).max(2100);
const ExternalId = z.string().trim().min(1).max(100);
const Color = z.string().trim().min(1).max(60);

export const CreateVehicleSchema = z.object({
  vin: Vin.optional(),
  modelId: z.number().int().positive(),
  modelYear: ModelYear.optional(),
  color: Color.optional(),
  externalId: ExternalId.optional(),
});

export const UpdateVehicleSchema = z
  .object({
    vin: Vin.nullable(),
    modelId: z.number().int().positive(),
    modelYear: ModelYear.nullable(),
    color: Color.nullable(),
    externalId: ExternalId.nullable(),
  })
  .partial();
