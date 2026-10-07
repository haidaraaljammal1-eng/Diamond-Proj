/**
 * Full-licence frame aspect bounds (Crop V1 input validation).
 * @see DOCUMENT-ENGINE/LICENSE/frozen/crop_v1/config/crop_layout.json
 */
export const LICENSE_FRAME_MIN_ASPECT = 1.25;
export const LICENSE_FRAME_MAX_ASPECT = 2.1;

export type LicenseUploadFailureCode = "BAD_FRAME" | "OCR_FAILED";

export const LICENSE_UPLOAD_FAILURE_META_KEY = "uploadFailureCode";

export function licenseAspectRatio(width: number, height: number): number {
  if (height <= 0) return 0;
  return width / height;
}

export function isLicenseFrameAspectValid(aspect: number): boolean {
  return aspect >= LICENSE_FRAME_MIN_ASPECT && aspect <= LICENSE_FRAME_MAX_ASPECT;
}

export function resolvePublicLicenseUnreadableReason(
  verificationStatus: string | undefined,
  fieldsMeta: unknown,
): "BAD_FRAME" | "OCR" | null {
  if (verificationStatus !== "UNREADABLE") return null;
  if (fieldsMeta && typeof fieldsMeta === "object" && LICENSE_UPLOAD_FAILURE_META_KEY in fieldsMeta) {
    const code = (fieldsMeta as Record<string, unknown>)[LICENSE_UPLOAD_FAILURE_META_KEY];
    if (code === "BAD_FRAME") return "BAD_FRAME";
    if (code === "OCR_FAILED") return "OCR";
  }
  return "OCR";
}
