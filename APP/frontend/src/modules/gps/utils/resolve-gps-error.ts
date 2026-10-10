import type { ApiRequestError } from "@/infrastructure/api/errors";

export interface GpsErrorTranslator {
  (key: string): string;
  has: (key: string) => boolean;
}

export function resolveGpsErrorMessage(
  t: GpsErrorTranslator,
  error: ApiRequestError | null,
): string | null {
  if (!error) return null;
  const reason =
    typeof error.context?.reason === "string" ? error.context.reason : null;
  const reasonKey = reason ? `error.${reason}` : null;
  if (reasonKey && t.has(reasonKey)) return t(reasonKey);
  const codeKey = `error.${error.code}`;
  if (t.has(codeKey)) return t(codeKey);
  return t("error.generic");
}
