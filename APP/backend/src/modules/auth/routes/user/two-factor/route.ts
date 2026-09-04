import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireAuth } from "src/lib/context/auth-context";
import {
  MessageResponseSchema,
  commonErrorResponses,
  dataResponse,
} from "src/lib/http/response";
import { authRateLimit } from "src/plugins/rate-limit";
import { t } from "src/config/i18n";
import { createTwoFactorService } from "src/modules/auth/two-factor.service";
import {
  ConfirmTwoFactorSetupSchema,
  RecoveryCodesSchema,
  StartTwoFactorSetupSchema,
  TwoFactorReauthSchema,
  TwoFactorSetupSchema,
  TwoFactorStatusSchema,
} from "src/modules/auth/two-factor.schema";

/**
 * Self-service two-factor management. Every route acts on the AUTHENTICATED
 * user: the id comes from the session, never from the request body, so there is
 * no shape of this API that changes another account's 2FA. No permission is
 * declared — like the notification inbox, authorization here is ownership.
 *
 * Mounts under /auth/two-factor.
 */
export default async function twoFactorUserRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const twoFactor = createTwoFactorService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "My two-factor authentication status",
        operationId: "getMyTwoFactorStatus",
        tags: ["Auth"],
        response: { 200: dataResponse(TwoFactorStatusSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await twoFactor.status(requireAuth(request).id) }),
  );

  app.post(
    "/setup",
    {
      config: authRateLimit(),
      schema: {
        summary: "Begin two-factor enrolment and receive the QR / manual key",
        operationId: "startTwoFactorSetup",
        tags: ["Auth"],
        body: StartTwoFactorSetupSchema,
        response: { 200: dataResponse(TwoFactorSetupSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      const setup = await twoFactor.startSetup(identity.id, request.body.password);
      // The action only — the payload embeds the secret and must never be audited.
      request.setAudit({
        action: "security.two_factor.setup_started",
        entityType: "user",
        entityId: String(identity.id),
      });
      return { data: setup };
    },
  );

  app.post(
    "/setup/verify",
    {
      config: authRateLimit(),
      schema: {
        summary: "Confirm two-factor enrolment and receive the recovery codes",
        operationId: "confirmTwoFactorSetup",
        tags: ["Auth"],
        body: ConfirmTwoFactorSetupSchema,
        response: { 200: dataResponse(RecoveryCodesSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      const recoveryCodes = await twoFactor.confirmSetup(
        identity.id,
        request.body.code,
        identity.sessionId,
      );
      request.setAudit({
        action: "security.two_factor.enabled",
        entityType: "user",
        entityId: String(identity.id),
      });
      return { data: { recoveryCodes } };
    },
  );

  app.post(
    "/setup/cancel",
    {
      schema: {
        summary: "Discard a pending two-factor enrolment",
        operationId: "cancelTwoFactorSetup",
        tags: ["Auth"],
        response: { 200: MessageResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      await twoFactor.cancelSetup(identity.id);
      request.setAudit({
        action: "security.two_factor.setup_cancelled",
        entityType: "user",
        entityId: String(identity.id),
      });
      return { data: { message: t("Setup cancelled", { lng: request.language }) } };
    },
  );

  app.post(
    "/disable",
    {
      config: authRateLimit(),
      schema: {
        summary: "Disable two-factor authentication (password + second factor)",
        operationId: "disableTwoFactor",
        tags: ["Auth"],
        body: TwoFactorReauthSchema,
        response: { 200: MessageResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      await twoFactor.disable(identity.id, request.body, identity.sessionId);
      request.setAudit({
        action: "security.two_factor.disabled",
        entityType: "user",
        entityId: String(identity.id),
      });
      return {
        data: {
          message: t("Two-factor authentication disabled", { lng: request.language }),
        },
      };
    },
  );

  app.post(
    "/recovery-codes",
    {
      config: authRateLimit(),
      schema: {
        summary: "Replace the recovery codes (password + second factor)",
        operationId: "regenerateTwoFactorRecoveryCodes",
        tags: ["Auth"],
        body: TwoFactorReauthSchema,
        response: { 200: dataResponse(RecoveryCodesSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      const recoveryCodes = await twoFactor.regenerateRecoveryCodes(
        identity.id,
        request.body,
      );
      request.setAudit({
        action: "security.two_factor.recovery_codes_regenerated",
        entityType: "user",
        entityId: String(identity.id),
        metadata: { count: recoveryCodes.length },
      });
      return { data: { recoveryCodes } };
    },
  );
}
