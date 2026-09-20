import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { env, isDevelopment } from "src/config/env";
import { resolveLanguage, t } from "src/config/i18n";
import { ErrorCode } from "src/constants/error-codes";

/**
 * Global baseline rate limit (per-instance, in-memory). Sensitive auth routes
 * (login, password reset, refresh) opt into a STRICTER limit via
 * `config.rateLimit` using `authRateLimit()`. The 429 response uses the same
 * error envelope as everything else.
 *
 * Buckets are keyed per CALLER, not per IP: the Frontend's Next server calls the
 * Backend (`/auth/me`, `/auth/refresh`) from a single address, and in development
 * browser and server share `127.0.0.1` — an IP key puts every user and both
 * processes in one bucket, so ordinary dashboard traffic 429s. Liveness probes are
 * exempt so a health check can never consume a caller's budget.
 */
export function rateLimitKey(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    return `t:${createHash("sha256").update(authorization.slice(7)).digest("hex").slice(0, 32)}`;
  }
  return `ip:${request.ip}`;
}

export function isLivenessProbe(request: FastifyRequest): boolean {
  return request.url === "/" || request.url.startsWith("/health");
}

export const rateLimitPlugin = fp(
  async (fastify) => {
    await fastify.register(rateLimit, {
      global: true,
      // Development reloads the app on every save (HMR + full page reloads), which
      // is not the traffic shape the production budget describes.
      max: isDevelopment
        ? Math.max(env.RATE_LIMIT_GLOBAL_MAX, 1000)
        : env.RATE_LIMIT_GLOBAL_MAX,
      timeWindow: env.RATE_LIMIT_GLOBAL_WINDOW,
      keyGenerator: rateLimitKey,
      allowList: (request) => isLivenessProbe(request),
      errorResponseBuilder: (request, context) => {
        const lng = resolveLanguage(request.headers["accept-language"]);
        // @fastify/rate-limit THROWS this object into the global error handler
        // (index.js: `throw params.errorResponseBuilder(...)`). The handler routes
        // framework errors by `error.statusCode`, so it must be present here or the
        // response degrades to a 500 instead of a 429 (see error-handler.ts step 5).
        return {
          statusCode: context.statusCode ?? 429,
          error: {
            code: ErrorCode.RATE_LIMITED,
            message: t("Too many requests, please try again later", { lng }),
            requestId: request.id,
          },
        };
      },
    });
  },
  { name: "rate-limit" },
);

/** Per-route strict limit for sensitive auth endpoints. */
export function authRateLimit() {
  return {
    rateLimit: {
      max: env.RATE_LIMIT_AUTH_MAX,
      timeWindow: env.RATE_LIMIT_AUTH_WINDOW,
    },
  };
}

/**
 * Stricter than the global limiter, looser than login. Used for authenticated
 * security-sensitive mutations (WhatsApp linking) that still need a few
 * sequential steps (start → authorize → select).
 */
export function sensitiveMutationRateLimit() {
  return {
    rateLimit: {
      max: Math.max(env.RATE_LIMIT_AUTH_MAX * 4, 20),
      timeWindow: env.RATE_LIMIT_AUTH_WINDOW,
    },
  };
}

/**
 * Manual staff WhatsApp send. One conversation per request — not a marketing cap.
 * Higher than linking because a desk may send several replies in one minute.
 */
export function whatsappSendRateLimit() {
  return {
    rateLimit: {
      max: Math.max(env.RATE_LIMIT_AUTH_MAX * 12, 60),
      timeWindow: env.RATE_LIMIT_AUTH_WINDOW,
    },
  };
}
