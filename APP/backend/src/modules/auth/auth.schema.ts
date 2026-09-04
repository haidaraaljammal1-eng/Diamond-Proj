import { z } from "zod";
import { UserPublicSchema } from "src/modules/users/users.schema";
import { MIN_PASSWORD_LENGTH } from "src/lib/security/password";

export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const PasswordResetRequestSchema = z.object({
  email: z.email(),
});

export const PasswordResetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH),
});

export const AccountSetupSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(MIN_PASSWORD_LENGTH),
});

export const TokenPairSchema = z.object({
  data: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal("Bearer"),
    expiresIn: z.number().int(),
    refreshExpiresAt: z.date(),
  }),
});

/** A recovery-code login also reports how many codes the user has left. */
export const RecoveryLoginResponseSchema = z.object({
  data: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal("Bearer"),
    expiresIn: z.number().int(),
    refreshExpiresAt: z.date(),
    recoveryCodesRemaining: z.number().int(),
  }),
});

/**
 * Login is two-shaped. `requiresTwoFactor` is the discriminant, and it is
 * present on BOTH branches so a client can switch on one field without probing
 * for the presence of `accessToken`.
 *
 * The challenge branch is deliberately NOT a session: it carries no access
 * token, and its `challengeToken` is an opaque value that the access-token guard
 * cannot accept.
 */
export const LoginResponseSchema = z.object({
  data: z.discriminatedUnion("requiresTwoFactor", [
    z.object({
      requiresTwoFactor: z.literal(false),
      accessToken: z.string(),
      refreshToken: z.string(),
      tokenType: z.literal("Bearer"),
      expiresIn: z.number().int(),
      refreshExpiresAt: z.date(),
    }),
    z.object({
      requiresTwoFactor: z.literal(true),
      challengeToken: z.string(),
      expiresIn: z.number().int(),
    }),
  ]),
});

export const MeResponseSchema = z.object({ data: UserPublicSchema });

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  refreshExpiresAt: Date;
};

export type LoginResult =
  | ({ requiresTwoFactor: false } & TokenPair)
  | { requiresTwoFactor: true; challengeToken: string; expiresIn: number };
