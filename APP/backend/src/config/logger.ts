import type { FastifyServerOptions } from "fastify";
import { env, isDevelopment } from "src/config/env";

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
    ],
    censor: "[REDACTED]",
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
