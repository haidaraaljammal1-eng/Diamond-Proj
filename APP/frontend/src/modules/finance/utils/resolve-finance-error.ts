import type { ApiRequestError } from "@/infrastructure/api/errors";

export interface FinanceErrorTranslator {
  (key: string, values?: Record<string, string | number>): string;
  has?: (key: string) => boolean;
}

const GENERIC_KEY = "errors.generic";
const FALLBACK_GENERIC = "Finance data could not be loaded. Try again.";

function hasMessage(t: FinanceErrorTranslator, key: string): boolean {
  try {
    if (typeof t.has === "function") return t.has(key);
  } catch {
    return false;
  }
  return false;
}

function translateIfPresent(t: FinanceErrorTranslator, key: string): string | null {
  if (!hasMessage(t, key)) return null;
  try {
    const value = t(key);
    if (typeof value !== "string" || value.trim() === "" || value === key) return null;
    return value;
  } catch {
    return null;
  }
}

function genericMessage(t: FinanceErrorTranslator): string {
  return translateIfPresent(t, GENERIC_KEY) ?? FALLBACK_GENERIC;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Maps Backend Finance errors. Domain reasons live on `context.reason`;
 * HTTP `code` is the fallback. Never throws. Never returns raw backend enums.
 */
export function resolveFinanceErrorMessage(
  t: FinanceErrorTranslator,
  error: ApiRequestError | null | undefined | unknown,
): string | null {
  try {
    if (error == null) return null;
    if (!isRecord(error)) return genericMessage(t);

    const context = isRecord(error.context) ? error.context : null;
    const reason = typeof context?.reason === "string" ? context.reason : null;
    if (reason) {
      const fromReason = translateIfPresent(t, `errors.${reason}`);
      if (fromReason) return fromReason;
    }

    const code = typeof error.code === "string" ? error.code : null;
    if (code) {
      const fromCode = translateIfPresent(t, `errors.${code}`);
      if (fromCode) return fromCode;
    }

    return genericMessage(t);
  } catch {
    return FALLBACK_GENERIC;
  }
}
