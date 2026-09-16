import { timingSafeEqual } from "node:crypto";
import { encryptSecret, decryptSecret } from "src/lib/security/encryption";
import { WHATSAPP_CREDENTIAL_PREFIX } from "src/modules/whatsapp/whatsapp.constants";

/**
 * WhatsApp access tokens at rest. Reuses AES-256-GCM `encryptSecret`.
 * Ciphertext is prefixed `enc:v1:` so a later key-rotation version can be
 * introduced without rewriting callers. The key lives in runtime config
 * (COOKIE_SECRET-derived today), never in the database.
 */
export function encryptWhatsAppCredential(plaintext: string): string {
  return `${WHATSAPP_CREDENTIAL_PREFIX}${encryptSecret(plaintext)}`;
}

export function decryptWhatsAppCredential(payload: string): string {
  if (!payload.startsWith(WHATSAPP_CREDENTIAL_PREFIX)) {
    throw new Error("Unsupported WhatsApp credential encoding");
  }
  return decryptSecret(payload.slice(WHATSAPP_CREDENTIAL_PREFIX.length));
}

export function hashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
