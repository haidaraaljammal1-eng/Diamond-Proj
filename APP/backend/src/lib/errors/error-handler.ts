import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from "fastify-type-provider-zod";
import { resolveLanguage, t, type Language } from "src/config/i18n";
import { HttpStatus } from "src/constants/http-status";
import { ErrorCode, type ErrorCode as ErrorCodeValue } from "src/constants/error-codes";
import { isAppError } from "src/lib/errors/app-error";
import { mapPrismaError } from "src/lib/db/prisma-error";

interface ErrorBody {
  code: ErrorCodeValue;
  message: string;
  details?: unknown;
  context?: Record<string, unknown>;
  conflicts?: unknown[];
  suggestedActions?: unknown[];
  requestId: string;
}

function send(reply: FastifyReply, status: number, body: ErrorBody) {
  return reply.status(status).send({ error: body });
}

function requestLanguage(request: FastifyRequest): Language {
  const fromCtx = (request as { language?: Language }).language;
  return fromCtx ?? resolveLanguage(request.headers["accept-language"]);
}

/**
 * Single global error handler → one consistent error envelope:
 *   { error: { code, message, details?, context?, conflicts?, suggestedActions?, requestId } }
 * Expected/business errors log at warn; unexpected errors log at error with the
 * stack. Stack traces are NEVER sent to clients; requestId is, to aid support.
 */
export function globalErrorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const lng = requestLanguage(request);
  const requestId = request.id;

  // 1) Structured application error (the primary path).
  if (isAppError(error)) {
    request.log.warn(
      { code: error.code, statusCode: error.statusCode },
      "application error",
    );
    return send(reply, error.statusCode, {
      code: error.code,
      message: t(error.message, { lng, ...error.context }),
      details: error.details,
      context: error.context,
      conflicts: error.conflicts,
      suggestedActions: error.suggestedActions,
      requestId,
    });
  }

  // 2) Request validation errors (zod type provider).
  if (hasZodFastifySchemaValidationErrors(error)) {
    const details = error.validation.map((v) => ({
      path:
        (v.params?.issue as { path?: (string | number)[] } | undefined)?.path?.join(
          ".",
        ) ??
        v.instancePath ??
        "",
      message: v.message ?? "",
    }));
    request.log.warn({ details }, "request validation failed");
    return send(reply, HttpStatus.UNPROCESSABLE_ENTITY, {
      code: ErrorCode.VALIDATION_ERROR,
      message: t("Validation failed", { lng }),
      details,
      requestId,
    });
  }

  // 3) Response serialization error = our bug, not the client's.
  if (isResponseSerializationError(error)) {
    request.log.error({ err: error }, "response serialization error");
    return send(reply, HttpStatus.INTERNAL_SERVER_ERROR, {
      code: ErrorCode.INTERNAL_ERROR,
      message: t("Internal server error", { lng }),
      requestId,
    });
  }

  // 4) Known Prisma errors → structured, without leaking DB internals.
  const prismaMapped = mapPrismaError(error);
  if (prismaMapped) {
    request.log.warn({ code: prismaMapped.code }, "database constraint error");
    return send(reply, prismaMapped.statusCode, {
      code: prismaMapped.code,
      message: t(prismaMapped.message, { lng }),
      context: prismaMapped.context,
      requestId,
    });
  }

  // 5) Framework errors that carry a client (<500) status: rate-limit, jwt, etc.
  const status = error.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    const { code, messageKey } = classifyClientStatus(status);
    request.log.warn({ statusCode: status, err: error.code }, "client error");
    return send(reply, status, { code, message: t(messageKey, { lng }), requestId });
  }

  // 6) Anything else is an unexpected server error.
  request.log.error({ err: error }, "unhandled error");
  return send(reply, HttpStatus.INTERNAL_SERVER_ERROR, {
    code: ErrorCode.INTERNAL_ERROR,
    message: t("Internal server error", { lng }),
    requestId,
  });
}

function classifyClientStatus(status: number): {
  code: ErrorCodeValue;
  messageKey: string;
} {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return { code: ErrorCode.UNAUTHORIZED, messageKey: "Authentication required" };
    case HttpStatus.FORBIDDEN:
      return { code: ErrorCode.FORBIDDEN, messageKey: "Forbidden" };
    case HttpStatus.NOT_FOUND:
      return { code: ErrorCode.NOT_FOUND, messageKey: "Not found" };
    case HttpStatus.TOO_MANY_REQUESTS:
      return {
        code: ErrorCode.RATE_LIMITED,
        messageKey: "Too many requests, please try again later",
      };
    default:
      return { code: ErrorCode.VALIDATION_ERROR, messageKey: "Validation failed" };
  }
}
