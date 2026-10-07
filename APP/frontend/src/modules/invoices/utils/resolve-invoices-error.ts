import type { ApiRequestError } from "@/infrastructure/api/errors";

function isApiRequestError(error: unknown): error is ApiRequestError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "ApiRequestError"
  );
}

export interface InvoicesErrorTranslator {
  (key: string, values?: Record<string, string | number>): string;
  has?: (key: string) => boolean;
}

const GENERIC_KEY = "errors.generic";
const WHATSAPP_UNCONFIGURED_REASON = "WHATSAPP_PROVIDER_UNCONFIGURED";

function hasMessage(t: InvoicesErrorTranslator, key: string): boolean {
  try {
    if (typeof t.has === "function") return t.has(key);
  } catch {
    return false;
  }
  return false;
}

function translateIfPresent(t: InvoicesErrorTranslator, key: string): string | null {
  if (!hasMessage(t, key)) return null;
  try {
    const value = t(key);
    if (typeof value !== "string" || value.trim() === "" || value === key) return null;
    return value;
  } catch {
    return null;
  }
}

function genericMessage(t: InvoicesErrorTranslator): string {
  return translateIfPresent(t, GENERIC_KEY) ?? "Invoices could not be loaded. Try again.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function resolveInvoicesErrorMessage(
  t: InvoicesErrorTranslator,
  error: ApiRequestError | null | undefined | unknown,
): string | null {
  if (error == null) return null;
  if (!isApiRequestError(error)) return genericMessage(t);

  if (error.status === 503) {
    const from503 = translateIfPresent(t, "errors.whatsappUnconfigured");
    if (from503) return from503;
  }

  const context = isRecord(error.context) ? error.context : null;
  const reason = typeof context?.reason === "string" ? context.reason : null;
  if (reason === WHATSAPP_UNCONFIGURED_REASON) {
    const fromReason = translateIfPresent(t, "errors.whatsappUnconfigured");
    if (fromReason) return fromReason;
  }
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
}
