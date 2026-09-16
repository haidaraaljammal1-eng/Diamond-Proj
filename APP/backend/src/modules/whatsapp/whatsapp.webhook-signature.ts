import { createHash, createHmac } from "node:crypto";
import { hashesEqual } from "src/modules/whatsapp/whatsapp.credentials";

const PREFIX = "sha256=";

/**
 * Meta X-Hub-Signature-256: HMAC-SHA256 of the exact raw body with APP_SECRET.
 * Constant-time compare. Never logs the secret or the digest.
 */
export function verifyMetaHubSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!appSecret || !signatureHeader) return false;
  if (!signatureHeader.startsWith(PREFIX)) return false;
  const provided = signatureHeader.slice(PREFIX.length).trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(provided)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return hashesEqual(expected, provided);
}

export function signMetaHubPayload(rawBody: Buffer, appSecret: string): string {
  return `${PREFIX}${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
}

export function sha256Hex(rawBody: Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asQueryString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

/**
 * GET hub.mode / hub.verify_token / hub.challenge.
 * Fail closed. Do not report which check failed.
 */
export function verifyMetaWebhookChallenge(
  query: unknown,
  verifyToken: string,
): { ok: true; challenge: string } | { ok: false } {
  if (!verifyToken) return { ok: false };
  const root = asRecord(query) ?? {};
  const hub = asRecord(root.hub);
  const mode = asQueryString(root["hub.mode"]) ?? asQueryString(hub?.mode);
  const incoming = asQueryString(root["hub.verify_token"]) ?? asQueryString(hub?.verify_token);
  const challenge = asQueryString(root["hub.challenge"]) ?? asQueryString(hub?.challenge);
  if (mode !== "subscribe") return { ok: false };
  if (!incoming || !hashesEqual(verifyToken, incoming)) return { ok: false };
  if (challenge === null || challenge.length === 0) return { ok: false };
  return { ok: true, challenge };
}
