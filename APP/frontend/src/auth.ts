import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type {
  AuthUser,
  LoginResult,
  TokenPair,
} from "@/infrastructure/auth/auth.types";
import { createRefreshCoordinator } from "@/infrastructure/auth/refresh-coordinator";
import {
  shouldSyncPermissionsFromAuthMe,
  syncJwtPermissionsFromAuthMe,
} from "@/infrastructure/auth/session-permissions";
import { env } from "@/config/env";

async function backendRequest<T>(
  path: string,
  body?: unknown,
  accessToken?: string,
  method = "POST",
): Promise<T> {
  const response = await fetch(`${env.apiUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => undefined)) as
    | { data?: T; error?: { code?: string; message?: string } }
    | undefined;
  if (!response.ok || !payload?.data)
    throw new Error(payload?.error?.code ?? `HTTP_${response.status}`);
  return payload.data;
}

/**
 * Refresh tokens are SINGLE-USE: the Backend rotates them and rejects a reuse
 * with `TOKEN_INVALID`. The coordinator makes concurrent callbacks share one
 * rotation instead of poisoning the session — see refresh-coordinator.ts.
 */
const refreshToken = createRefreshCoordinator<TokenPair>((token) =>
  backendRequest<TokenPair>("/auth/refresh", { refreshToken: token }),
);

/**
 * Concurrent jwt callbacks share one GET /auth/me per access token so session
 * revalidation cannot stampede the Backend. Failures are not cached.
 */
const fetchCurrentUser = createRefreshCoordinator<AuthUser>(
  (accessToken) =>
    backendRequest<AuthUser>("/auth/me", undefined, accessToken, "GET"),
  { ttlMs: 5_000 },
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/ar/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const result = await backendRequest<LoginResult>("/auth/login", {
          email: credentials.email,
          password: credentials.password,
        });
        if (result.requiresTwoFactor) throw new Error("TWO_FACTOR_REQUIRED");
        const user = await backendRequest<AuthUser>(
          "/auth/me",
          undefined,
          result.accessToken,
          "GET",
        );
        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          // The session carries role KEYS: the Backend sends role objects and
          // every consumer (navigation, dashboard) matches on `system_admin`.
          roles: user.roles.map((role) => role.key),
          permissions: user.permissions,
          accessToken: result.accessToken,
          accessTokenExpiresAt: Date.now() + result.expiresIn * 1000,
          refreshToken: result.refreshToken,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.userId = user.id;
        token.roles = user.roles;
        token.permissions = user.permissions;
        token.accessToken = user.accessToken;
        token.accessTokenExpiresAt = user.accessTokenExpiresAt;
        token.refreshToken = user.refreshToken;
        token.permissionsSyncedAt = Date.now();
        return token;
      }

      const accessTokenStillFresh =
        Boolean(token.accessToken) &&
        typeof token.accessTokenExpiresAt === "number" &&
        Date.now() < token.accessTokenExpiresAt - 30_000;

      if (accessTokenStillFresh) {
        if (shouldSyncPermissionsFromAuthMe(token, Date.now(), trigger)) {
          return syncJwtPermissionsFromAuthMe(token, fetchCurrentUser);
        }
        return token;
      }

      if (!token.accessToken || !token.accessTokenExpiresAt) {
        return token;
      }
      if (!token.refreshToken) {
        return { ...token, error: "RefreshAccessTokenError" };
      }
      try {
        const refreshed = await refreshToken(token.refreshToken);
        const next = {
          ...token,
          accessToken: refreshed.accessToken,
          accessTokenExpiresAt: Date.now() + refreshed.expiresIn * 1000,
          refreshToken: refreshed.refreshToken,
          error: undefined,
        };
        return await syncJwtPermissionsFromAuthMe(next, fetchCurrentUser);
      } catch {
        return {
          ...token,
          error: "RefreshAccessTokenError" as const,
          accessToken: undefined,
          refreshToken: undefined,
        };
      }
    },
    async session({ session, token }) {
      session.user.id = token.userId ?? "";
      session.user.roles = token.roles ?? [];
      session.user.permissions = token.permissions ?? [];
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    },
    authorized() {
      return true;
    },
  },
  events: {
    async signOut(message) {
      if ("token" in message && message.token?.accessToken) {
        await backendRequest<{ message: string }>(
          "/auth/logout",
          undefined,
          message.token.accessToken,
        ).catch(() => undefined);
      }
    },
  },
});
