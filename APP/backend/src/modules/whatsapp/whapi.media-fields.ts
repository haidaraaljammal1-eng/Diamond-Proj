/**
 * Whapi puts the file on the object named by `type`
 * (`image`, `video`, `document`, `audio`, `voice`, `sticker`).
 * Official download id pattern: prefix, hyphen, then hex.
 * https://whapi.readme.io/reference/getmedia
 */
const WHAPI_MEDIA_ID = /^[A-Za-z0-9]+-[0-9a-fA-F-]+$/;
const MEDIA_OBJECT_KEYS = ["image", "video", "document", "audio", "voice", "sticker", "media"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asBytes(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 2_147_483_647) return null;
  return Math.floor(n);
}

export function isWhapiMediaId(value: string): boolean {
  return WHAPI_MEDIA_ID.test(value) && !value.includes("..") && !value.includes("/");
}

export function whapiMediaLocator(mediaId: string): string {
  return `whapi-media:${mediaId}`;
}

export function whapiMediaIdFromLocator(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("whapi-media:")) {
    const id = trimmed.slice("whapi-media:".length);
    return isWhapiMediaId(id) ? id : null;
  }
  return isWhapiMediaId(trimmed) ? trimmed : null;
}

function mediaObject(message: Record<string, unknown>): Record<string, unknown> | null {
  const type = (asString(message.type) ?? "").toLowerCase();
  const preferred = type === "ptt" ? "voice" : type;
  const direct = asRecord(message[preferred]);
  if (direct) return direct;
  for (const key of MEDIA_OBJECT_KEYS) {
    const found = asRecord(message[key]);
    if (found) return found;
  }
  return null;
}

export interface WhapiInboundMediaFields {
  providerMediaId: string | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
  mediaSizeBytes: number | null;
  caption: string | null;
  voiceNote: boolean;
}

export function readWhapiInboundMedia(message: Record<string, unknown>): WhapiInboundMediaFields {
  const type = (asString(message.type) ?? "").toLowerCase();
  const obj = mediaObject(message);
  const rawId = asString(obj?.id);
  const providerMediaId = rawId && isWhapiMediaId(rawId) ? rawId : null;
  const voiceNote = type === "voice" || type === "ptt" || obj?.voice === true;
  return {
    providerMediaId,
    mediaMimeType: asString(obj?.mime_type) ?? asString(obj?.mimetype),
    mediaFilename:
      asString(obj?.filename) ??
      asString(obj?.file_name) ??
      asString(message.filename) ??
      asString(message.file_name),
    mediaSizeBytes: asBytes(obj?.file_size) ?? asBytes(obj?.fileSize) ?? asBytes(obj?.size),
    caption: asString(obj?.caption) ?? asString(message.caption),
    voiceNote,
  };
}
