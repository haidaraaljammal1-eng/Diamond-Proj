import type { ApiRequestError } from "@/infrastructure/api/errors";

export interface PublicRenewalErrorTranslator {
  (key: string): string;
  has: (key: string) => boolean;
}

export function resolvePublicRenewalErrorMessage(
  t: PublicRenewalErrorTranslator,
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

export function publicRenewalErrorReason(
  error: ApiRequestError | null,
): string | null {
  if (!error) return null;
  return typeof error.context?.reason === "string" ? error.context.reason : null;
}

export function isRenewalLinkGoneReason(reason: string | null): boolean {
  return (
    reason === "CONTRACT_LINK_EXPIRED" ||
    reason === "CONTRACT_LINK_INVALID" ||
    reason === "CONTRACT_LINK_USED"
  );
}

/** Customer confirmation is the only input. Commercial values stay server-owned. */
export function publicRenewalEditableFields(): readonly string[] {
  return [];
}
