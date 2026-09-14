import { createHash } from "node:crypto";
import { env } from "src/config/env";
import { sniffMime } from "src/lib/files/magic-bytes";
import {
  WHATSAPP_MEDIA_CAPTION_MAX,
  WHATSAPP_MEDIA_MAX_BYTES,
  WHATSAPP_OUTBOUND_MEDIA_TYPES,
} from "src/modules/whatsapp/whatsapp.constants";
import { whatsappError } from "src/modules/whatsapp/whatsapp.errors";
import type { WhatsAppOutboundMediaKind } from "src/modules/whatsapp/whatsapp.types";

const IMAGE_MIME = new Set(["image/jpeg", "image/png"]);
const AUDIO_MIME = new Set(["audio/mpeg", "audio/ogg", "audio/mp4", "audio/amr", "audio/aac"]);
const VIDEO_MIME = new Set(["video/mp4", "video/3gpp"]);
const DOCUMENT_MIME = new Set(["application/pdf"]);

function startsWithAscii(buffer: Buffer, ascii: string, offset = 0): boolean {
  if (buffer.length < offset + ascii.length) return false;
  return buffer.toString("latin1", offset, offset + ascii.length) === ascii;
}

/** Additional Cloud API media sniffing on top of shared image/pdf magic bytes. */
export function sniffWhatsAppMedia(buffer: Buffer): string | null {
  const shared = sniffMime(buffer);
  if (shared === "image/jpeg" || shared === "image/png" || shared === "application/pdf") {
    return shared;
  }
  if (startsWithAscii(buffer, "#!AMR")) return "audio/amr";
  if (startsWithAscii(buffer, "OggS")) return "audio/ogg";
  if (startsWithAscii(buffer, "ID3")) return "audio/mpeg";
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0) {
    return "audio/mpeg";
  }
  if (buffer.length >= 8 && startsWithAscii(buffer, "ftyp", 4)) {
    const brand = buffer.toString("latin1", 8, 12);
    if (brand.startsWith("3gp") || brand.startsWith("3gp4") || brand.startsWith("3g2")) {
      return "video/3gpp";
    }
    return "video/mp4";
  }
  return shared;
}

export function kindForDetectedMime(mime: string): WhatsAppOutboundMediaKind | null {
  if (IMAGE_MIME.has(mime)) return "IMAGE";
  if (AUDIO_MIME.has(mime)) return "AUDIO";
  if (VIDEO_MIME.has(mime)) return "VIDEO";
  if (DOCUMENT_MIME.has(mime)) return "DOCUMENT";
  return null;
}

export function sanitizeMediaFilename(filename: string | null | undefined, maxLength = 180): string {
  const raw = (filename ?? "file").replace(/\\/g, "/").split("/").pop() ?? "file";
  const cleaned = raw.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, maxLength).trim();
  return cleaned.length > 0 ? cleaned : "file";
}

export function hashMediaBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function normalizeMediaCaption(
  kind: WhatsAppOutboundMediaKind,
  caption: string | null | undefined,
): string | null {
  if (kind === "AUDIO") return null;
  if (caption == null) return null;
  const trimmed = caption.replace(/^[\s\uFEFF\u200B]+|[\s\uFEFF\u200B]+$/g, "");
  if (!trimmed) return null;
  if (trimmed.length > WHATSAPP_MEDIA_CAPTION_MAX) throw whatsappError.invalidText();
  return trimmed;
}

export function validateOutboundMedia(input: {
  bytes: Buffer;
  declaredMime: string;
  requestedKind: string;
  providerMaxBytes?: Partial<Record<WhatsAppOutboundMediaKind, number>>;
}): { kind: WhatsAppOutboundMediaKind; mimeType: string } {
  if (
    !WHATSAPP_OUTBOUND_MEDIA_TYPES.includes(input.requestedKind as WhatsAppOutboundMediaKind)
  ) {
    throw whatsappError.mediaInvalidType();
  }
  const detected = sniffWhatsAppMedia(input.bytes);
  if (!detected) throw whatsappError.mediaInvalidType();
  const kind = kindForDetectedMime(detected);
  if (!kind || kind !== input.requestedKind) throw whatsappError.mediaInvalidType();
  if (input.declaredMime && input.declaredMime !== detected) {
    throw whatsappError.mediaInvalidType();
  }
  const diamondMax = WHATSAPP_MEDIA_MAX_BYTES[kind];
  const providerMax = input.providerMaxBytes?.[kind] ?? diamondMax;
  const maxBytes = Math.min(diamondMax, providerMax, env.MAX_UPLOAD_SIZE);
  if (input.bytes.length === 0 || input.bytes.length > maxBytes) {
    throw whatsappError.mediaTooLarge();
  }
  return { kind, mimeType: detected };
}

export function graphMediaTypeField(kind: WhatsAppOutboundMediaKind): "image" | "document" | "audio" | "video" {
  return kind.toLowerCase() as "image" | "document" | "audio" | "video";
}
