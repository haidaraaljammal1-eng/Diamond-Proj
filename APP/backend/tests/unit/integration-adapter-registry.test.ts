// tests/unit/integration-adapter-registry.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getAdapter, ADAPTERS } from "src/modules/integrations/adapters";

test("registry exposes an adapter for every catalog kind", () => {
  for (const k of ["EMAIL", "WHATSAPP", "SMS", "SSO_ACTIVE_DIRECTORY", "POWER_BI"] as const) {
    assert.ok(getAdapter(k), `missing adapter for ${k}`);
    assert.equal(typeof getAdapter(k).testConnection, "function");
  }
});
test("email/whatsapp/sms support sendTest; sso/powerbi do not", () => {
  assert.equal(typeof ADAPTERS.EMAIL.sendTest, "function");
  assert.equal(typeof ADAPTERS.WHATSAPP.sendTest, "function");
  assert.equal(typeof ADAPTERS.SMS.sendTest, "function");
  assert.equal(ADAPTERS.SSO_ACTIVE_DIRECTORY.sendTest, undefined);
  assert.equal(ADAPTERS.POWER_BI.sendTest, undefined);
});
