export type DocumentAlignmentKind = "license" | "passport";

export interface DocumentAlignmentTransform {
  panX: number;
  panY: number;
  zoom: number;
  rotationDeg: number;
  /** Manual pre-upload brightness (50–150, default 100). */
  brightnessPercent: number;
  /** Manual pre-upload contrast (50–150, default 100). */
  contrastPercent: number;
}

export const DEFAULT_ALIGNMENT_TRANSFORM: DocumentAlignmentTransform = {
  panX: 0,
  panY: 0,
  zoom: 1,
  rotationDeg: 0,
  brightnessPercent: 100,
  contrastPercent: 100,
};

export interface DocumentAlignmentProfile {
  kind: DocumentAlignmentKind;
  /** Visual guide width / height (export crop matches guide only). */
  guideAspect: number;
  minRotationDeg: number;
  maxRotationDeg: number;
  /** Used only when source is JPEG and re-encode is required. */
  jpegQuality: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface SourceImageSize {
  width: number;
  height: number;
}

/** Guide frame crop in source-image pixel coordinates. */
export interface GuideCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
