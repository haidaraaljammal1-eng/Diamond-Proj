const FORBIDDEN_KEYS = new Set(
  [
    "password",
    "pass",
    "username",
    "userlog",
    "Userlog",
    "cookie",
    "session",
    "token",
    "authorization",
    "bearer",
    "secret",
    "drivermob",
    "drivername",
    "driverid",
  ].map((k) => k.toLowerCase()),
);

const MAX_JSON_BYTES = 4096;
const MAX_TOP_LEVEL_KEYS = 32;

function keyForbidden(key: string): boolean {
  const lower = key.toLowerCase();
  if (FORBIDDEN_KEYS.has(lower)) return true;
  return lower.includes("password") || lower.includes("token") || lower.includes("cookie");
}

/**
 * Sanitize small provider-specific JSON blobs before persistence.
 * Raw fleet payloads and credentials are rejected.
 */
export function sanitizeGpsProviderExtras(
  input: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (input == null) return null;
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [key, value] of Object.entries(input)) {
    if (keyForbidden(key)) {
      throw new Error("GPS_PROVIDER_EXTRAS_FORBIDDEN_KEY");
    }
    if (value === undefined) continue;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      throw new Error("GPS_PROVIDER_EXTRAS_NESTED_OBJECT");
    }
    out[key] = value;
    count += 1;
    if (count > MAX_TOP_LEVEL_KEYS) {
      throw new Error("GPS_PROVIDER_EXTRAS_TOO_LARGE");
    }
  }
  if (Object.keys(out).length === 0) return null;
  const serialized = JSON.stringify(out);
  if (serialized.length > MAX_JSON_BYTES) {
    throw new Error("GPS_PROVIDER_EXTRAS_TOO_LARGE");
  }
  return out;
}
