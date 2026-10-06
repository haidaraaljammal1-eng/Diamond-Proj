import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateLicenseFramePreflight,
  isLicenseFrameAspectValid,
  LICENSE_FRAME_MAX_ASPECT,
  LICENSE_FRAME_MIN_ASPECT,
} from "./license-frame.ts";

describe("license frame preflight (UX only)", () => {
  it("documents engine-aligned bounds", () => {
    assert.equal(LICENSE_FRAME_MIN_ASPECT, 1.25);
    assert.equal(LICENSE_FRAME_MAX_ASPECT, 2.1);
  });

  it("allows representative valid dimensions", () => {
    for (const aspect of [1.4, 1.6, 1.8, 2.0]) {
      const height = 100;
      const width = Math.round(aspect * height);
      const result = evaluateLicenseFramePreflight(width, height);
      assert.equal(result.ok, true);
    }
  });

  it("rejects invalid aspect before upload", () => {
    assert.equal(evaluateLicenseFramePreflight(110, 100).ok, false);
    assert.equal(evaluateLicenseFramePreflight(234, 100).ok, false);
    assert.equal(evaluateLicenseFramePreflight(250, 100).ok, false);
  });

  it("matches inclusive engine boundaries", () => {
    assert.equal(isLicenseFrameAspectValid(1.25), true);
    assert.equal(isLicenseFrameAspectValid(2.1), true);
    assert.equal(evaluateLicenseFramePreflight(125, 100).ok, true);
    assert.equal(evaluateLicenseFramePreflight(210, 100).ok, true);
    assert.equal(evaluateLicenseFramePreflight(124, 100).ok, false);
    assert.equal(evaluateLicenseFramePreflight(211, 100).ok, false);
  });
});
