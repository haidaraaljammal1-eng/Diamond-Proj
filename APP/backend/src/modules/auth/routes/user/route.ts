import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAuthService } from "src/modules/auth/auth.service";
import { MeResponseSchema } from "src/modules/auth/auth.schema";
import { MessageResponseSchema, commonErrorResponses } from "src/lib/http/response";
import { requireAuth } from "src/lib/context/auth-context";
import { t } from "src/config/i18n";

export default async function authUserRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const auth = createAuthService(fastify);

  app.get(
    "/me",
    {
      schema: {
        summary: "Current authenticated user",
        operationId: "getMe",
        tags: ["Auth"],
        response: { 200: MeResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      return { data: await auth.me(identity.id) };
    },
  );

  app.post(
    "/logout",
    {
      schema: {
        summary: "Revoke the current session",
        operationId: "logout",
        tags: ["Auth"],
        response: { 200: MessageResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      await auth.logout(identity.sessionId, identity.id);
      request.setAudit({ action: "auth.logout" });
      return { data: { message: t("Logged out", { lng: request.language }) } };
    },
  );
}
