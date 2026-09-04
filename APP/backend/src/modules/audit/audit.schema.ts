import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";

export const AuditLogSchema = z.object({
  id: z.string(),
  actorUserId: z.number().int().nullable(),
  action: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  metadata: z.any().nullable(),
  requestId: z.string().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.date(),
});

export const ListAuditQuerySchema = PaginationQuerySchema.extend({
  actorUserId: z.coerce.number().int().positive().optional(),
  action: z.string().trim().min(1).optional(),
  entityType: z.string().trim().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.string().optional(),
});
