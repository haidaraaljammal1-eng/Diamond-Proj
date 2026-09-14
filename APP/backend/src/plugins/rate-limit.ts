import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import { env } from "src/config/env";
import { resolveLanguage, t } from "src/config/i18n";
import { ErrorCode } from "src/constants/error-codes";

/**
 * Global baseline rate limit (per-instance, in-memory). Sensitive auth routes
 * (login, password reset, refresh) opt into a STRICTER limit via
 * `config.rateLimit` using `authRateLimit()`. The 429 response uses the same
 * error envelope as everything else.
 */
export const rateLimitPlugin = fp(
  async (fastify) => {
    await fastify.register(rateLimit, {
      global: true,
      max: env.RATE_LIMIT_GLOBAL_MAX,
      timeWindow: env.RATE_LIMIT_GLOBAL_WINDOW,
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
