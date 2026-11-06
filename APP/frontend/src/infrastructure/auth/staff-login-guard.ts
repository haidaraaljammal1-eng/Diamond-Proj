import {
  isStaffSessionUsable,
  type StaffSessionLike,
} from "./staff-session.ts";

/** Query flag after forced logout — always show login even if a stale JWT remains. */
export const STAFF_REAUTH_QUERY = "reauth";

export function isStaffReauthLogin(
  searchParams: { reauth?: string } | undefined,
): boolean {
  return searchParams?.reauth === "1";
}

/** Reads `?reauth=1` from a location search string (client-safe). */
export function readStaffReauthFromSearch(search: string): boolean {
  if (!search) return false;
  try {
    return new URLSearchParams(search).get(STAFF_REAUTH_QUERY) === "1";
  } catch {
    return false;
  }
}

/**
 * Client login must treat `reauth=1` as authoritative even before `useSearchParams`
 * hydrates — otherwise a stale JWT briefly redirects back to `/dashboard`.
 */
export function resolveStaffReauthRequested(
  searchParamReauth: string | null | undefined,
): boolean {
  if (searchParamReauth === "1") return true;
  if (typeof window !== "undefined") {
    return readStaffReauthFromSearch(window.location.search);
  }
  return false;
}

/**
 * Login page must not send users to the dashboard on `session.user` alone.
 * After server-side session revoke the JWT can still carry identity fields.
 */
export function shouldRedirectAuthenticatedStaffFromLogin(
  session: StaffSessionLike,
  reauthRequested: boolean,
): boolean {
  if (reauthRequested) return false;
  return isStaffSessionUsable(session);
}

/** Client login shell must not bounce to dashboard during `?reauth=1` logout. */
export function shouldAutoRedirectStaffFromLoginScreen(
  session: StaffSessionLike,
  reauthRequested: boolean,
): boolean {
  return shouldRedirectAuthenticatedStaffFromLogin(session, reauthRequested);
}
