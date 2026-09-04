/**
 * Content-based MIME sniffing. The client-supplied Content-Type is NEVER
 * trusted on its own — uploads are validated against these magic bytes.
 * Extend the table for additional allowed types as needed.
 */
function startsWithAscii(buffer: Buffer, ascii: string, offset = 0): boolean {
  if (buffer.length < offset + ascii.length) return false;
  return buffer.toString("latin1", offset, offset + ascii.length) === ascii;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function sniffMime(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE))
    return "image/png";
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (startsWithAscii(buffer, "GIF87a") || startsWithAscii(buffer, "GIF89a"))
    return "image/gif";
  if (startsWithAscii(buffer, "RIFF") && startsWithAscii(buffer, "WEBP", 8))
    return "image/webp";
  if (startsWithAscii(buffer, "%PDF-")) return "application/pdf";
  return null;
}

/**
 * True when the file's sniffed content type is present and consistent with the
 * declared type. Returns the detected mime for storage.
 */
export function verifyContentType(
  buffer: Buffer,
  declaredMime: string,
): { ok: boolean; detected: string | null } {
  const detected = sniffMime(buffer);
  if (!detected) return { ok: false, detected: null };
  return { ok: detected === declaredMime, detected };
}
