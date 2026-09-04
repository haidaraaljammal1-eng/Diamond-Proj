import fp from "fastify-plugin";
import type { FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import type { AuditContext } from "src/types/fastify";
import { sanitizeForAudit, maskIp } from "src/lib/security/redact";

/**
 * Centralized audit writer. Handlers ENRICH context via `request.setAudit(...)`;
 * they do not write AuditLog rows themselves. One row is written per mutating,
 * successful request (or any request explicitly flagged with an action).
 * Request bodies are never logged; only handler-supplied metadata/before/after
 * are stored, and those are sanitized (secrets removed, PII masked).
 */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const auditPlugin = fp(
  async (fastify) => {
    fastify.decorateRequest("auditContext", null);
    fastify.decorateRequest(
      "setAudit",
      function (this: FastifyRequest, partial: Partial<AuditContext>) {
        const ctx: AuditContext = this.auditContext ?? (this.auditContext = {});
        if (partial.metadata) {
          ctx.metadata = { ...(ctx.metadata ?? {}), ...partial.metadata };
        }
        const { metadata: _metadata, ...rest } = partial;
        Object.assign(ctx, rest);
      },
    );

    fastify.addHook("onResponse", async (request, reply) => {
      const ctx = request.auditContext;
      const isMutating = MUTATING_METHODS.has(request.method);
      const shouldAudit = Boolean(ctx?.action) || (isMutating && reply.statusCode < 400);
      if (!shouldAudit || ctx?.skip) return;

      try {
        const routeUrl = request.routeOptions?.url ?? request.url;
        const metadata = sanitizeForAudit({
          status: reply.statusCode,
          ...(ctx?.metadata ?? {}),
        }) as Prisma.InputJsonValue;

        await fastify.prisma.auditLog.create({
          data: {
            actorUserId: request.auth?.id ?? null,
            action: ctx?.action ?? `${request.method} ${routeUrl}`,
            entityType: ctx?.entityType ?? null,
            entityId: ctx?.entityId ?? null,
            metadata,
            before:
              ctx?.before !== undefined
                ? (sanitizeForAudit(ctx.before) as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            after:
              ctx?.after !== undefined
                ? (sanitizeForAudit(ctx.after) as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            requestId: request.id,
            ip: maskIp(request.ip) ?? null,
            userAgent: request.headers["user-agent"] ?? null,
          },
        });
      } catch (err) {
        // Audit is best-effort — never break the response, but never fail silently.
        request.log.warn({ err }, "audit write failed");
      }
    });
  },
  { name: "audit", dependencies: ["prisma"] },
);
