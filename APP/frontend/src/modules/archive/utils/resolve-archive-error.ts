import type { ApiRequestError } from "@/infrastructure/api/errors";

export interface ArchiveErrorTranslator {
  (key: string): string;
  has: (key: string) => boolean;
}

export function resolveArchiveErrorMessage(
  t: ArchiveErrorTranslator,
  error: ApiRequestError | null | undefined,
): string | null {
  if (!error) return null;

  const reason =
    typeof error.context?.reason === "string" ? error.context.reason : null;
  if (reason) {
    const reasonKey = `error.${reason}`;
    if (t.has(reasonKey)) return t(reasonKey);
  }

  if (error.status === 403 && t.has("error.forbidden")) return t("error.forbidden");
  if (error.status === 404 && t.has("error.notFound")) return t("error.notFound");

  const codeKey = `error.${error.code}`;
  if (t.has(codeKey)) return t(codeKey);

  return t("error.generic");
}
