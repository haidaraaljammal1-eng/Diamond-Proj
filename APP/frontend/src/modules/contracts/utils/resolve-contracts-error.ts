import type { ApiRequestError } from "@/infrastructure/api/errors";

export interface ContractsErrorTranslator {
  (key: string): string;
  has: (key: string) => boolean;
}

/**
 * Maps Backend contract errors. Domain reasons live on `context.reason`;
 * HTTP `code` is the fallback.
 */
export function resolveContractsErrorMessage(
  t: ContractsErrorTranslator,
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
