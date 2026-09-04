import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAuthService } from "src/modules/auth/auth.service";
import {
  AccountSetupSchema,
  LoginSchema,
  PasswordResetConfirmSchema,
  PasswordResetRequestSchema,
  LoginResponseSchema,
  RefreshSchema,
  TokenPairSchema,
} from "src/modules/auth/auth.schema";
import { MessageResponseSchema, commonErrorResponses } from "src/lib/http/response";
import { authRateLimit } from "src/plugins/rate-limit";
import { t } from "src/config/i18n";

export default async function authPublicRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const auth = createAuthService(fastify);

  app.post(
    "/login",
    {
      config: authRateLimit(),
      schema: {
        summary:
          "Authenticate and receive access + refresh tokens, or a two-factor challenge",
        operationId: "login",
        tags: ["Auth"],
        public: true,
        body: LoginSchema,
        response: { 200: LoginResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => {
      const result = await auth.login(request.body, {
        ip: request.ip,
        userAgent: request.headers["user-agent"],
      });
      request.setAudit({
        action: result.requiresTwoFactor ? "auth.login.two_factor_required" : "auth.login",
        entityType: "user",
      });
      return { data: result };
    },
  );

  app.post(
    "/refresh",
    {
      config: authRateLimit(),
      schema: {
        summary: "Rotate refresh token and issue a new access token",
        operationId: "refresh",
        tags: ["Auth"],
        public: true,
        body: RefreshSchema,
        response: { 200: TokenPairSchema, ...commonErrorResponses },
      },
    },
    async (request) => {
      const tokens = await auth.refresh(request.body.refreshToken, {
        ip: request.ip,
        userAgent: request.headers["user-agent"],
      });
      return { data: tokens };
    },
  );

  app.post(
    "/password-reset-request",
    {
      config: authRateLimit(),
      schema: {
        summary: "Request a password reset link",
        operationId: "requestPasswordReset",
        tags: ["Auth"],
        public: true,
        body: PasswordResetRequestSchema,
        response: { 200: MessageResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => {
      await auth.requestPasswordReset(request.body.email);
      return {
        data: {
          message: t("If the account exists, a reset link has been sent", {
            lng: request.language,
          }),
        },
      };
    },
  );

  app.post(
    "/password-reset-confirm",
    {
      config: authRateLimit(),
      schema: {
        summary: "Set a new password using a reset token",
        operationId: "confirmPasswordReset",
        tags: ["Auth"],
        public: true,
        body: PasswordResetConfirmSchema,
        response: { 200: MessageResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => {
      await auth.confirmPasswordReset(request.body);
      return { data: { message: t("Password updated", { lng: request.language }) } };
    },
  );

  app.post(
    "/account-setup",
    {
      config: authRateLimit(),
      schema: {
        summary: "Complete account setup by setting a password",
        operationId: "accountSetup",
        tags: ["Auth"],
        public: true,
        body: AccountSetupSchema,
        response: { 200: MessageResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => {
      await auth.setupAccount(request.body);
      return { data: { message: t("Account activated", { lng: request.language }) } };
    },
  );
}
