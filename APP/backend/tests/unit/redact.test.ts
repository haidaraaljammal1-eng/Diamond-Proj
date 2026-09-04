import { test } from "node:test";
import assert from "node:assert/strict";
import { maskIp, sanitizeForAudit } from "src/lib/security/redact";

test("sanitizeForAudit removes secret-keyed values", () => {
  const out = sanitizeForAudit({
    password: "x",
    token: "y",
    refreshToken: "z",
    name: "Sam",
  }) as Record<string, unknown>;
  assert.equal(out.password, "[REDACTED]");
  assert.equal(out.token, "[REDACTED]");
  assert.equal(out.refreshToken, "[REDACTED]");
  assert.equal(out.name, "Sam");
});

test("sanitizeForAudit masks PII-keyed values", () => {
  const out = sanitizeForAudit({ email: "someone@example.com" }) as Record<
    string,
    unknown
  >;
  assert.notEqual(out.email, "someone@example.com");
});

test("maskIp hides the last IPv4 octet", () => {
  assert.equal(maskIp("192.168.1.55"), "192.168.1.0");
});
