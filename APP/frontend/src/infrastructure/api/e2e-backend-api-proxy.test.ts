import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  isE2eStaffApiProxyEnabled,
  proxyE2eStaffApiRequest,
} from "./e2e-backend-api-proxy.ts";

type FetchCall = { url: string; init: RequestInit };

let fetchCalls: FetchCall[] = [];
let originalFetch: typeof fetch;
const baseEnv = { ...process.env };

function enableE2eProxy(port = "8051"): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    RBAC_E2E_API_PROXY: "true",
    RBAC_E2E_API_PORT: port,
  };
}

function disabledEnv(): NodeJS.ProcessEnv {
  const env = { ...baseEnv };
  delete env.RBAC_E2E_API_PROXY;
  delete env.RBAC_E2E_API_PORT;
  return env;
}

function mockUpstream(status: number, body: string): typeof fetch {
  return mock.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(input), init: init ?? {} });
    return new Response(body, {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

beforeEach(() => {
  fetchCalls = [];
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("proxy.ts matcher (static file inspect)", () => {
  it("excludes /backend-api from Next proxy middleware", () => {
    const proxyPath = path.resolve(
      import.meta.dirname,
      "../../proxy.ts",
    );
    const source = readFileSync(proxyPath, "utf8");
    assert.match(source, /backend-api/);
    assert.match(source, /matcher:\s*\[/);
  });
});

describe("e2e-backend-api-proxy (mocked fetch)", () => {
  it("security gate: disabled without RBAC_E2E_API_PROXY and port", async () => {
    assert.equal(isE2eStaffApiProxyEnabled(disabledEnv()), false);
    const result = await proxyE2eStaffApiRequest(
      {
        method: "GET",
        pathSegments: ["roles"],
        search: "?page=1",
        headers: new Headers(),
      },
      mockUpstream(200, "{}"),
      disabledEnv(),
    );
    assert.equal(result.status, 404);
    assert.equal(fetchCalls.length, 0);
  });

  it("security gate: disabled when only port is set", async () => {
    const env = { ...baseEnv, RBAC_E2E_API_PORT: "8051" };
    delete env.RBAC_E2E_API_PROXY;
    assert.equal(isE2eStaffApiProxyEnabled(env), false);
  });

  it("GET /roles forwards query and Authorization", async () => {
    const env = enableE2eProxy("8051");
    const fetchImpl = mockUpstream(
      200,
      JSON.stringify({ data: [{ id: 1 }], meta: { page: 1 } }),
    );
    const headers = new Headers({
      authorization: "Bearer isolated-test-token",
      accept: "application/json",
    });

    const result = await proxyE2eStaffApiRequest(
      {
        method: "GET",
        pathSegments: ["roles"],
        search: "?page=1&pageSize=100",
        headers,
      },
      fetchImpl,
      env,
    );

    assert.equal(result.status, 200);
    assert.equal(fetchCalls.length, 1);
    assert.equal(
      fetchCalls[0].url,
      "http://127.0.0.1:8051/roles?page=1&pageSize=100",
    );
    const upstreamHeaders = fetchCalls[0].init.headers as Headers;
    assert.equal(upstreamHeaders.get("authorization"), "Bearer isolated-test-token");
    const json = JSON.parse(new TextDecoder().decode(result.body)) as {
      data: unknown[];
    };
    assert.ok(Array.isArray(json.data));
  });

  it("PUT /roles/:id/functional-grants forwards JSON body", async () => {
    const env = enableE2eProxy("8052");
    const fetchImpl = mockUpstream(200, JSON.stringify({ data: { id: 3 } }));
    const payload = { capabilityKeys: ["diamond.fn.roles.view_page"] };
    const encoded = new TextEncoder().encode(JSON.stringify(payload));

    const result = await proxyE2eStaffApiRequest(
      {
        method: "PUT",
        pathSegments: ["roles", "3", "functional-grants"],
        search: "",
        headers: new Headers({
          authorization: "Bearer grant-token",
          "content-type": "application/json",
        }),
        body: encoded.buffer.slice(
          encoded.byteOffset,
          encoded.byteOffset + encoded.byteLength,
        ),
      },
      fetchImpl,
      env,
    );

    assert.equal(result.status, 200);
    assert.equal(
      fetchCalls[0].url,
      "http://127.0.0.1:8052/roles/3/functional-grants",
    );
    assert.equal(fetchCalls[0].init.method, "PUT");
    const sent = fetchCalls[0].init.body;
    assert.ok(sent instanceof ArrayBuffer);
    assert.deepEqual(JSON.parse(new TextDecoder().decode(sent)), payload);
  });

  it("propagates upstream status and JSON body", async () => {
    const env = enableE2eProxy("8053");
    const fetchImpl = mockUpstream(
      403,
      JSON.stringify({ error: { code: "FORBIDDEN", message: "Denied" } }),
    );
    const result = await proxyE2eStaffApiRequest(
      {
        method: "GET",
        pathSegments: ["roles"],
        search: "",
        headers: new Headers({ authorization: "Bearer x" }),
      },
      fetchImpl,
      env,
    );
    assert.equal(result.status, 403);
    const json = JSON.parse(new TextDecoder().decode(result.body)) as {
      error: { code: string };
    };
    assert.equal(json.error.code, "FORBIDDEN");
  });
});
