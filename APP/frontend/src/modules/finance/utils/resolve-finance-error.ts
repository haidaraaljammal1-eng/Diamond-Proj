import type { ApiRequestError } from "@/infrastructure/api/errors";

type FinanceTranslator = (key: string, values?: Record<string, string | number>) => string;

export function resolveFinanceErrorMessage(
  t: FinanceTranslator,
  error: ApiRequestError | null | undefined,
): string | null {
  if (!error) return null;
  const code = error.code;
  if (code && t(`errors.${code}`) !== `errors.${code}`) {
    return t(`errors.${code}`);
  }
  return t("errors.generic");
}
