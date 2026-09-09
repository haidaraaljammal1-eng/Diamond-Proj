import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatLicenseExpiry } from "./format-license-date.ts";

describe("formatLicenseExpiry", () => {
  it("renders YYYY-MM-DD as DD/MM/YYYY", () => {
    assert.equal(formatLicenseExpiry("2028-08-24"), "24/08/2028");
  });

  it("returns null for empty values", () => {
    assert.equal(formatLicenseExpiry(null), null);
    assert.equal(formatLicenseExpiry(""), null);
  });
});
