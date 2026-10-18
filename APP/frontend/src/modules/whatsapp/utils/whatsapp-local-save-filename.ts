import type { WhatsAppMessageDto } from "../types/whatsapp.types";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "audio/ogg": ".ogg",
  "audio/opus": ".ogg",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "video/mp4": ".mp4",
  "application/pdf": ".pdf",
};

const TYPE_EXT: Record<string, string> = {
  IMAGE: ".jpg",
  AUDIO: ".ogg",
  VIDEO: ".mp4",
  DOCUMENT: ".pdf",
};

export function waIdToSaveFolderName(customerWaId: string | null | undefined): string | null {
  const trimmed = (customerWaId ?? "").trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower.includes("@g.us")) {
    const safe = sanitizeLocalFileSegment(lower.replace(/@/g, "_at_"));
    return safe ? `group_${safe}` : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 6) return null;
  return digits.slice(0, 24);
}

export const UNIDENTIFIED_SENDER_FOLDER = "_unidentified";

export function sanitizeLocalFileSegment(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80);
}

function sniffExtension(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return ".jpg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return ".png";
  }
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return ".pdf";
  }
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return ".ogg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return ".webp";
  }
  return null;
}

function extensionFromMime(mime: string | null | undefined, messageType: string): string {
  const normalized = (mime ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (normalized && MIME_EXT[normalized]) return MIME_EXT[normalized];
  return TYPE_EXT[messageType] ?? "";
}

function extensionFromFilename(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? filename;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return null;
  const ext = base.slice(dot).toLowerCase();
  if (!/^\.[a-z0-9]{2,8}$/.test(ext)) return null;
  return ext;
}

function formatDateStamp(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function baseNameFromOriginal(filename: string | null | undefined, messageType: string): string {
  if (filename) {
    const base = filename.replace(/\\/g, "/").split("/").pop() ?? filename;
    const dot = base.lastIndexOf(".");
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const cleaned = sanitizeLocalFileSegment(stem);
    if (cleaned) return cleaned;
  }
  return sanitizeLocalFileSegment(messageType.toLowerCase()) || "media";
}

export async function buildInboundLocalMediaFilename(
  message: WhatsAppMessageDto,
  blob: Blob,
): Promise<string> {
  // Extension prefers byte sniff, then MIME/type, then original filename.
  const buffer = await blob.slice(0, 16).arrayBuffer();
  const head = new Uint8Array(buffer);
  const sniffed = sniffExtension(head);
  const fromMime = extensionFromMime(message.mediaMimeType ?? blob.type, message.messageType);
  const fromOriginal = extensionFromFilename(message.mediaFilename);
  let ext = fromOriginal ?? fromMime;
  if (sniffed) {
    ext = sniffed;
  } else if (!ext) {
    ext = ".bin";
  }
  const stamp = formatDateStamp(message.receivedAt ?? message.providerOccurredAt);
  const shortId = message.id.slice(0, 8);
  const base = baseNameFromOriginal(message.mediaFilename, message.messageType);
  return `${stamp}_${base}_${shortId}${ext}`;
}
