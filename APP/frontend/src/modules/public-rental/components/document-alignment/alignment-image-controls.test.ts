import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IMAGE_ADJUSTMENT_DEFAULT_PERCENT,
  IMAGE_ADJUSTMENT_BUTTON_STEP,
  ZOOM_BUTTON_STEP,
  ZOOM_WHEEL_STEP,
  clampImageAdjustmentPercent,
  imageAdjustmentCanvasFilter,
  stepImageAdjustment,
} from "./alignment-image-controls.ts";
import { DEFAULT_ALIGNMENT_TRANSFORM } from "./document-alignment.types.ts";
import { composeAlignmentViewport } from "./alignment-composition.ts";

describe("alignment-image-controls", () => {
  it("zoom +/- button step is half the wheel step", () => {
    assert.equal(ZOOM_BUTTON_STEP, ZOOM_WHEEL_STEP / 2);
    assert.equal(ZOOM_BUTTON_STEP, 0.04);
  });

  it("brightness and contrast default to 100%", () => {
    assert.equal(DEFAULT_ALIGNMENT_TRANSFORM.brightnessPercent, 100);
    assert.equal(DEFAULT_ALIGNMENT_TRANSFORM.contrastPercent, 100);
  });

  it("brightness +/- moves by 5 percentage points", () => {
    assert.equal(stepImageAdjustment(100, IMAGE_ADJUSTMENT_BUTTON_STEP), 105);
    assert.equal(stepImageAdjustment(100, -IMAGE_ADJUSTMENT_BUTTON_STEP), 95);
    assert.equal(stepImageAdjustment(148, IMAGE_ADJUSTMENT_BUTTON_STEP), 150);
    assert.equal(stepImageAdjustment(52, -IMAGE_ADJUSTMENT_BUTTON_STEP), 50);
  });

  it("contrast +/- moves by 5 percentage points", () => {
    assert.equal(stepImageAdjustment(110, -IMAGE_ADJUSTMENT_BUTTON_STEP), 105);
    assert.equal(stepImageAdjustment(90, -IMAGE_ADJUSTMENT_BUTTON_STEP), 85);
  });

  it("reset defaults remain 100% in DEFAULT_ALIGNMENT_TRANSFORM", () => {
    assert.equal(
      clampImageAdjustmentPercent(DEFAULT_ALIGNMENT_TRANSFORM.brightnessPercent),
      IMAGE_ADJUSTMENT_DEFAULT_PERCENT,
    );
    assert.equal(
      clampImageAdjustmentPercent(DEFAULT_ALIGNMENT_TRANSFORM.contrastPercent),
      IMAGE_ADJUSTMENT_DEFAULT_PERCENT,
    );
  });

  it("export composition receives brightness/contrast canvas filter", () => {
    const filterCalls: string[] = [];
    const ctx = {
      fillStyle: "",
      filter: "none",
      save() {},
      restore() {},
      translate() {},
      rotate() {},
      drawImage() {},
      fillRect() {},
    } as CanvasRenderingContext2D & { filter: string };
    Object.defineProperty(ctx, "filter", {
      get() {
        return filterCalls.at(-1) ?? "none";
      },
      set(value: string) {
        filterCalls.push(value);
      },
      configurable: true,
    });

    const transform = {
      ...DEFAULT_ALIGNMENT_TRANSFORM,
      brightnessPercent: 110,
      contrastPercent: 105,
    };
    composeAlignmentViewport(ctx, {
      kind: "license",
      viewport: { width: 640, height: 400 },
      source: { width: 800, height: 500 },
      transform,
      image: {} as CanvasImageSource,
    });

    assert.equal(
      imageAdjustmentCanvasFilter(110, 105),
      "brightness(110%) contrast(105%)",
    );
    assert.ok(filterCalls.some((f) => f.includes("brightness(110%)")));
    assert.ok(filterCalls.some((f) => f.includes("contrast(105%)")));
  });
});
