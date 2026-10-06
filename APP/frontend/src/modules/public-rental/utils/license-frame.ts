/**
 * Licence full-frame rule — mirrors Crop V1 `crop_layout.json` aspect bounds.
 * @see DOCUMENT-ENGINE/LICENSE/frozen/crop_v1/config/crop_layout.json
 * @see DOCU/OCR_INTEGRATION/D_LICENSE_FULL_FRAME_UPLOAD_VALIDATION.md
 */
export const LICENSE_FRAME_MIN_ASPECT = 1.25;
export const LICENSE_FRAME_MAX_ASPECT = 2.1;

export function licenseAspectRatio(width: number, height: number): number {
  if (height <= 0) return 0;
  return width / height;
}

/** Inclusive bounds, matching engine `aspect < min || aspect > max` rejection. */
export function isLicenseFrameAspectValid(aspect: number): boolean {
  return aspect >= LICENSE_FRAME_MIN_ASPECT && aspect <= LICENSE_FRAME_MAX_ASPECT;
}

export type LicenseFramePreflightResult =
  | { ok: true; width: number; height: number; aspect: number }
  | { ok: false; width: number; height: number; aspect: number; reason: "invalid_aspect" };

export function evaluateLicenseFramePreflight(
  width: number,
  height: number,
): LicenseFramePreflightResult {
  const aspect = licenseAspectRatio(width, height);
  if (!isLicenseFrameAspectValid(aspect)) {
    return { ok: false, width, height, aspect, reason: "invalid_aspect" };
  }
  return { ok: true, width, height, aspect };
}
