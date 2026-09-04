import type { FastifyInstance } from "fastify";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";
import { createApiKeysService } from "src/modules/reports/api-keys.service";
import { loadReportConfig } from "src/modules/reports/reports.config";

/** Per-instance, per-api-key sliding-window rate limiter (independent of the login limit). */
const buckets = new Map<number, { count: number; windowStart: number }>();

/**
 * External API-key authentication (onRequest). Reads `Authorization: Bearer <key>`
 * or `X-API-Key`, validates it, attaches `request.apiAuth`, and applies an
 * api-key-scoped rate limit. Usage is logged on response (safe metadata only).
 */
export function verifyApiKey(fastify: FastifyInstance): void {
  const apiKeys = createApiKeysService(fastify);

  fastify.addHook("onRequest", async (request, reply) => {
    const header = request.headers["authorization"];
    const bearer = typeof header === "string" && header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
    const raw = bearer ?? (typeof request.headers["x-api-key"] === "string" ? (request.headers["x-api-key"] as string) : null);
    if (!raw) throw new AppError({ code: ErrorCode.UNAUTHORIZED, message: "Invalid or unauthorized API key", context: { reason: "api_key_invalid" } });

    const auth = await apiKeys.verify(raw); // throws 401 on invalid/revoked/expired
    request.apiAuth = auth;

    // Per-key rate limit (separate from the login/global limiter).
    const config = await loadReportConfig(fastify);
    const limit = config.apiRateLimitPerMinute;
    const nowMs = Date.now();
    const b = buckets.get(auth.apiKeyId);
    if (!b || nowMs - b.windowStart >= 60_000) buckets.set(auth.apiKeyId, { count: 1, windowStart: nowMs });
    else {
      b.count += 1;
      if (b.count > limit) {
        reply.header("retry-after", "60");
        throw new AppError({ code: ErrorCode.RATE_LIMITED, message: "Too many requests, please try again later", context: { reason: "api_rate_limited", apiKeyId: auth.apiKeyId } });
      }
    }
  });

  // Safe API usage log (no payload/PII).
  fastify.addHook("onResponse", async (request, reply) => {
    if (!request.apiAuth) return;
    void fastify.prisma.apiUsageLog
      .create({ data: { apiKeyId: request.apiAuth.apiKeyId, endpoint: request.routeOptions?.url ?? request.url, method: request.method, status: reply.statusCode, requestId: request.id } })
      .catch(() => undefined);
  });
}
