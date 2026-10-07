import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { probeLicenseUploadSafeMeta } from "src/modules/contracts/license-upload-diagnostics";
import { createMinimalRgbPng } from "../helpers/minimal-png";

describe("probeLicenseUploadSafeMeta", () => {
  it("reads PNG dimensions without logging image bytes", () => {
    const bytes = createMinimalRgbPng(800, 500);
    const meta = probeLicenseUploadSafeMeta(bytes, "image/png");
    assert.equal(meta.byteSize, bytes.length);
    assert.equal(meta.mimeType, "image/png");
    assert.equal(meta.width, 800);
    assert.equal(meta.height, 500);
    assert.equal(meta.aspect, 1.6);
    assert.equal(meta.frameAspectValid, true);
  });

  it("flags wide frames as invalid", () => {
    const bytes = createMinimalRgbPng(234, 100);
    const meta = probeLicenseUploadSafeMeta(bytes, "image/png");
    assert.equal(meta.aspect, 2.34);
    assert.equal(meta.frameAspectValid, false);
  });
});
