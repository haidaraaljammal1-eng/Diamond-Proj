import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampRotation,
  computeBaseFitScale,
  computeGuideSize,
  computeInitialDialogZoom,
  documentAlignmentProfile,
  exportOutputAspect,
  LICENSE_FRAME_ASPECT,
  PASSPORT_FRAME_ASPECT,
} from "./document-alignment-profiles.ts";

describe("document-alignment-profiles", () => {
  it("license frame aspect matches approved 546/341", () => {
    const profile = documentAlignmentProfile("license");
    assert.ok(Math.abs(profile.guideAspect - LICENSE_FRAME_ASPECT) < 1e-6);
    assert.ok(Math.abs(profile.guideAspect - 546 / 341) < 0.0001);
  });

  it("passport frame aspect matches approved 930/630", () => {
    const profile = documentAlignmentProfile("passport");
    assert.ok(Math.abs(profile.guideAspect - PASSPORT_FRAME_ASPECT) < 1e-6);
    assert.ok(Math.abs(profile.guideAspect - 930 / 630) < 0.0001);
  });

  it("clamps licence rotation to ±3°", () => {
    const profile = documentAlignmentProfile("license");
    assert.equal(clampRotation(-5, profile), -3);
    assert.equal(clampRotation(5, profile), 3);
  });

  it("clamps passport rotation to ±4°", () => {
    const profile = documentAlignmentProfile("passport");
    assert.equal(clampRotation(-6, profile), -4);
  });

  it("export frame keeps approved aspect (one rectangle)", () => {
    const viewport = { width: 800, height: 520 };
    for (const kind of ["license", "passport"] as const) {
      const profile = documentAlignmentProfile(kind);
      const guide = computeGuideSize(viewport, profile.guideAspect);
      const aspect = exportOutputAspect(guide.width, guide.height);
      assert.ok(Math.abs(aspect - profile.guideAspect) < 0.02);
    }
  });

  it("initial dialog zoom is contain (full image in viewport at zoom 1)", () => {
    const viewport = { width: 640, height: 400 };
    const source = { width: 506, height: 305 };
    assert.equal(computeInitialDialogZoom(viewport, source), 1);
    const baseFit = computeBaseFitScale(viewport, source);
    assert.ok(baseFit * source.width <= viewport.width * 0.92 + 1);
    assert.ok(baseFit * source.height <= viewport.height * 0.92 + 1);
  });
});
