import type { ApiRequestError } from "@/infrastructure/api/errors";

export interface WhatsAppErrorTranslator {
  (key: string, values?: Record<string, string | number>): string;
  has?: (key: string) => boolean;
}

const GENERIC_KEY = "error.generic";
const FALLBACK_GENERIC = "WhatsApp data could not be loaded. Try again.";

function hasMessage(t: WhatsAppErrorTranslator, key: string): boolean {
  try {
    if (typeof t.has === "function") return t.has(key);
  } catch {
    return false;
  }
  return false;
}

function translateIfPresent(t: WhatsAppErrorTranslator, key: string): string | null {
  if (!hasMessage(t, key)) return null;
  try {
    const value = t(key);
    if (typeof value !== "string" || value.trim() === "" || value === key) return null;
    return value;
  } catch {
    return null;
  }
}

function genericMessage(t: WhatsAppErrorTranslator): string {
  return translateIfPresent(t, GENERIC_KEY) ?? FALLBACK_GENERIC;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Maps Backend WhatsApp errors. Never throws. Never returns raw enums.
 */
export function resolveWhatsAppErrorMessage(
  t: WhatsAppErrorTranslator,
  error: ApiRequestError | null | undefined | unknown,
): string | null {
  try {
    if (error == null) return null;
    if (!isRecord(error)) return genericMessage(t);
    const context = isRecord(error.context) ? error.context : null;
    const reason = typeof context?.reason === "string" ? context.reason : null;
    if (reason) {
      const fromReason = translateIfPresent(t, `error.${reason}`);
      if (fromReason) return fromReason;
    }
    const code = typeof error.code === "string" ? error.code : null;
    if (code) {
      const fromCode = translateIfPresent(t, `error.${code}`);
      if (fromCode) return fromCode;
    }
    return genericMessage(t);
  } catch {
    return FALLBACK_GENERIC;
  }
}
