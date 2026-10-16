import { imageAdjustmentCanvasFilter } from "./alignment-image-controls.ts";
import {
  computeBaseFitScale,
  computeGuideSize,
  documentAlignmentProfile,
} from "./document-alignment-profiles.ts";
import type {
  DocumentAlignmentKind,
  DocumentAlignmentTransform,
  ViewportSize,
} from "./document-alignment.types.ts";

/** Same fill for preview stage and canvas export (WYSIWYG gaps inside guide). */
export const ALIGNMENT_COMPOSITION_BACKGROUND = "#ffffff";

export interface GuideRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function computeDisplayScale(
  viewport: ViewportSize,
  source: { width: number; height: number },
  zoom: number,
): number {
  const baseFit = computeBaseFitScale(viewport, source);
  return baseFit * zoom;
}

export function computeGuideRectInViewport(
  viewport: ViewportSize,
  guideAspect: number,
): GuideRect {
  const guide = computeGuideSize(viewport, guideAspect);
  return {
    left: (viewport.width - guide.width) / 2,
    top: (viewport.height - guide.height) / 2,
    width: guide.width,
    height: guide.height,
  };
}

/**
 * Pixel density for offscreen viewport render: preserves source detail without changing composition.
 */
export function computeExportPixelRatio(
  source: { width: number; height: number },
  displayW: number,
  displayH: number,
): number {
  if (displayW <= 0 || displayH <= 0) return 1;
  const needW = source.width / displayW;
  const needH = source.height / displayH;
  const ratio = Math.max(1, needW, needH);
  return Math.min(8, Math.ceil(ratio * 100) / 100);
}

export interface ComposeAlignmentViewportInput {
  kind: DocumentAlignmentKind;
  viewport: ViewportSize;
  source: { width: number; height: number };
  transform: DocumentAlignmentTransform;
  image: CanvasImageSource;
}

/**
 * Renders the alignment viewport in CSS pixel space (ctx should be scaled by pixelRatio externally).
 */
export function composeAlignmentViewport(
  ctx: CanvasRenderingContext2D,
  input: ComposeAlignmentViewportInput,
): void {
  const profile = documentAlignmentProfile(input.kind);
  const displayScale = computeDisplayScale(input.viewport, input.source, input.transform.zoom);
  const displayW = input.source.width * displayScale;
  const displayH = input.source.height * displayScale;

  ctx.fillStyle = ALIGNMENT_COMPOSITION_BACKGROUND;
  ctx.fillRect(0, 0, input.viewport.width, input.viewport.height);

  const cx = input.viewport.width / 2 + input.transform.panX;
  const cy = input.viewport.height / 2 + input.transform.panY;
  const rad = (input.transform.rotationDeg * Math.PI) / 180;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rad);
  ctx.filter = imageAdjustmentCanvasFilter(
    input.transform.brightnessPercent,
    input.transform.contrastPercent,
  );
  ctx.drawImage(input.image, -displayW / 2, -displayH / 2, displayW, displayH);
  ctx.filter = "none";
  ctx.restore();
}

export function guideRectForKind(viewport: ViewportSize, kind: DocumentAlignmentKind): GuideRect {
  const profile = documentAlignmentProfile(kind);
  return computeGuideRectInViewport(viewport, profile.guideAspect);
}
