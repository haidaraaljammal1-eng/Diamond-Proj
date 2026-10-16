import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openTransformForDialog } from "./document-alignment-open-state.ts";
import { DEFAULT_ALIGNMENT_TRANSFORM } from "./document-alignment.types.ts";

describe("document-alignment-open-state", () => {
  const viewport = { width: 640, height: 400 };
  const source = { width: 1200, height: 750 };

  it("restores prior pan/zoom/rotation/brightness/contrast", () => {
    const restored = {
      panX: 12,
      panY: -8,
      zoom: 1.4,
      rotationDeg: 2,
      brightnessPercent: 110,
      contrastPercent: 95,
    };
    const next = openTransformForDialog(restored, viewport, source);
    assert.deepEqual(next, restored);
  });

  it("fresh open uses default adjustments at 100%", () => {
    const next = openTransformForDialog(undefined, viewport, source);
    assert.equal(next.brightnessPercent, 100);
    assert.equal(next.contrastPercent, 100);
    assert.equal(next.zoom, DEFAULT_ALIGNMENT_TRANSFORM.zoom);
  });
});
