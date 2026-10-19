import type { AuthUser } from "./auth.types";

/** Direct GET /auth/me — no in-process cache (live permission sync on `update()`). */
export type FetchCurrentUser = (accessToken: string) => Promise<AuthUser>;

export function selectAuthMeFetcher(
  trigger: string | undefined,
  fresh: FetchCurrentUser,
  coordinated: FetchCurrentUser,
): FetchCurrentUser {
  return trigger === "update" ? fresh : coordinated;
}
