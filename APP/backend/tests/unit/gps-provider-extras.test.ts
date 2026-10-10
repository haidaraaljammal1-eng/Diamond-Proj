import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeGpsProviderExtras } from "src/modules/gps/gps-provider-extras";

describe("sanitizeGpsProviderExtras", () => {
  it("rejects credential-shaped keys", () => {
    assert.throws(() => sanitizeGpsProviderExtras({ password: "x" }));
    assert.throws(() => sanitizeGpsProviderExtras({ Userlog: "abc" }));
  });

  it("allows small primitive metadata", () => {
    const out = sanitizeGpsProviderExtras({ vehicletypename: "SUV", userid: "1" });
    assert.deepEqual(out, { vehicletypename: "SUV", userid: "1" });
  });
});
