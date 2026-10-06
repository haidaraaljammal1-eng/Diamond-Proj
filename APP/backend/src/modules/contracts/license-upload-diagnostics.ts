import { licenseAspectRatio, isLicenseFrameAspectValid } from "src/modules/contracts/license-frame";

/** Privacy-safe upload metadata (no image bytes, no OCR fields). */
export interface LicenseUploadSafeMeta {
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  aspect: number | null;
  frameAspectValid: boolean | null;
}

function readPngDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes[0] !== 0x89) return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function readJpegDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      const height = bytes.readUInt16BE(offset + 5);
      const width = bytes.readUInt16BE(offset + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += 2 + length;
  }
  return null;
}

export function probeLicenseUploadSafeMeta(
  bytes: Buffer,
  mimeType: string,
): LicenseUploadSafeMeta {
  const dims =
    mimeType === "image/png"
      ? readPngDimensions(bytes)
      : mimeType === "image/jpeg"
        ? readJpegDimensions(bytes)
        : null;
  const width = dims?.width ?? null;
  const height = dims?.height ?? null;
  const aspect = width && height ? licenseAspectRatio(width, height) : null;
  return {
    mimeType,
    byteSize: bytes.length,
    width,
    height,
    aspect,
    frameAspectValid: aspect != null ? isLicenseFrameAspectValid(aspect) : null,
  };
}
