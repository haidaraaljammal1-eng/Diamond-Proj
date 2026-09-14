import type { FastifyServerOptions } from "fastify";
import { env, isDevelopment } from "src/config/env";
import { redactSensitiveUrl } from "src/lib/security/redact";

/**
 * Structured logging with redaction. Secrets and auth headers are NEVER logged.
 * Attach request context via `request.log` (not the root logger) so requestId,
 * method, url and user context ride along automatically.
 */
export const loggerOptions: FastifyServerOptions["logger"] = {
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-refresh-token']",
      "res.headers['set-cookie']",
      "*.password",
      "*.passwordHash",
      "*.newPassword",
      "*.currentPassword",
      "*.token",
      "*.tokenHash",
      "*.refreshToken",
      "*.accessToken",
      "*.secret",
      "*.twoFactorSecretEncrypted",
      "*.twoFactorPendingSecretEncrypted",
      "*.otpauthUri",
      "*.manualEntryKey",
      "*.recoveryCode",
      "*.recoveryCodes",
      "*.challengeToken",
      "*.verify_token",
      "*.verifyToken",
      "*.appSecret",
      "*.app_secret",
      "*.textBody",
      "req.query['hub.verify_token']",
    ],
    censor: "[REDACTED]",
  },
  serializers: {
    req(request) {
      const raw = request as { method?: string; url?: string };
      return {
        method: raw.method,
        url: redactSensitiveUrl(raw.url),
      };
    },
  },
  ...(isDevelopment
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
};
