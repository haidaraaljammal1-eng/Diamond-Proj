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

/**
 * On a public link, a bare auth code without a reason still describes the
 * link itself — never a staff session — so it renders the link error page.
 */
const PUBLIC_LINK_CODE_REASONS: Record<string, string> = {
  TOKEN_INVALID: "CONTRACT_LINK_INVALID",
  TOKEN_EXPIRED: "CONTRACT_LINK_EXPIRED",
};

export function publicRentalErrorReason(
  error: ApiRequestError | null,
): string | null {
  if (!error) return null;
  if (typeof error.context?.reason === "string") return error.context.reason;
  return PUBLIC_LINK_CODE_REASONS[error.code] ?? null;
}
