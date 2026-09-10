import type { ApiRequestError } from "@/infrastructure/api/errors";

export interface MaintenanceErrorTranslator {
  (key: string): string;
  has: (key: string) => boolean;
}

/**
 * Maps Backend maintenance errors. Domain reasons live on `context.reason`;
 * HTTP `code` is the fallback. Never returns the raw backend message.
 */
export function resolveMaintenanceErrorMessage(
  t: MaintenanceErrorTranslator,
  error: ApiRequestError | null,
): string | null {
  if (!error) return null;

  const reason =
    typeof error.context?.reason === "string" ? error.context.reason : null;

  if (reason) {
    const reasonKey = `error.${reason}`;
    if (t.has(reasonKey)) return t(reasonKey);
  }

  const codeKey = `error.${error.code}`;
  if (t.has(codeKey)) return t(codeKey);

  return t("error.generic");
}
