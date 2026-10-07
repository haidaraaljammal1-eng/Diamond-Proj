import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  corsHeadersForOrigin,
  isCorsOriginAllowed,
} from "src/lib/http/cors-origin";

describe("cors-origin", () => {
  it("allows configured frontend origin and emits credentialed CORS headers", () => {
    const origin = "http://localhost:3100";
    assert.equal(isCorsOriginAllowed(origin), true);
    const headers = corsHeadersForOrigin(origin);
    assert.equal(headers["Access-Control-Allow-Origin"], origin);
    assert.equal(headers["Access-Control-Allow-Credentials"], "true");
    assert.equal(headers.Vary, "Origin");
  });

  it("does not emit permissive CORS for disallowed origins", () => {
    const origin = "http://evil.example.test";
    assert.equal(isCorsOriginAllowed(origin), false);
    assert.deepEqual(corsHeadersForOrigin(origin), {});
  });

  it("omits CORS headers when Origin is absent", () => {
    assert.deepEqual(corsHeadersForOrigin(undefined), {});
  });
});
