/** ISO BMFF / MP4: `ftyp` box at offset 4 (or scan first 32 bytes). */
export function isMp4Buffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  if (buffer.toString("latin1", 4, 8) === "ftyp") return true;
  const limit = Math.min(buffer.length, 64);
  for (let offset = 0; offset + 8 <= limit; offset += 4) {
    if (buffer.toString("latin1", offset + 4, offset + 8) === "ftyp") return true;
  }
  return false;
}

export function verifyMp4ContentType(
  buffer: Buffer,
  declaredMime: string,
): { ok: boolean; detected: string | null } {
  if (declaredMime !== "video/mp4") return { ok: false, detected: null };
  if (!isMp4Buffer(buffer)) return { ok: false, detected: null };
  return { ok: true, detected: "video/mp4" };
}
