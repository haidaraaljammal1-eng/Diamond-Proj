import type { ApiRequestError } from "@/infrastructure/api/errors";

export interface PublicRentalErrorTranslator {
  (key: string): string;
  has: (key: string) => boolean;
}

export function resolvePublicRentalErrorMessage(
  t: PublicRentalErrorTranslator,
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

export function publicRentalErrorReason(
  error: ApiRequestError | null,
): string | null {
  if (!error) return null;
  return typeof error.context?.reason === "string" ? error.context.reason : null;
}
