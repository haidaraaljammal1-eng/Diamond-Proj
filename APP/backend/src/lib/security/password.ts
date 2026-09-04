import { hash, verify, Algorithm } from "@node-rs/argon2";

/**
 * Password hashing — argon2id. Passwords are NEVER stored or compared in
 * plaintext. `verifyPassword` returns false (never throws) on malformed hashes.
 * `@node-rs/argon2` ships prebuilt binaries (no node-gyp / build toolchain).
 */
const HASH_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456, // 19 MiB (OWASP baseline)
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, HASH_OPTIONS);
}

export async function verifyPassword(
  hashString: string,
  plain: string,
): Promise<boolean> {
  try {
    return await verify(hashString, plain);
  } catch {
    return false;
  }
}

export const MIN_PASSWORD_LENGTH = 8;

export function validatePasswordStrength(password: string): {
  valid: boolean;
  reason?: string;
} {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, reason: "Password does not meet the minimum requirements" };
  }
  return { valid: true };
}
