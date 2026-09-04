// tests/unit/integration-email-adapter.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { smtpErrorToCode } from "src/modules/integrations/adapters/email.adapter";

test("SMTP EAUTH -> AUTH_FAILED", () => {
  assert.equal(smtpErrorToCode({ code: "EAUTH" }), "AUTH_FAILED");
});
test("SMTP ECONNECTION/ETIMEDOUT/ESOCKET/ EDNS -> CONNECTION_FAILED", () => {
  assert.equal(smtpErrorToCode({ code: "ECONNECTION" }), "CONNECTION_FAILED");
  assert.equal(smtpErrorToCode({ code: "ETIMEDOUT" }), "CONNECTION_FAILED");
  assert.equal(smtpErrorToCode({ code: "ESOCKET" }), "CONNECTION_FAILED");
});
test("unknown SMTP error -> PROVIDER_ERROR", () => {
  assert.equal(smtpErrorToCode({ code: "WHATEVER" }), "PROVIDER_ERROR");
  assert.equal(smtpErrorToCode({}), "PROVIDER_ERROR");
});
