/**
 * Sanitize arbitrary values before writing them to the audit log or logs.
 * Secret-keyed values are removed entirely; PII-keyed values are partially
 * masked. Depth / breadth / string-length are capped to bound the output.
 */
const SECRET_KEY =
  /(pass|password|passwordhash|token|tokenhash|secret|otp|totp|two[_-]?factor|recovery[_-]?code|backup[_-]?code|challenge|authorization|cookie|api[_-]?key|private[_-]?key|refresh|access[_-]?token|session)/i;
const PII_KEY = /(email|phone|mobile|national|ssn|iban|card)/i;

const MAX_DEPTH = 6;
const MAX_ARRAY = 50;
const MAX_STRING = 1000;
const REDACTED = "[REDACTED]";

function maskPii(value: unknown): unknown {
  if (typeof value !== "string" || value.length === 0) return value;
  if (value.length <= 4) return "***";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export function sanitizeForAudit(input: unknown, depth = 0): unknown {
  if (input === null || input === undefined) return input;
  if (depth >= MAX_DEPTH) return "[TRUNCATED]";

  if (typeof input === "string") {
    return input.length > MAX_STRING ? `${input.slice(0, MAX_STRING)}…` : input;
  }
  if (typeof input === "number" || typeof input === "boolean") return input;

  if (Array.isArray(input)) {
    return input.slice(0, MAX_ARRAY).map((item) => sanitizeForAudit(item, depth + 1));
  }

  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) {
        out[key] = REDACTED;
      } else if (PII_KEY.test(key)) {
        out[key] = maskPii(value);
      } else {
        out[key] = sanitizeForAudit(value, depth + 1);
      }
    }
    return out;
  }

  return REDACTED; // functions, symbols, etc.
}

/**
 * Strip webhook verify tokens from URLs before they reach logs.
 * Fastify's default request serializer includes the query string.
 */
export function redactSensitiveUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  return url
    .replace(/([?&](?:hub\.)?verify_token=)[^&]*/gi, "$1[REDACTED]")
    .replace(/([?&]token=)[^&]*/gi, "$1[REDACTED]")
    .replace(/(\/whatsapp\/webhooks\/ultramsg\/)[^/?#]+/gi, "$1[REDACTED]");
}

/** Mask the last octet of an IPv4 address for audit storage. */
export function maskIp(ip: string | undefined): string | undefined {
  if (!ip) return ip;
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  return ip;
}
