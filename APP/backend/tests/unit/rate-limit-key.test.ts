import { test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyRequest } from "fastify";
import { isLivenessProbe, rateLimitKey } from "src/plugins/rate-limit";

function request(overrides: {
  ip?: string;
  authorization?: string;
  url?: string;
}): FastifyRequest {
  return {
    ip: overrides.ip ?? "127.0.0.1",
    url: overrides.url ?? "/contracts",
    headers: overrides.authorization
      ? { authorization: overrides.authorization }
      : {},
  } as FastifyRequest;
}

test("rateLimitKey gives two sessions on the same IP separate buckets", () => {
  assert.notEqual(
    rateLimitKey(request({ authorization: "Bearer token-a" })),
    rateLimitKey(request({ authorization: "Bearer token-b" })),
  );
});

test("rateLimitKey keeps one session in one bucket across addresses", () => {
  assert.equal(
    rateLimitKey(request({ authorization: "Bearer token-a", ip: "10.0.0.5" })),
    rateLimitKey(request({ authorization: "Bearer token-a", ip: "127.0.0.1" })),
  );
});

test("rateLimitKey never exposes the raw token", () => {
  assert.ok(
    !rateLimitKey(request({ authorization: "Bearer secret-token" })).includes(
      "secret-token",
    ),
  );
});

test("rateLimitKey falls back to the IP for anonymous callers", () => {
  assert.equal(rateLimitKey(request({ ip: "10.0.0.5" })), "ip:10.0.0.5");
  assert.equal(
    rateLimitKey(request({ authorization: "Basic abc", ip: "10.0.0.5" })),
    "ip:10.0.0.5",
  );
});

test("isLivenessProbe exempts the probe routes only", () => {
  assert.equal(isLivenessProbe(request({ url: "/" })), true);
  assert.equal(isLivenessProbe(request({ url: "/health" })), true);
  assert.equal(isLivenessProbe(request({ url: "/contracts?page=1" })), false);
});
