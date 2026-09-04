import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { BooleanQueryParam, CodeSchema } from "src/lib/master-data/code";

export const DepartmentPublicSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  // Owning branch. Nullable only for legacy departments created before branch
  // scoping; every new department has one (see CreateDepartmentSchema).
  branchId: z.number().int().nullable(),
  branchName: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type DepartmentPublic = z.infer<typeof DepartmentPublicSchema>;

export const ListDepartmentsQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  active: BooleanQueryParam,
  sort: z.string().optional(),
});

export const CreateDepartmentSchema = z.object({
  // Optional business code. The UI no longer asks for it (departments relate by
  // id); when omitted the service mints a unique one internally. Still accepted so
  // an external system that keys on a code can supply its own.
  code: CodeSchema.optional(),
  name: z.string().trim().min(1).max(150),
  // REQUIRED owning branch — a user's branch scope is derived from their
  // departments, so every new department must belong to a branch. Immutable after
  // creation (see UpdateDepartmentSchema: no branchId).
  branchId: z.number().int().positive(),
});

// Branch is intentionally absent — a department's branch is IMMUTABLE after
// creation (moving it would silently rewrite the org scope of its users and
// complaints). Only name/code (code is itself immutable) are editable here.
export const UpdateDepartmentSchema = z
  .object({
    code: CodeSchema,
    name: z.string().trim().min(1).max(150),
  })
  .partial();
