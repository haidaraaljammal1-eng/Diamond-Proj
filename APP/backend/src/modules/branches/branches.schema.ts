import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { BooleanQueryParam, CodeSchema } from "src/lib/master-data/code";

export const BranchPublicSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  cityId: z.number().int().nullable(),
  // Lightweight parent reference so list/detail render the city name without a
  // per-row lookup (avoids frontend N+1). Optional: create/update/status
  // responses serialize the same schema without the relation loaded; nullable
  // because the parent city is itself optional (cityId may be null).
  city: z
    .object({ id: z.number().int(), code: z.string(), name: z.string() })
    .nullable()
    .optional(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type BranchPublic = z.infer<typeof BranchPublicSchema>;

export const ListBranchesQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  active: BooleanQueryParam,
  cityId: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
});

export const CreateBranchSchema = z.object({
  // Optional in the UI (auto-minted when blank), but branches are an IMPORT key
  // (`branchCode` in the Excel) — so a user/ERP that needs matching can still
  // supply their own code here.
  code: CodeSchema.optional(),
  name: z.string().trim().min(1).max(150),
  cityId: z.number().int().positive().optional(),
});

export const UpdateBranchSchema = z
  .object({
    code: CodeSchema,
    name: z.string().trim().min(1).max(150),
    cityId: z.number().int().positive().nullable(),
  })
  .partial();
