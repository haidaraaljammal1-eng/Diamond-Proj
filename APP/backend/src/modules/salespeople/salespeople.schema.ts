import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { BooleanQueryParam, CodeSchema } from "src/lib/master-data/code";

export const SalespersonPublicSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  externalId: z.string().nullable(),
  userId: z.number().int().nullable(),
  branchId: z.number().int().nullable(),
  // Lightweight parent references so list/detail render branch + linked-account
  // names without a per-row lookup (avoids frontend N+1). Optional: create/
  // update/status responses serialize the same schema without the relations
  // loaded; nullable because both parents are themselves optional. The user
  // projection is intentionally limited to id/name/email — never sensitive data.
  branch: z
    .object({ id: z.number().int(), code: z.string(), name: z.string() })
    .nullable()
    .optional(),
  user: z
    .object({
      id: z.number().int(),
      name: z.string().nullable(),
      email: z.string(),
    })
    .nullable()
    .optional(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type SalespersonPublic = z.infer<typeof SalespersonPublicSchema>;

export const ListSalespeopleQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  active: BooleanQueryParam,
  branchId: z.coerce.number().int().positive().optional(),
  sort: z.string().optional(),
});

const ExternalId = z.string().trim().min(1).max(100);

export const CreateSalespersonSchema = z.object({
  // Optional business code. The UI no longer asks for it (a salesperson needs no
  // user-facing code — relations use the id); when omitted the service mints a
  // unique one internally. Still accepted so an ERP/import that keys on a code can
  // supply its own. See CodeSchema for the accepted format.
  code: CodeSchema.optional(),
  name: z.string().trim().min(1).max(150),
  externalId: ExternalId.optional(),
  userId: z.number().int().positive().optional(),
  branchId: z.number().int().positive().optional(),
});

export const UpdateSalespersonSchema = z
  .object({
    code: CodeSchema,
    name: z.string().trim().min(1).max(150),
    externalId: ExternalId.nullable(),
    userId: z.number().int().positive().nullable(),
    branchId: z.number().int().positive().nullable(),
  })
  .partial();
