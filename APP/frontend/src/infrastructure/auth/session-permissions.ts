import type { AuthUser } from "./auth.types";

/**
 * Frontend session permission snapshot.
 *
 * Backend DB effective permissions remain the authorization authority.
 * `GET /auth/me` is the only frontend source. This JWT copy exists so UX
 * guards and navigation can mirror that payload — it is never permission
 * authority for protected API routes.
 */
export interface SessionPermissionToken {
  userId?: string;
  roles?: string[];
  permissions?: string[];
  accessToken?: string;
  error?: string;
  permissionsSyncedAt?: number;
}

/** Re-read `/auth/me` at most this often when the access token is still valid. */
export const PERMISSIONS_SYNC_TTL_MS = 5 * 60 * 1000;

export function shouldSyncPermissionsFromAuthMe(
  token: SessionPermissionToken,
  now: number,
  trigger?: string,
  ttlMs = PERMISSIONS_SYNC_TTL_MS,
): boolean {
  if (!token.accessToken || token.error === "RefreshAccessTokenError") {
    return false;
  }
  if (trigger === "update") return true;
  if (token.permissionsSyncedAt == null) return true;
  return now - token.permissionsSyncedAt >= ttlMs;
}

/**
 * Replace (never merge) session roles/permissions with the current `/auth/me`
 * payload so grants and revocations both take effect after revalidation.
 */
export function applyAuthUserToToken<T extends SessionPermissionToken>(
  token: T,
  user: AuthUser,
  now: number,
): T & {
  userId: string;
  roles: string[];
  permissions: string[];
  permissionsSyncedAt: number;
} {
  return {
    ...token,
    userId: String(user.id),
    roles: user.roles.map((role) => role.key),
    permissions: [...user.permissions],
    permissionsSyncedAt: now,
  };
}

export async function syncJwtPermissionsFromAuthMe<T extends SessionPermissionToken>(
  token: T,
  fetchMe: (accessToken: string) => Promise<AuthUser>,
  now = Date.now(),
): Promise<T & { permissionsSyncedAt: number; permissions?: string[] }> {
  if (!token.accessToken) {
    return { ...token, permissionsSyncedAt: now };
  }
  try {
    const user = await fetchMe(token.accessToken);
    return applyAuthUserToToken(token, user, now);
  } catch {
    // Keep the last snapshot and back off until TTL so a failing `/auth/me`
    // cannot loop on every NextAuth jwt callback.
    return { ...token, permissionsSyncedAt: now };
  }
}
