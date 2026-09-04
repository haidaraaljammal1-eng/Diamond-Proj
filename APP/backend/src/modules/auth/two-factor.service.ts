import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { Secret, TOTP } from "otpauth";
import { env } from "src/config/env";
import { withTransaction } from "src/lib/db/transaction";
import {
  encryptTwoFactorSecret,
  decryptTwoFactorSecret,
} from "src/lib/security/encryption";
import { verifyPassword } from "src/lib/security/password";
import {
  generateOpaqueToken,
  hashToken,
  expiryFromNow,
  isExpired,
} from "src/lib/security/tokens";
import {
  challengeExpiredError,
  challengeInvalidError,
  invalidTwoFactorCodeError,
  passwordInvalidError,
  secondFactorRequiredError,
  tooManyAttemptsError,
  twoFactorAlreadyEnabledError,
  twoFactorNotEnabledError,
  twoFactorSetupNotStartedError,
} from "src/modules/auth/two-factor.errors";
import type {
  TwoFactorReauthInput,
  TwoFactorStatus,
} from "src/modules/auth/two-factor.schema";

/**
 * Two-factor authentication (TOTP, RFC 6238).
 *
 * Load-bearing invariants:
 *  - A generated QR is NOT enrolment. The secret lives in `twoFactorPending*`
 *    until one valid code promotes it; an abandoned setup simply expires.
 *  - The secret is AES-256-GCM encrypted under its own key and is excluded from
 *    query results by the global Prisma omit — reading it takes an explicit
 *    per-query override, which happens only in this file.
 *  - A TOTP time-step is honoured at most once per user (`twoFactorLastUsedStep`),
 *    so a code observed in transit cannot be replayed inside its 30s window.
 *  - Recovery codes are stored as SHA-256 hashes and consumed by a CONDITIONAL
 *    update, so concurrent redemptions of one code cannot both win.
 *  - The login challenge is an opaque SecurityToken row, never a JWT: the access
 *    guard accepts any JWT signed with JWT_ACCESS_SECRET, so a JWT challenge
 *    could reach protected APIs. An opaque token cannot pass jwtVerify() at all.
 */

const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6;
/** ±1 step (30s each) absorbs realistic clock drift without widening the window. */
const TOTP_WINDOW = 1;
const SECRET_BYTES = 20; // 160-bit, the RFC 4226 recommendation

/** Crockford-ish: no I/L/O/U/0/1, so codes survive being read aloud or retyped. */
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const RECOVERY_GROUP = 5;

function totpFor(secretBase32: string, label: string): TOTP {
  return new TOTP({
    issuer: env.TWO_FACTOR_ISSUER,
    label,
    algorithm: "SHA1", // what every mainstream authenticator app implements
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
    secret: Secret.fromBase32(secretBase32),
  });
}

/**
 * Validate a code and return the absolute time-step it belongs to, or null.
 * The step is what the replay guard records — not the code itself.
 */
function totpStepFor(secretBase32: string, code: string, at = Date.now()): number | null {
  const delta = totpFor(secretBase32, "verify").validate({
    token: code,
    window: TOTP_WINDOW,
    timestamp: at,
  });
  if (delta === null) return null;
  return Math.floor(at / 1000 / TOTP_PERIOD) + delta;
}

/**
 * `RECOVERY_ALPHABET.length` is 30 and 256 % 30 !== 0, so a plain `byte % 30`
 * would be biased. Reject the tail instead and redraw.
 */
function randomAlphabetChar(): string {
  const limit = 256 - (256 % RECOVERY_ALPHABET.length);
  for (;;) {
    const byte = randomBytes(1).readUInt8(0);
    if (byte < limit) return RECOVERY_ALPHABET.charAt(byte % RECOVERY_ALPHABET.length);
  }
}

function generateRecoveryCode(): string {
  const chars = Array.from({ length: RECOVERY_GROUP * 2 }, randomAlphabetChar);
  return `${chars.slice(0, RECOVERY_GROUP).join("")}-${chars.slice(RECOVERY_GROUP).join("")}`;
}

/** Compare on content only — the user may retype it lowercase or without the dash. */
function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function createTwoFactorService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  /** The ONLY place that lifts the global omit on the 2FA secret columns. */
  async function loadWithSecrets(userId: number) {
    return prisma.user.findUnique({
      where: { id: userId },
      omit: {
        passwordHash: false,
        twoFactorSecretEncrypted: false,
        twoFactorPendingSecretEncrypted: false,
      },
    });
  }

  async function requireUser(userId: number) {
    const user = await loadWithSecrets(userId);
    if (!user) throw challengeInvalidError();
    return user;
  }

  async function assertPassword(
    user: { passwordHash: string | null },
    password: string,
  ): Promise<void> {
    if (!user.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
      throw passwordInvalidError();
    }
  }

  /**
   * Record a freshly accepted TOTP step, conditional on the previously stored
   * one. Losing this race means another request already spent the step, which is
   * exactly the replay we are refusing.
   */
  async function claimTotpStep(
    userId: number,
    previousStep: number | null,
    step: number,
  ): Promise<boolean> {
    if (previousStep !== null && step <= previousStep) return false;
    const claimed = await prisma.user.updateMany({
      where: { id: userId, twoFactorLastUsedStep: previousStep },
      data: { twoFactorLastUsedStep: step },
    });
    return claimed.count === 1;
  }

  /** Redeem an unused recovery code. Conditional update ⇒ strictly single-use. */
  async function consumeRecoveryCode(userId: number, code: string): Promise<boolean> {
    const consumed = await prisma.twoFactorRecoveryCode.updateMany({
      where: { userId, codeHash: hashToken(normalizeRecoveryCode(code)), usedAt: null },
      data: { usedAt: new Date() },
    });
    return consumed.count === 1;
  }

  async function countRecoveryCodes(userId: number): Promise<number> {
    return prisma.twoFactorRecoveryCode.count({ where: { userId, usedAt: null } });
  }

  async function issueRecoveryCodes(userId: number): Promise<string[]> {
    const codes = Array.from(
      { length: env.TWO_FACTOR_RECOVERY_CODE_COUNT },
      generateRecoveryCode,
    );
    await withTransaction(prisma, async (tx) => {
      // Regenerating invalidates every outstanding code, used or not.
      await tx.twoFactorRecoveryCode.deleteMany({ where: { userId } });
      await tx.twoFactorRecoveryCode.createMany({
        data: codes.map((code) => ({
          userId,
          codeHash: hashToken(normalizeRecoveryCode(code)),
        })),
      });
    });
    return codes;
  }

  /**
   * A sensitive change (disable / regenerate) needs a LIVE second factor on top
   * of the password — otherwise a stolen password alone would undo 2FA.
   */
  async function assertSecondFactor(
    user: {
      id: number;
      twoFactorSecretEncrypted: string | null;
      twoFactorLastUsedStep: number | null;
    },
    input: Pick<TwoFactorReauthInput, "code" | "recoveryCode">,
  ): Promise<"totp" | "recovery_code"> {
    if (input.code) {
      if (!user.twoFactorSecretEncrypted) throw twoFactorNotEnabledError();
      const step = totpStepFor(
        decryptTwoFactorSecret(user.twoFactorSecretEncrypted),
        input.code,
      );
      if (step === null) throw invalidTwoFactorCodeError(true);
      if (!(await claimTotpStep(user.id, user.twoFactorLastUsedStep, step))) {
        throw invalidTwoFactorCodeError(true);
      }
      return "totp";
    }
    if (input.recoveryCode) {
      if (!(await consumeRecoveryCode(user.id, input.recoveryCode))) {
        throw invalidTwoFactorCodeError(true);
      }
      return "recovery_code";
    }
    throw secondFactorRequiredError();
  }

  /** Revoke every OTHER refresh session after a security-sensitive change. */
  async function revokeOtherSessions(
    userId: number,
    currentSessionId: string | undefined,
  ): Promise<void> {
    await prisma.authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentSessionId ? { NOT: { id: currentSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  async function status(userId: number): Promise<TwoFactorStatus> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        twoFactorEnabled: true,
        twoFactorEnabledAt: true,
        twoFactorPendingExpiresAt: true,
      },
    });
    return {
      enabled: user.twoFactorEnabled,
      enabledAt: user.twoFactorEnabledAt,
      pendingSetup:
        !user.twoFactorEnabled &&
        user.twoFactorPendingExpiresAt !== null &&
        !isExpired(user.twoFactorPendingExpiresAt),
      recoveryCodesRemaining: user.twoFactorEnabled
        ? await countRecoveryCodes(userId)
        : 0,
    };
  }

  /**
   * Mint a PENDING secret and the enrolment payload. Nothing about the account's
   * authentication changes here — logging in is unaffected until confirmSetup.
   */
  async function startSetup(userId: number, password: string) {
    const user = await requireUser(userId);
    if (user.twoFactorEnabled) throw twoFactorAlreadyEnabledError();
    await assertPassword(user, password);

    const secret = new Secret({ size: SECRET_BYTES });
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorPendingSecretEncrypted: encryptTwoFactorSecret(secret.base32),
        twoFactorPendingExpiresAt: expiryFromNow(env.TWO_FACTOR_SETUP_TTL),
      },
    });

    return {
      otpauthUri: totpFor(secret.base32, user.email).toString(),
      manualEntryKey: secret.base32,
      expiresIn: env.TWO_FACTOR_SETUP_TTL,
    };
  }

  /** Promote the pending secret — the single moment 2FA becomes active. */
  async function confirmSetup(
    userId: number,
    code: string,
    currentSessionId: string | undefined,
  ): Promise<string[]> {
    const user = await requireUser(userId);
    if (user.twoFactorEnabled) throw twoFactorAlreadyEnabledError();
    if (
      !user.twoFactorPendingSecretEncrypted ||
      !user.twoFactorPendingExpiresAt ||
      isExpired(user.twoFactorPendingExpiresAt)
    ) {
      throw twoFactorSetupNotStartedError();
    }

    const step = totpStepFor(
      decryptTwoFactorSecret(user.twoFactorPendingSecretEncrypted),
      code,
    );
    if (step === null) throw invalidTwoFactorCodeError(true);

    // Conditional on still being disabled: two concurrent confirmations cannot
    // both enable (and thus cannot both mint a set of recovery codes).
    const claimed = await prisma.user.updateMany({
      where: { id: userId, twoFactorEnabled: false },
      data: {
        twoFactorEnabled: true,
        twoFactorSecretEncrypted: user.twoFactorPendingSecretEncrypted,
        twoFactorEnabledAt: new Date(),
        twoFactorPendingSecretEncrypted: null,
        twoFactorPendingExpiresAt: null,
        // The confirming code is spent — it cannot immediately be reused to log in.
        twoFactorLastUsedStep: step,
      },
    });
    if (claimed.count === 0) throw twoFactorAlreadyEnabledError();

    const codes = await issueRecoveryCodes(userId);
    await revokeOtherSessions(userId, currentSessionId);
    return codes;
  }

  /** Abandon a pending enrolment. Idempotent; never touches an active secret. */
  async function cancelSetup(userId: number): Promise<void> {
    await prisma.user.updateMany({
      where: { id: userId, twoFactorEnabled: false },
      data: { twoFactorPendingSecretEncrypted: null, twoFactorPendingExpiresAt: null },
    });
  }

  async function disable(
    userId: number,
    input: TwoFactorReauthInput,
    currentSessionId: string | undefined,
  ): Promise<void> {
    const user = await requireUser(userId);
    if (!user.twoFactorEnabled) throw twoFactorNotEnabledError();
    await assertPassword(user, input.password);
    await assertSecondFactor(user, input);

    await withTransaction(prisma, async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: false,
          twoFactorSecretEncrypted: null,
          twoFactorEnabledAt: null,
          twoFactorPendingSecretEncrypted: null,
          twoFactorPendingExpiresAt: null,
          twoFactorLastUsedStep: null,
        },
      });
      await tx.twoFactorRecoveryCode.deleteMany({ where: { userId } });
      await tx.securityToken.updateMany({
        where: { userId, scope: "TWO_FACTOR_CHALLENGE", usedAt: null },
        data: { usedAt: new Date() },
      });
    });
    await revokeOtherSessions(userId, currentSessionId);
  }

  async function regenerateRecoveryCodes(
    userId: number,
    input: TwoFactorReauthInput,
  ): Promise<string[]> {
    const user = await requireUser(userId);
    if (!user.twoFactorEnabled) throw twoFactorNotEnabledError();
    await assertPassword(user, input.password);
    await assertSecondFactor(user, input);
    return issueRecoveryCodes(userId);
  }

  // --- Login challenge -------------------------------------------------------

  async function createLoginChallenge(userId: number) {
    const rawToken = generateOpaqueToken();
    await prisma.securityToken.create({
      data: {
        userId,
        tokenHash: hashToken(rawToken),
        scope: "TWO_FACTOR_CHALLENGE",
        expiresAt: expiryFromNow(env.TWO_FACTOR_CHALLENGE_TTL),
      },
    });
    return { challengeToken: rawToken, expiresIn: env.TWO_FACTOR_CHALLENGE_TTL };
  }

  async function loadChallenge(challengeToken: string) {
    const record = await prisma.securityToken.findUnique({
      where: { tokenHash: hashToken(challengeToken) },
    });
    // Scope is checked explicitly: a password-reset token must never stand in
    // for a 2FA challenge.
    if (!record || record.scope !== "TWO_FACTOR_CHALLENGE" || record.usedAt) {
      throw challengeInvalidError();
    }
    if (isExpired(record.expiresAt)) throw challengeExpiredError();
    if (record.attempts >= env.TWO_FACTOR_MAX_ATTEMPTS) throw tooManyAttemptsError();
    return record;
  }

  /** Always throws. Burns the challenge once the attempt budget is exhausted. */
  async function registerFailedAttempt(challengeId: string): Promise<never> {
    const updated = await prisma.securityToken.update({
      where: { id: challengeId },
      data: { attempts: { increment: 1 } },
    });
    if (updated.attempts >= env.TWO_FACTOR_MAX_ATTEMPTS) {
      await prisma.securityToken.update({
        where: { id: challengeId },
        data: { usedAt: new Date() },
      });
      throw tooManyAttemptsError();
    }
    throw invalidTwoFactorCodeError(false);
  }

  /** Spend the challenge. Losing this race means it was already spent. */
  async function burnChallenge(challengeId: string): Promise<void> {
    const claimed = await prisma.securityToken.updateMany({
      where: { id: challengeId, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) throw challengeInvalidError();
  }

  /**
   * The account may have been suspended, or 2FA disabled from another session,
   * in the seconds between password verification and this call.
   */
  async function loadChallengeSubject(userId: number) {
    const user = await requireUser(userId);
    if (user.status !== "ACTIVE" || !user.twoFactorEnabled) throw challengeInvalidError();
    return user;
  }

  async function verifyChallengeTotp(
    challengeToken: string,
    code: string,
  ): Promise<number> {
    const challenge = await loadChallenge(challengeToken);
    const user = await loadChallengeSubject(challenge.userId);
    if (!user.twoFactorSecretEncrypted) throw challengeInvalidError();

    const step = totpStepFor(decryptTwoFactorSecret(user.twoFactorSecretEncrypted), code);
    // Wrong digits and a replayed step are indistinguishable to the caller: both
    // spend an attempt and return the same error.
    if (step === null || !(await claimTotpStep(user.id, user.twoFactorLastUsedStep, step))) {
      await registerFailedAttempt(challenge.id);
    }

    await burnChallenge(challenge.id);
    return user.id;
  }

  async function verifyChallengeRecoveryCode(
    challengeToken: string,
    recoveryCode: string,
  ): Promise<{ userId: number; recoveryCodesRemaining: number }> {
    const challenge = await loadChallenge(challengeToken);
    const user = await loadChallengeSubject(challenge.userId);

    if (!(await consumeRecoveryCode(user.id, recoveryCode))) {
      await registerFailedAttempt(challenge.id);
    }

    await burnChallenge(challenge.id);
    return {
      userId: user.id,
      recoveryCodesRemaining: await countRecoveryCodes(user.id),
    };
  }

  return {
    status,
    startSetup,
    confirmSetup,
    cancelSetup,
    disable,
    regenerateRecoveryCodes,
    createLoginChallenge,
    verifyChallengeTotp,
    verifyChallengeRecoveryCode,
  };
}

/** Exported for unit tests — the code/step math with no database involved. */
export const twoFactorInternals = {
  totpFor,
  totpStepFor,
  generateRecoveryCode,
  normalizeRecoveryCode,
  TOTP_PERIOD,
};
