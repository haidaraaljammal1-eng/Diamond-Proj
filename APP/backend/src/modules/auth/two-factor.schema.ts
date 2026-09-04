import { z } from "zod";

/** A code produced by an authenticator app. Exactly six digits, nothing else. */
export const TotpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "The verification code must be 6 digits");

/**
 * A recovery code as the user sees it ("A7K2M-9PQR4"). Punctuation, spacing and
 * case are normalized server-side before hashing, so accept a loose shape here
 * and let verification be the judge.
 */
export const RecoveryCodeSchema = z.string().trim().min(8).max(40);

export const TwoFactorStatusSchema = z.object({
  enabled: z.boolean(),
  enabledAt: z.date().nullable(),
  /** A setup was started and has not expired, but no valid code has confirmed it. */
  pendingSetup: z.boolean(),
  recoveryCodesRemaining: z.number().int(),
});

export const StartTwoFactorSetupSchema = z.object({
  password: z.string().min(1),
});

/**
 * Returned once, while the setup is still PENDING. `otpauthUri` embeds the
 * secret, so it is never logged and never audited.
 */
export const TwoFactorSetupSchema = z.object({
  otpauthUri: z.string(),
  manualEntryKey: z.string(),
  expiresIn: z.number().int(),
});

export const ConfirmTwoFactorSetupSchema = z.object({
  code: TotpCodeSchema,
});

/** Raw recovery codes — shown exactly once, never retrievable again. */
export const RecoveryCodesSchema = z.object({
  recoveryCodes: z.array(z.string()),
});

/**
 * Re-authentication for a sensitive 2FA change: the current password AND a live
 * second factor (authenticator code or an unused recovery code).
 */
export const TwoFactorReauthSchema = z.object({
  password: z.string().min(1),
  code: TotpCodeSchema.optional(),
  recoveryCode: RecoveryCodeSchema.optional(),
});

export const VerifyTwoFactorChallengeSchema = z.object({
  challengeToken: z.string().min(1),
  code: TotpCodeSchema,
});

export const VerifyRecoveryCodeChallengeSchema = z.object({
  challengeToken: z.string().min(1),
  recoveryCode: RecoveryCodeSchema,
});

export type TwoFactorStatus = z.infer<typeof TwoFactorStatusSchema>;
export type TwoFactorReauthInput = z.infer<typeof TwoFactorReauthSchema>;
