/**
 * Codes the Backend uses for a session that cannot be recovered by refreshing.
 * `next-auth`'s own `useSession()` only learns about a dead session on its next
 * focus/interval refetch, so a page can sit on a stale "authenticated" session
 * showing a generic load error instead of being sent to `/login`. Redirecting
 * the moment the API itself reports one of these codes closes that gap.
 */
export const DEAD_SESSION_CODES: ReadonlySet<string> = new Set([
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "UNAUTHORIZED",
]);

/**
 * Staff requests redirect to `/login` on a dead session. Public requests
 * (customer contract links) never do: there `TOKEN_INVALID` / `TOKEN_EXPIRED`
 * describe the public link, and the public page renders its own link error.
 */
export function shouldRedirectToLogin(
  code: string,
  options: { publicRequest?: boolean } = {},
): boolean {
  if (options.publicRequest) return false;
  return DEAD_SESSION_CODES.has(code);
}
