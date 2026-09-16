const SECRET_KEY =
  /(pass|password|token|secret|authorization|access[_-]?token|app[_-]?secret|client[_-]?secret|credential)/i;

const MAX_DEPTH = 8;
const MAX_ARRAY = 100;

/** Strip unexpected secrets before persisting webhook JSON. Keeps message text. */
export function sanitizeWebhookPayload(input: unknown, depth = 0): unknown {
  if (input === null || input === undefined) return input;
  if (depth >= MAX_DEPTH) return "[TRUNCATED]";
  if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") {
    return input;
  }
  if (Array.isArray(input)) {
    return input.slice(0, MAX_ARRAY).map((item) => sanitizeWebhookPayload(item, depth + 1));
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? "[REDACTED]" : sanitizeWebhookPayload(value, depth + 1);
    }
    return out;
  }
  return "[REDACTED]";
}
