import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "src/config/env";

/**
 * Authenticated symmetric encryption-at-rest (AES-256-GCM). Used for values that
 * must be recoverable later but never stored in plaintext (e.g. a shared access
 * raw token that reminders must re-embed). The key is derived from COOKIE_SECRET
 * (already required, ≥32 chars). Output format: base64url(iv[12] || tag[16] || ct).
 *
 * TOTP secrets use a SEPARATE key (TWO_FACTOR_ENCRYPTION_KEY) rather than this
 * one: cookie/session secrets are rotated on a different schedule, and rotating
 * one must never lock every user out of their authenticator app.
 */

const KEY = createHash("sha256").update(env.COOKIE_SECRET).digest(); // 32 bytes
const TWO_FACTOR_KEY = createHash("sha256")
  .update(env.TWO_FACTOR_ENCRYPTION_KEY)
  .digest();
const IV_LEN = 12;

function encryptWith(key: Buffer, plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64url");
}

function decryptWith(key: Buffer, payload: string): string {
  const buf = Buffer.from(payload, "base64url");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const ct = buf.subarray(IV_LEN + 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function encryptSecret(plaintext: string): string {
  return encryptWith(KEY, plaintext);
}

export function decryptSecret(payload: string): string {
  return decryptWith(KEY, payload);
}

/** Encrypt a TOTP secret for storage. Throws on a tampered/undecryptable value. */
export function encryptTwoFactorSecret(plaintext: string): string {
  return encryptWith(TWO_FACTOR_KEY, plaintext);
}

export function decryptTwoFactorSecret(payload: string): string {
  return decryptWith(TWO_FACTOR_KEY, payload);
}
