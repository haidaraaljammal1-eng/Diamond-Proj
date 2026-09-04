import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";

export const RolePublicSchema = z.object({
  id: z.number().int(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type RolePublic = z.infer<typeof RolePublicSchema>;

export const ListRolesQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).optional(),
  sort: z.string().optional(),
});

export const CreateRoleSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]*$/, "key must be lowercase snake_case")
    .max(50),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  permissionKeys: z.array(z.string()).default([]),
});

export const UpdateRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).nullable(),
  })
  .partial();

export const SetRolePermissionsSchema = z.object({
  permissionKeys: z.array(z.string()),
});
