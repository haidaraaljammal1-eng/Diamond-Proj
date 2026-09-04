import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { BooleanQueryParam, CodeSchema } from "src/lib/master-data/code";

export const CityPublicSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  regionId: z.number().int(),
  // Lightweight parent reference so list/detail render the region name without a
  // per-row lookup (avoids frontend N+1). Optional: create/update/status
  // responses serialize the same schema without the relation loaded.
  region: z
    .object({ id: z.number().int(), code: z.string(), name: z.string() })
    .optional(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type CityPublic = z.infer<typeof CityPublicSchema>;

export const ListCitiesQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  active: BooleanQueryParam,
  regionId: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
});

export const CreateCitySchema = z.object({
  // Optional — the UI no longer asks for a city code; the service mints one when
  // omitted. Still accepted for external callers that key on a code.
  code: CodeSchema.optional(),
  name: z.string().trim().min(1).max(150),
  regionId: z.number().int().positive(),
});

export const UpdateCitySchema = z
  .object({
    code: CodeSchema,
    name: z.string().trim().min(1).max(150),
    regionId: z.number().int().positive(),
  })
  .partial();
