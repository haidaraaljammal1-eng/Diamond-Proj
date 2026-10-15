import type {
  DocumentAlignmentKind,
  DocumentAlignmentProfile,
  ViewportSize,
} from "./document-alignment.types";

/** Approved licence alignment frame (546×341 reference). */
export const LICENSE_FRAME_ASPECT = 546 / 341;

/** Approved passport biodata frame (930×630 reference). */
export const PASSPORT_FRAME_ASPECT = 930 / 630;

const LICENSE_PROFILE: DocumentAlignmentProfile = {
  kind: "license",
  guideAspect: LICENSE_FRAME_ASPECT,
  minRotationDeg: -3,
  maxRotationDeg: 3,
  jpegQuality: 0.92,
};

const PASSPORT_PROFILE: DocumentAlignmentProfile = {
  kind: "passport",
  guideAspect: PASSPORT_FRAME_ASPECT,
  minRotationDeg: -4,
  maxRotationDeg: 4,
  jpegQuality: 0.92,
};

export function documentAlignmentProfile(kind: DocumentAlignmentKind): DocumentAlignmentProfile {
  return kind === "license" ? LICENSE_PROFILE : PASSPORT_PROFILE;
}

/** Base scale so the full image fits inside the viewport with margin (no zoom). */
export function computeBaseFitScale(
  viewport: { width: number; height: number },
  source: { width: number; height: number },
  inset = 0.92,
): number {
  if (source.width <= 0 || source.height <= 0) return 1;
  const vw = viewport.width * inset;
  const vh = viewport.height * inset;
  return Math.min(vw / source.width, vh / source.height);
}

/** Guide rectangle size in viewport CSS pixels (centered). */
export function computeGuideSize(
  viewport: { width: number; height: number },
  guideAspect: number,
  maxGuideFraction = 0.88,
): { width: number; height: number } {
  const maxW = viewport.width * maxGuideFraction;
  const maxH = viewport.height * maxGuideFraction;
  let width = maxW;
  let height = width / guideAspect;
  if (height > maxH) {
    height = maxH;
    width = height * guideAspect;
  }
  return { width, height };
}

export function clampRotation(rotationDeg: number, profile: DocumentAlignmentProfile): number {
  return Math.min(profile.maxRotationDeg, Math.max(profile.minRotationDeg, rotationDeg));
}

export function exportOutputAspect(width: number, height: number): number {
  if (height <= 0) return 0;
  return width / height;
}

/** Dialog open: full source image visible inside viewport (contain), no auto-crop. */
export function computeInitialDialogZoom(viewport: ViewportSize, source: { width: number; height: number }): number {
  const baseFit = computeBaseFitScale(viewport, source);
  if (baseFit <= 0) return 1;
  return 1;
}
