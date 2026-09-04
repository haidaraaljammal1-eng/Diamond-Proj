import { z } from "zod";

/** Numeric path id (users, roles, permissions, settings). */
export const NumericIdParam = z.object({
  id: z.coerce.number().int().positive(),
});

/** UUID path id (notifications, attachments). */
export const UuidIdParam = z.object({
  id: z.uuid(),
});

export const UserStatusSchema = z.enum(["PENDING", "ACTIVE", "SUSPENDED"]);
