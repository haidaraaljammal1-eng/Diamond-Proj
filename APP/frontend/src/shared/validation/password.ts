import { z } from "zod";

/** Matches Backend `MIN_PASSWORD_LENGTH` in `src/lib/security/password.ts`. */
export const PASSWORD_MIN_LENGTH = 8;
/** Matches Backend `CreateUserSchema` password max. */
export const PASSWORD_MAX_LENGTH = 200;

/**
 * New-password rules for FormBuilder schemas.
 * Messages are stable `validation.*` keys — never raw Zod defaults.
 */
export const passwordValueSchema = z
  .string()
  .min(1, { message: "required" })
  .min(PASSWORD_MIN_LENGTH, { message: "passwordMin" })
  .max(PASSWORD_MAX_LENGTH, { message: "tooLong" })
  .regex(/[A-Za-z]/, { message: "passwordLetter" })
  .regex(/[0-9]/, { message: "passwordNumber" });
