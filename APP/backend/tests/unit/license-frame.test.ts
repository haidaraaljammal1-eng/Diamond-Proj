import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isLicenseFrameAspectValid,
  licenseAspectRatio,
  resolvePublicLicenseUnreadableReason,
} from "src/modules/contracts/license-frame";

describe("license-frame aspect (Crop V1 parity)", () => {
  it("accepts representative valid ratios", () => {
    for (const aspect of [1.4, 1.6, 1.8, 2.0]) {
      assert.equal(isLicenseFrameAspectValid(aspect), true);
    }
  });

  it("rejects too narrow and too wide ratios", () => {
    assert.equal(isLicenseFrameAspectValid(1.1), false);
    assert.equal(isLicenseFrameAspectValid(2.34), false);
    assert.equal(isLicenseFrameAspectValid(2.5), false);
  });

  it("uses inclusive boundaries at 1.25 and 2.10", () => {
    assert.equal(isLicenseFrameAspectValid(1.25), true);
    assert.equal(isLicenseFrameAspectValid(2.1), true);
    assert.equal(isLicenseFrameAspectValid(1.249), false);
    assert.equal(isLicenseFrameAspectValid(2.101), false);
  });

  it("computes width/height aspect", () => {
    assert.equal(licenseAspectRatio(234, 100), 2.34);
  });
});

describe("resolvePublicLicenseUnreadableReason", () => {
  it("maps extraction meta BAD_FRAME on UNREADABLE status", () => {
    assert.equal(
      resolvePublicLicenseUnreadableReason("UNREADABLE", { uploadFailureCode: "BAD_FRAME" }),
      "BAD_FRAME",
    );
    assert.equal(
      resolvePublicLicenseUnreadableReason("UNREADABLE", { uploadFailureCode: "OCR_FAILED" }),
      "OCR",
    );
    assert.equal(resolvePublicLicenseUnreadableReason("VALID", { uploadFailureCode: "BAD_FRAME" }), null);
  });
});
