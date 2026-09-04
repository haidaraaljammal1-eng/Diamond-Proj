import { randomBytes, createHash } from "node:crypto";

/**
 * Opaque secret tokens (refresh tokens, password-reset / account-setup tokens).
 * The RAW token is returned to the client exactly once; only its SHA-256 hash is
 * persisted, so a database read cannot recover a usable token.
 */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newFamilyId(): string {
  return randomBytes(16).toString("hex");
}

export function expiryFromNow(ttlSeconds: number): Date {
  return new Date(Date.now() + ttlSeconds * 1000);
}

export function isExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}
