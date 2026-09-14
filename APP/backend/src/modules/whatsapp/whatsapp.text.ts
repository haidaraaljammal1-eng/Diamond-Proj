import { WHATSAPP_TEXT_BODY_MAX } from "src/modules/whatsapp/whatsapp.constants";
import { whatsappError } from "src/modules/whatsapp/whatsapp.errors";

/**
 * Explicit trim convention: strip leading/trailing Unicode whitespace only.
 * Internal line breaks, Arabic, English, and emoji are preserved.
 */
export function normalizeOutboundText(raw: string): string {
  return raw.replace(/^[\s\uFEFF\u200B]+|[\s\uFEFF\u200B]+$/g, "");
}

export function assertOutboundText(raw: unknown): string {
  if (typeof raw !== "string") throw whatsappError.invalidText();
  const text = normalizeOutboundText(raw);
  if (text.length === 0) throw whatsappError.invalidText();
  if (text.length > WHATSAPP_TEXT_BODY_MAX) throw whatsappError.invalidText();
  return text;
}
