import { encryptSecret, decryptSecret } from "src/lib/security/encryption";

export function encryptSecretBlob(obj: Record<string, string>): string {
  return encryptSecret(JSON.stringify(obj));
}

export function decryptSecretBlob(cipher: string | null): Record<string, string> {
  if (!cipher) return {};
  let plain: string;
  try {
    plain = decryptSecret(cipher);
  } catch {
    return {};
  }
  // A JSON blob ({ password: … }) is the canonical shape; but tolerate a raw
  // single-secret string (e.g. an SMTP password stored directly via
  // `encryptSecret(input.secret)`) so a DB email config is usable either way —
  // no migration required. Back-compat + forward-compat for the SMTP password.
  try {
    const parsed = JSON.parse(plain) as unknown;
    if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
  } catch {
    /* not JSON — fall through to raw-secret handling */
  }
  return { password: plain };
}

/** Incoming blank/undefined = keep existing (blank = "leave unchanged" from UI). */
export function mergeSecrets(
  existing: Record<string, string>,
  incoming: Record<string, string | undefined>,
): Record<string, string> {
  const out = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (v != null && v !== "") out[k] = v;
  }
  return out;
}

export function maskSecret(value: string): string {
  const revealed = value.length > 4 ? value.slice(-4) : "";
  return `••••${revealed}`;
}

export function secretHints(blob: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(blob)) out[k] = maskSecret(v);
  return out;
}
