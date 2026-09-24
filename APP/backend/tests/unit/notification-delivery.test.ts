import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { NotificationService } from "src/modules/notification-delivery/notification.service";
import { setNotificationProviderForTests } from "src/modules/notification-delivery/notification.provider";
import { PushoverProvider } from "src/modules/notification-delivery/providers/pushover.provider";

const APP_TOKEN = "test-app-token-secret-value";
const USER_KEY = "test-user-key-secret-value";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  setNotificationProviderForTests(undefined);
});

function mockFetch(
  impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): void {
  globalThis.fetch = impl as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function assertNoSecrets(value: unknown): void {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes(APP_TOKEN), false);
  assert.equal(serialized.includes(USER_KEY), false);
}

test("PushoverProvider accepts a successful Pushover response", async () => {
  mockFetch(async (_url, init) => {
    const body = String(init?.body ?? "");
    assert.equal(body.includes(APP_TOKEN), true);
    assert.equal(body.includes(USER_KEY), true);
    assert.equal(body.includes("token="), true);
    assert.equal(body.includes("user="), true);
    return jsonResponse(200, { status: 1, request: "req-success-1" });
  });

  const provider = new PushoverProvider({
    enabled: true,
    config: { appToken: APP_TOKEN, userKey: USER_KEY },
  });

  const result = await provider.send({
    title: "Diamond Rent Car",
    message: "Notification system connected successfully.",
  });

  assert.equal(result.success, true);
  assert.equal(result.provider, "pushover");
  assert.equal(result.statusCode, 200);
  assert.equal(result.providerStatus, 1);
  assert.equal(result.requestId, "req-success-1");
  assertNoSecrets(result);
});

test("PushoverProvider returns DISABLED when PUSHOVER_ENABLED=false", async () => {
  const provider = new PushoverProvider({
    enabled: false,
    config: { appToken: APP_TOKEN, userKey: USER_KEY },
  });

  const result = await provider.send({
    title: "Diamond Rent Car",
    message: "Notification system connected successfully.",
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "DISABLED");
  assertNoSecrets(result);
});

test("PushoverProvider returns NOT_CONFIGURED when enabled credentials are incomplete", async () => {
  const provider = new PushoverProvider({
    enabled: true,
    config: { appToken: "", userKey: USER_KEY },
  });

  const result = await provider.send({
    title: "Diamond Rent Car",
    message: "Notification system connected successfully.",
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "NOT_CONFIGURED");
  assertNoSecrets(result);
});

test("PushoverProvider maps network failures safely", async () => {
  mockFetch(async () => {
    throw new TypeError("fetch failed");
  });

  const provider = new PushoverProvider({
    enabled: true,
    config: { appToken: APP_TOKEN, userKey: USER_KEY },
  });

  const result = await provider.send({
    title: "Diamond Rent Car",
    message: "Notification system connected successfully.",
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "NETWORK_ERROR");
  assertNoSecrets(result);
});

test("PushoverProvider maps request timeouts safely", async () => {
  mockFetch(async () => {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  });

  const provider = new PushoverProvider({
    enabled: true,
    config: { appToken: APP_TOKEN, userKey: USER_KEY },
    timeoutMs: 5,
  });

  const result = await provider.send({
    title: "Diamond Rent Car",
    message: "Notification system connected successfully.",
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "TIMEOUT");
  assertNoSecrets(result);
});

test("PushoverProvider maps HTTP non-2xx responses safely", async () => {
  mockFetch(async () => jsonResponse(500, { status: 0, errors: ["internal error"] }));

  const provider = new PushoverProvider({
    enabled: true,
    config: { appToken: APP_TOKEN, userKey: USER_KEY },
  });

  const result = await provider.send({
    title: "Diamond Rent Car",
    message: "Notification system connected successfully.",
  });

  assert.equal(result.success, false);
  assert.equal(result.statusCode, 500);
  assert.equal(result.errorCode, "HTTP_ERROR");
  assertNoSecrets(result);
});

test("PushoverProvider maps Pushover status != 1 as PROVIDER_REJECTED", async () => {
  mockFetch(async () => jsonResponse(200, { status: 0, errors: ["invalid user"] }));

  const provider = new PushoverProvider({
    enabled: true,
    config: { appToken: APP_TOKEN, userKey: USER_KEY },
  });

  const result = await provider.send({
    title: "Diamond Rent Car",
    message: "Notification system connected successfully.",
  });

  assert.equal(result.success, false);
  assert.equal(result.statusCode, 200);
  assert.equal(result.providerStatus, 0);
  assert.equal(result.errorCode, "PROVIDER_REJECTED");
  assertNoSecrets(result);
});

test("NotificationService contains unexpected provider failures", async () => {
  setNotificationProviderForTests({
    name: "pushover",
    configured: true,
    async send() {
      throw new Error("provider exploded");
    },
  });

  const service = new NotificationService();
  const result = await service.send({
    title: "Diamond Rent Car",
    message: "Notification system connected successfully.",
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "UNEXPECTED_ERROR");
  assertNoSecrets(result);
});
