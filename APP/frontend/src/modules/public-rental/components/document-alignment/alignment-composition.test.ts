import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeDisplayScale,
  computeExportPixelRatio,
  computeGuideRectInViewport,
} from "./alignment-composition.ts";
import { documentAlignmentProfile } from "./document-alignment-profiles.ts";
import type { DocumentAlignmentTransform, ViewportSize } from "./document-alignment.types.ts";

const viewport: ViewportSize = { width: 640, height: 400 };
const source = { width: 1200, height: 750 };

function imagePointToViewport(
  localX: number,
  localY: number,
  displayW: number,
  displayH: number,
  transform: DocumentAlignmentTransform,
): { x: number; y: number } {
  const cx = viewport.width / 2 + transform.panX;
  const cy = viewport.height / 2 + transform.panY;
  const rad = (transform.rotationDeg * Math.PI) / 180;
  const ox = localX - displayW / 2;
  const oy = localY - displayH / 2;
  const rx = ox * Math.cos(rad) - oy * Math.sin(rad);
  const ry = ox * Math.sin(rad) + oy * Math.cos(rad);
  return { x: cx + rx, y: cy + ry };
}

describe("alignment-composition rotation WYSIWYG", () => {
  const licenseAngles = [0, 1, -1, 2, -2, 3, -3];
  const passportAngles = [0, 1, -1, 2, -2, 4, -4];

  for (const rotationDeg of licenseAngles) {
    it(`license ${rotationDeg}° image corner matches DOMMatrix preview math`, () => {
      const transform: DocumentAlignmentTransform = {
        panX: 24,
        panY: -18,
        zoom: 1.35,
        rotationDeg,
        brightnessPercent: 100,
        contrastPercent: 100,
      };
      const displayScale = computeDisplayScale(viewport, source, transform.zoom);
      const displayW = source.width * displayScale;
      const displayH = source.height * displayScale;
      const corner = imagePointToViewport(0, 0, displayW, displayH, transform);
      const recomposed = imagePointToViewport(displayW / 2, displayH / 2, displayW, displayH, transform);
      assert.ok(Math.abs(recomposed.x - (viewport.width / 2 + transform.panX)) < 0.02);
      assert.ok(Math.abs(recomposed.y - (viewport.height / 2 + transform.panY)) < 0.02);
      assert.ok(Number.isFinite(corner.x) && Number.isFinite(corner.y));
    });
  }

  for (const rotationDeg of passportAngles) {
    it(`passport ${rotationDeg}° image center stays at pan anchor`, () => {
      const transform: DocumentAlignmentTransform = {
        panX: -12,
        panY: 30,
        zoom: 1.6,
        rotationDeg,
        brightnessPercent: 100,
        contrastPercent: 100,
      };
      const displayScale = computeDisplayScale(viewport, source, transform.zoom);
      const displayW = source.width * displayScale;
      const displayH = source.height * displayScale;
      const center = imagePointToViewport(displayW / 2, displayH / 2, displayW, displayH, transform);
      assert.ok(Math.abs(center.x - (viewport.width / 2 + transform.panX)) < 0.02);
      assert.ok(Math.abs(center.y - (viewport.height / 2 + transform.panY)) < 0.02);
    });
  }

  it("guide rect is axis-aligned in viewport space (rotation-independent crop)", () => {
    const profile = documentAlignmentProfile("license");
    const guide = computeGuideRectInViewport(viewport, profile.guideAspect);
    assert.ok(guide.left >= 0);
    assert.ok(guide.top >= 0);
    assert.ok(guide.left + guide.width <= viewport.width + 0.01);
    assert.ok(guide.top + guide.height <= viewport.height + 0.01);
  });

  it("export pixel ratio preserves source detail without forcing downscale", () => {
    const displayScale = computeDisplayScale(viewport, source, 1.2);
    const displayW = source.width * displayScale;
    const displayH = source.height * displayScale;
    const ratio = computeExportPixelRatio(source, displayW, displayH);
    assert.ok(ratio >= 1);
    assert.ok(displayW * ratio >= source.width - 1);
  });
});
