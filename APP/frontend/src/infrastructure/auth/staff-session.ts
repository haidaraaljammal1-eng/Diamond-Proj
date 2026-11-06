/** Minimal session shape for staff route guards (proxy + protected layout). */
export type StaffSessionLike = {
  user?: unknown;
  accessToken?: string;
  error?: string;
} | null | undefined;

/**
 * A NextAuth cookie alone is not a live staff session. After admin password
 * reset the JWT may still carry `user` while Backend revoked `authSession` and
 * API calls fail — treating that as authenticated caused login ↔ dashboard loops.
 */
export function isStaffSessionUsable(session: StaffSessionLike): boolean {
  if (!session?.user) return false;
  if (session.error === "RefreshAccessTokenError") return false;
  if (!session.accessToken) return false;
  return true;
}
