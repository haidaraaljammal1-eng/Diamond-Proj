import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { BooleanQueryParam, CodeSchema } from "src/lib/master-data/code";

export const VehicleModelPublicSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  modelYear: z.number().int().nullable(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type VehicleModelPublic = z.infer<typeof VehicleModelPublicSchema>;

export const ListVehicleModelsQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  active: BooleanQueryParam,
  sort: z.string().optional(),
});

const ModelYear = z.number().int().min(1900).max(2100);

export const CreateVehicleModelSchema = z.object({
  // Optional in the UI (auto-minted when blank), but models are an IMPORT key
  // (`vehicleModelCode` in the Excel) — so a user/ERP that needs matching can
  // still supply their own code here.
  code: CodeSchema.optional(),
  name: z.string().trim().min(1).max(150),
  modelYear: ModelYear.optional(),
});

export const UpdateVehicleModelSchema = z
  .object({
    code: CodeSchema,
    name: z.string().trim().min(1).max(150),
    modelYear: ModelYear.nullable(),
  })
  .partial();
