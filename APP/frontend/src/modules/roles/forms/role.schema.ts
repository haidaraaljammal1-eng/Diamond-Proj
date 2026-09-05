import { z } from "zod";

/**
 * Frontend validation compatible with the Backend contract
 * (`CreateRoleSchema` / `UpdateRoleSchema` in the Fastify roles module).
 * Messages are stable validation keys, never raw Zod defaults.
 */
export const createRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "required" })
    .max(100, { message: "tooLong" }),
  description: z.string().trim().max(500, { message: "tooLong" }),
});

export const editRoleSchema = createRoleSchema;

export type CreateRoleValues = z.infer<typeof createRoleSchema>;
export type EditRoleValues = z.infer<typeof editRoleSchema>;
