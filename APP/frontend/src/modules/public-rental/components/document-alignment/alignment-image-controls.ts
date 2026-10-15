/** Wheel / pinch zoom step (unchanged). */
export const ZOOM_WHEEL_STEP = 0.08;

/** Finer step for zoom +/- buttons only. */
export const ZOOM_BUTTON_STEP = ZOOM_WHEEL_STEP / 2;

export const IMAGE_ADJUSTMENT_MIN_PERCENT = 50;
export const IMAGE_ADJUSTMENT_MAX_PERCENT = 150;
export const IMAGE_ADJUSTMENT_DEFAULT_PERCENT = 100;
export const IMAGE_ADJUSTMENT_BUTTON_STEP = 5;

export function clampImageAdjustmentPercent(value: number): number {
  return Math.min(
    IMAGE_ADJUSTMENT_MAX_PERCENT,
    Math.max(IMAGE_ADJUSTMENT_MIN_PERCENT, Math.round(value)),
  );
}

export function imageAdjustmentCssFilter(brightnessPercent: number, contrastPercent: number): string {
  const b = clampImageAdjustmentPercent(brightnessPercent);
  const c = clampImageAdjustmentPercent(contrastPercent);
  if (b === IMAGE_ADJUSTMENT_DEFAULT_PERCENT && c === IMAGE_ADJUSTMENT_DEFAULT_PERCENT) {
    return "none";
  }
  return `brightness(${b}%) contrast(${c}%)`;
}

export function imageAdjustmentCanvasFilter(brightnessPercent: number, contrastPercent: number): string {
  const b = clampImageAdjustmentPercent(brightnessPercent);
  const c = clampImageAdjustmentPercent(contrastPercent);
  return `brightness(${b}%) contrast(${c}%)`;
}

export function stepImageAdjustment(
  current: number,
  delta: number,
): number {
  return clampImageAdjustmentPercent(current + delta);
}
