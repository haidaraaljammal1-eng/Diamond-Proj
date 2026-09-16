import type { ApiRequestError } from "@/infrastructure/api/errors";

export interface PublicReturnErrorTranslator {
  (key: string): string;
  has: (key: string) => boolean;
}

export function resolvePublicReturnErrorMessage(
  t: PublicReturnErrorTranslator,
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

export function publicReturnErrorReason(
  error: ApiRequestError | null,
): string | null {
  if (!error) return null;
  return typeof error.context?.reason === "string" ? error.context.reason : null;
}

export function isReturnLinkGoneReason(reason: string | null): boolean {
  return (
    reason === "CONTRACT_LINK_EXPIRED" ||
    reason === "CONTRACT_LINK_INVALID" ||
    reason === "CONTRACT_LINK_USED"
  );
}
