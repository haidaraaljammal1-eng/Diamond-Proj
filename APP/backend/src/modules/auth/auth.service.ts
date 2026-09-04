import type { FastifyInstance } from "fastify";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";
import { env } from "src/config/env";
import { normalizeEmail } from "src/lib/security/normalize";
import {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from "src/lib/security/password";
import {
  expiryFromNow,
  generateOpaqueToken,
  hashToken,
  isExpired,
  newFamilyId,
} from "src/lib/security/tokens";
import { withTransaction } from "src/lib/db/transaction";
import { toUserPublic, userWithRolesInclude } from "src/modules/users/users.mapper";
import { createTwoFactorService } from "src/modules/auth/two-factor.service";
import type { LoginResult, TokenPair } from "src/modules/auth/auth.schema";
import type { SecurityTokenScope } from "@prisma/client";

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export function createAuthService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const twoFactor = createTwoFactorService(fastify);

  function signAccessToken(userId: number, sessionId: string): string {
    return fastify.jwt.sign(
      { sub: userId, sid: sessionId, type: "access" },
      { expiresIn: env.ACCESS_TOKEN_TTL },
    );
  }

  async function issueSession(userId: number, meta: RequestMeta): Promise<TokenPair> {
    const refreshToken = generateOpaqueToken();
    const refreshExpiresAt = expiryFromNow(env.REFRESH_TOKEN_TTL);
    const session = await prisma.authSession.create({
      data: {
        userId,
        familyId: newFamilyId(),
        refreshTokenHash: hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return {
      accessToken: signAccessToken(userId, session.id),
      refreshToken,
      tokenType: "Bearer",
      expiresIn: env.ACCESS_TOKEN_TTL,
      refreshExpiresAt,
    };
  }

  async function login(
    input: { email: string; password: string },
    meta: RequestMeta,
  ): Promise<LoginResult> {
    const email = normalizeEmail(input.email);
    // Override global omit to read the hash for verification only.
    const user = await prisma.user.findUnique({
      where: { email },
      omit: { passwordHash: false },
    });

    const invalid = () =>
      new AppError({
        code: ErrorCode.UNAUTHORIZED,
        message: "Invalid email or password",
      });

    if (!user || !user.passwordHash) throw invalid();
    if (user.status === "SUSPENDED") {
      throw new AppError({
        code: ErrorCode.ACCOUNT_SUSPENDED,
        message: "Account is suspended",
      });
    }
    const ok = await verifyPassword(user.passwordHash, input.password);
    if (!ok) throw invalid();

    // The password is correct, but on a 2FA account that buys only a challenge —
    // no session row is created and no access token is signed until the second
    // factor is verified.
    if (user.twoFactorEnabled) {
      return { requiresTwoFactor: true, ...(await twoFactor.createLoginChallenge(user.id)) };
    }

    return { requiresTwoFactor: false, ...(await issueSession(user.id, meta)) };
  }

  /** Exchange a verified 2FA challenge for a real session. */
  async function completeTwoFactorLogin(
    challengeToken: string,
    code: string,
    meta: RequestMeta,
  ): Promise<TokenPair> {
    const userId = await twoFactor.verifyChallengeTotp(challengeToken, code);
    return issueSession(userId, meta);
  }

  async function completeRecoveryCodeLogin(
    challengeToken: string,
    recoveryCode: string,
    meta: RequestMeta,
  ): Promise<TokenPair & { recoveryCodesRemaining: number }> {
    const { userId, recoveryCodesRemaining } =
      await twoFactor.verifyChallengeRecoveryCode(challengeToken, recoveryCode);
    return { ...(await issueSession(userId, meta)), recoveryCodesRemaining };
  }

  async function refresh(refreshToken: string, meta: RequestMeta): Promise<TokenPair> {
    const invalid = () =>
      new AppError({
        code: ErrorCode.TOKEN_INVALID,
        message: "Refresh token is invalid or has been revoked",
      });

    const session = await prisma.authSession.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
    });
    if (!session) throw invalid();

    // Reuse of an already-rotated / expired token → revoke the whole family.
    if (session.revokedAt || isExpired(session.expiresAt)) {
      await prisma.authSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw invalid();
    }

    // Win the rotation race atomically (only one refresh may consume the token).
    const claimed = await prisma.authSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date(), rotatedAt: new Date() },
    });
    if (claimed.count === 0) {
      await prisma.authSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw invalid();
    }

    const newRefresh = generateOpaqueToken();
    const refreshExpiresAt = expiryFromNow(env.REFRESH_TOKEN_TTL);
    const newSession = await prisma.authSession.create({
      data: {
        userId: session.userId,
        familyId: session.familyId,
        refreshTokenHash: hashToken(newRefresh),
        expiresAt: refreshExpiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return {
      accessToken: signAccessToken(session.userId, newSession.id),
      refreshToken: newRefresh,
      tokenType: "Bearer",
      expiresIn: env.ACCESS_TOKEN_TTL,
      refreshExpiresAt,
    };
  }

  async function logout(sessionId: string | undefined, userId: number): Promise<void> {
    if (!sessionId) return;
    await prisma.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async function me(userId: number) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: userWithRolesInclude,
    });
    return toUserPublic(user);
  }

  async function requestPasswordReset(emailInput: string): Promise<void> {
    const email = normalizeEmail(emailInput);
    const user = await prisma.user.findUnique({ where: { email } });
    // Identical behavior whether or not the account exists (no enumeration).
    if (user && user.status !== "SUSPENDED") {
      const raw = generateOpaqueToken();
      await prisma.securityToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(raw),
          scope: "PASSWORD_RESET",
          expiresAt: expiryFromNow(env.PASSWORD_RESET_TOKEN_TTL),
        },
      });
      const link = `${env.FRONTEND_URL}/reset-password?token=${raw}`;
      const result = await fastify.mailer.send({
        to: user.email,
        template: "password_reset",
        vars: { name: user.name ?? user.email, link },
      });
      // With email off (dev/seed default) the link never leaves the server, so
      // surface it in the log to make the flow testable without SMTP. Never in
      // production — a real deploy has EMAIL_ENABLED=true and sends the mail.
      if (result.status === "SKIPPED" && env.NODE_ENV !== "production") {
        fastify.log.warn({ to: user.email, link }, "password reset link (email disabled)");
      }
    }
  }

  async function setPasswordViaToken(
    token: string,
    password: string,
    scope: SecurityTokenScope,
  ): Promise<void> {
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Password does not meet the minimum requirements",
      });
    }

    const record = await prisma.securityToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (
      !record ||
      record.scope !== scope ||
      record.usedAt ||
      isExpired(record.expiresAt)
    ) {
      throw new AppError({
        code: ErrorCode.TOKEN_INVALID,
        message: "Invalid or expired token",
      });
    }

    const passwordHash = await hashPassword(password);
    await withTransaction(prisma, async (tx) => {
      await tx.securityToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, status: "ACTIVE" },
      });
      // Setting a new password invalidates all existing sessions.
      await tx.authSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  return {
    login,
    completeTwoFactorLogin,
    completeRecoveryCodeLogin,
    refresh,
    logout,
    me,
    requestPasswordReset,
    confirmPasswordReset: (input: { token: string; newPassword: string }) =>
      setPasswordViaToken(input.token, input.newPassword, "PASSWORD_RESET"),
    setupAccount: (input: { token: string; password: string }) =>
      setPasswordViaToken(input.token, input.password, "ACCOUNT_SETUP"),
  };
}
