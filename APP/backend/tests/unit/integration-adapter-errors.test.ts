// tests/unit/integration-adapter-errors.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapHttpStatus, ok, fail, classifyNetworkError } from "src/modules/integrations/adapters/types";

test("mapHttpStatus: 401/403 -> AUTH_FAILED", () => {
  assert.equal(mapHttpStatus(401), "AUTH_FAILED");
  assert.equal(mapHttpStatus(403), "AUTH_FAILED");
});

test("mapHttpStatus: 5xx -> PROVIDER_ERROR, 404/400 -> INVALID_CONFIG", () => {
  assert.equal(mapHttpStatus(500), "PROVIDER_ERROR");
  assert.equal(mapHttpStatus(404), "INVALID_CONFIG");
  assert.equal(mapHttpStatus(400), "INVALID_CONFIG");
});

test("ok/fail builders", () => {
  assert.deepEqual(ok(), { ok: true });
  assert.deepEqual(fail("AUTH_FAILED", "bad creds"), { ok: false, code: "AUTH_FAILED", detail: "bad creds" });
});

test("classifyNetworkError: AbortError -> TIMEOUT", () => {
  assert.deepEqual(classifyNetworkError({ name: "AbortError" }), { ok: false, code: "TIMEOUT", detail: "request timed out" });
});

test("classifyNetworkError: generic error -> CONNECTION_FAILED", () => {
  assert.deepEqual(classifyNetworkError(new Error("ECONNREFUSED")), { ok: false, code: "CONNECTION_FAILED", detail: "could not reach the provider" });
});
