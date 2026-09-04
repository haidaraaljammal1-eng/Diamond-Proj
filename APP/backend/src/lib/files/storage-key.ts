import { randomBytes } from "node:crypto";
import path from "node:path";

/**
 * Generate a safe, server-controlled storage key. The client's original
 * filename is NEVER used as a storage path — this prevents path traversal and
 * collisions. Only a sanitized extension is preserved.
 */
const SAFE_EXT = /^[a-z0-9]{1,8}$/;

export function generateStorageKey(originalName: string): string {
  const ext = path.extname(originalName).replace(".", "").toLowerCase();
  const safeExt = SAFE_EXT.test(ext) ? `.${ext}` : "";
  const random = randomBytes(16).toString("hex");
  // Date-less, purely random key (Date.* is fine at runtime; kept out for
  // determinism in tests). Uniqueness comes from 128 bits of randomness.
  return `${random}${safeExt}`;
}

/** Resolve a storage key to an absolute path, rejecting traversal attempts. */
export function resolveStoragePath(storageDir: string, storageKey: string): string {
  const baseDir = path.resolve(storageDir);
  const resolved = path.resolve(baseDir, storageKey);
  if (resolved !== path.join(baseDir, path.basename(storageKey))) {
    throw new Error("Invalid storage key");
  }
  return resolved;
}
