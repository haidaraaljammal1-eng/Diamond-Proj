// tests/unit/integration-adapter-behavior.test.ts
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { smsAdapter } from "src/modules/integrations/adapters/sms.adapter";
import { ssoAdapter } from "src/modules/integrations/adapters/sso.adapter";
import { whatsappAdapter } from "src/modules/integrations/adapters/whatsapp.adapter";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const stub = (status: number, ok = status >= 200 && status < 300) => {
  globalThis.fetch = (async () => ({ ok, status, json: async () => ({}) })) as unknown as typeof fetch;
};

test("sms testConnection: 500 from gateway -> FAILED PROVIDER_ERROR (not fake ok)", async () => {
  stub(500);
  const r = await smsAdapter.testConnection({
    config: { baseUrl: "https://sms.example" },
    secrets: { apiKey: "k" },
  });
  assert.deepEqual(r, { ok: false, code: "PROVIDER_ERROR" });
});

test("sms testConnection: 404 from gateway -> FAILED (not fake ok)", async () => {
  stub(404);
  const r = await smsAdapter.testConnection({
    config: { baseUrl: "https://sms.example" },
    secrets: { apiKey: "k" },
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "INVALID_CONFIG");
});

test("sms testConnection: 401 -> AUTH_FAILED", async () => {
  stub(401);
  const r = await smsAdapter.testConnection({
    config: { baseUrl: "https://sms.example" },
    secrets: { apiKey: "k" },
  });
  assert.equal(r.code, "AUTH_FAILED");
});

test("sms testConnection: 200 -> ok", async () => {
  stub(200);
  const r = await smsAdapter.testConnection({
    config: { baseUrl: "https://sms.example" },
    secrets: { apiKey: "k" },
  });
  assert.deepEqual(r, { ok: true });
});

test("sso testConnection: 5xx from token endpoint -> PROVIDER_ERROR (not fake ok)", async () => {
  let call = 0;
  globalThis.fetch = (async (_url: string) => {
    call += 1;
    if (call === 1) {
      // discovery document
      return {
        ok: true,
        status: 200,
        json: async () => ({ token_endpoint: "https://idp.example/token" }),
      };
    }
    // token endpoint -> IdP outage
    return { ok: false, status: 500, json: async () => ({}) };
  }) as unknown as typeof fetch;

  const r = await ssoAdapter.testConnection({
    config: { clientId: "c", issuerUrl: "https://idp.example" },
    secrets: { clientSecret: "s" },
  });
  assert.deepEqual(r, { ok: false, code: "PROVIDER_ERROR", detail: "identity provider error" });
});

test("sso testConnection: token endpoint 401 -> AUTH_FAILED", async () => {
  let call = 0;
  globalThis.fetch = (async () => {
    call += 1;
    if (call === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ token_endpoint: "https://idp.example/token" }),
      };
    }
    return { ok: false, status: 401, json: async () => ({}) };
  }) as unknown as typeof fetch;

  const r = await ssoAdapter.testConnection({
    config: { clientId: "c", issuerUrl: "https://idp.example" },
    secrets: { clientSecret: "s" },
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "AUTH_FAILED");
});

test("sso testConnection: token endpoint 400 (unsupported_grant) -> ok (discovery-valid = configured)", async () => {
  let call = 0;
  globalThis.fetch = (async () => {
    call += 1;
    if (call === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ token_endpoint: "https://idp.example/token" }),
      };
    }
    return { ok: false, status: 400, json: async () => ({}) };
  }) as unknown as typeof fetch;

  const r = await ssoAdapter.testConnection({
    config: { clientId: "c", issuerUrl: "https://idp.example" },
    secrets: { clientSecret: "s" },
  });
  assert.deepEqual(r, { ok: true });
});

test("whatsapp sendTest meta_cloud without phoneNumberId -> INVALID_CONFIG (no network)", async () => {
  const r = await whatsappAdapter.sendTest!(
    { config: { provider: "meta_cloud" }, secrets: { accessToken: "t" } },
    { to: "123" }
  );
  assert.equal(r.code, "INVALID_CONFIG");
});

test("whatsapp sendTest generic_instance without baseUrl -> INVALID_CONFIG (no network)", async () => {
  const r = await whatsappAdapter.sendTest!(
    { config: { provider: "generic_instance", instanceId: "i" }, secrets: { accessToken: "t" } },
    { to: "123" }
  );
  assert.equal(r.code, "INVALID_CONFIG");
});

test("whatsapp sendTest generic_instance without instanceId -> INVALID_CONFIG (no network)", async () => {
  const r = await whatsappAdapter.sendTest!(
    { config: { provider: "generic_instance", baseUrl: "https://wa.example" }, secrets: { accessToken: "t" } },
    { to: "123" }
  );
  assert.equal(r.code, "INVALID_CONFIG");
});
