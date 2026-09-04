import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { paginate, parseSort } from "src/lib/http/pagination";
import type { z } from "zod";
import type { ListAuditQuerySchema } from "src/modules/audit/audit.schema";

// Scalar columns a client may sort the audit log by (whitelist — a raw field is
// never passed to Prisma). Actor is a resolved name, not a sortable column here.
const AUDIT_SORTABLE = ["action", "entityType", "createdAt"] as const;

/** Audit log is read-only: no create/update/delete through the API. */
export function createAuditService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function list(query: z.infer<typeof ListAuditQuerySchema>) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const { field, direction } = parseSort(query.sort, AUDIT_SORTABLE, {
      field: "createdAt",
      direction: "desc",
    });

    return paginate({
      page: query.page,
      pageSize: query.pageSize,
      count: () => prisma.auditLog.count({ where }),
      findMany: (skip, take) =>
        prisma.auditLog.findMany({
          where,
          orderBy: { [field]: direction } as Prisma.AuditLogOrderByWithRelationInput,
          skip,
          take,
          select: {
            id: true,
            actorUserId: true,
            action: true,
            entityType: true,
            entityId: true,
            metadata: true,
            requestId: true,
            ip: true,
            userAgent: true,
            createdAt: true,
          },
        }),
    });
  }

  return { list };
}
