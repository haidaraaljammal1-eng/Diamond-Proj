import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { BooleanQueryParam, CodeSchema } from "src/lib/master-data/code";

export const RegionPublicSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type RegionPublic = z.infer<typeof RegionPublicSchema>;

export const ListRegionsQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  active: BooleanQueryParam,
  sort: z.string().optional(),
});

export const CreateRegionSchema = z.object({
  // Optional — the UI no longer asks for a region code; the service mints one when
  // omitted. Still accepted for external callers that key on a code.
  code: CodeSchema.optional(),
  name: z.string().trim().min(1).max(150),
});

export const UpdateRegionSchema = z
  .object({
    code: CodeSchema,
    name: z.string().trim().min(1).max(150),
  })
  .partial();
