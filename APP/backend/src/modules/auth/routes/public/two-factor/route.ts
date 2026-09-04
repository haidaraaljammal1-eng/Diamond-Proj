import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createAuthService } from "src/modules/auth/auth.service";
import {
  RecoveryLoginResponseSchema,
  TokenPairSchema,
} from "src/modules/auth/auth.schema";
import {
  VerifyRecoveryCodeChallengeSchema,
  VerifyTwoFactorChallengeSchema,
} from "src/modules/auth/two-factor.schema";
import { commonErrorResponses } from "src/lib/http/response";
import { authRateLimit } from "src/plugins/rate-limit";

/**
 * Second step of a two-factor login. Public because the caller has no session
 * yet — the challenge token issued by /auth/login is the only credential, and it
 * grants nothing except the right to attempt this exchange.
 *
 * Mounts under /auth/two-factor.
 */
export default async function twoFactorPublicRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const auth = createAuthService(fastify);

  app.post(
    "/verify",
    {
      config: authRateLimit(),
      schema: {
        summary: "Complete a two-factor login with an authenticator code",
        operationId: "verifyTwoFactorChallenge",
        tags: ["Auth"],
        public: true,
        body: VerifyTwoFactorChallengeSchema,
        response: { 200: TokenPairSchema, ...commonErrorResponses },
      },
    },
    async (request) => {
      const tokens = await auth.completeTwoFactorLogin(
        request.body.challengeToken,
        request.body.code,
        { ip: request.ip, userAgent: request.headers["user-agent"] },
      );
      request.setAudit({
        action: "security.two_factor.login_verified",
        entityType: "user",
        metadata: { method: "totp" },
      });
      return { data: tokens };
    },
  );

  app.post(
    "/recovery",
    {
      config: authRateLimit(),
      schema: {
        summary: "Complete a two-factor login with a single-use recovery code",
        operationId: "verifyTwoFactorRecoveryCode",
        tags: ["Auth"],
        public: true,
        body: VerifyRecoveryCodeChallengeSchema,
        response: { 200: RecoveryLoginResponseSchema, ...commonErrorResponses },
      },
    },
    async (request) => {
      const result = await auth.completeRecoveryCodeLogin(
        request.body.challengeToken,
        request.body.recoveryCode,
        { ip: request.ip, userAgent: request.headers["user-agent"] },
      );
      request.setAudit({
        action: "security.two_factor.recovery_code_used",
        entityType: "user",
        metadata: { remaining: result.recoveryCodesRemaining },
      });
      return { data: result };
    },
  );
}
