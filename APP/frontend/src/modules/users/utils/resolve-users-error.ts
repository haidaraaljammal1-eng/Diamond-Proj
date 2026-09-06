import type { ApiRequestError } from "@/infrastructure/api/errors";

/** Backend `CONFLICT` when deleting/removing the last `system_admin`. */
export function isLastAdminConflict(error: ApiRequestError): boolean {
  if (error.code !== "CONFLICT") return false;
  return /last administrator|administrative access/i.test(error.message);
}

export interface UsersErrorTranslator {
  (key: string): string;
  has: (key: string) => boolean;
}

/**
 * Maps Backend user errors to stable `Users` namespace keys.
 * `CONFLICT` is overloaded (email duplicate vs last admin) — disambiguate by message.
 */
export function resolveUsersErrorMessage(
  t: UsersErrorTranslator,
  error: ApiRequestError | null,
  scope?: "delete",
): string | null {
  if (!error) return null;

  if (isLastAdminConflict(error)) {
    const lastAdminKey = "error.lastAdmin";
    return t.has(lastAdminKey) ? t(lastAdminKey) : t("error.generic");
  }

  if (scope === "delete") {
    const scopedKey = `delete.error.${error.code}`;
    if (t.has(scopedKey)) return t(scopedKey);
  }

  const codeKey = `error.${error.code}`;
  return t.has(codeKey) ? t(codeKey) : t("error.generic");
}
