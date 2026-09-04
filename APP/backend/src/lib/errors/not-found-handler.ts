import type { FastifyReply, FastifyRequest } from "fastify";
import { resolveLanguage, t } from "src/config/i18n";
import { HttpStatus } from "src/constants/http-status";
import { ErrorCode } from "src/constants/error-codes";

/** Consistent 404 for unmatched routes, using the same error envelope. */
export function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  const lng = resolveLanguage(request.headers["accept-language"]);
  return reply.status(HttpStatus.NOT_FOUND).send({
    error: {
      code: ErrorCode.NOT_FOUND,
      message: t("Not found", { lng }),
      requestId: request.id,
    },
  });
}
