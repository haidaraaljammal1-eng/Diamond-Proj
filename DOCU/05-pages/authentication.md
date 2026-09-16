# Frontend Authentication

Fastify at `APP/backend` is the authentication authority. The frontend uses Auth.js (`next-auth` 5.0.0-beta.32) only as its Credentials sign-in and frontend session layer; it has no user database or Prisma adapter.

## Flow

`useAuth` and `useLogin` are the only UI facades. Credentials are sent by the Auth.js Credentials provider to `POST /auth/login`. A successful non-2FA response is verified through `GET /auth/me` and stored in the encrypted Auth.js JWT. The access token is exposed only where the browser API client needs it. The refresh token remains server-side in the Auth.js JWT and is never part of the client session, Zustand, storage APIs, logs, or URLs.

Auth.js refreshes the rotating Backend token when its access token is near expiry. After a successful rotation it re-reads `GET /auth/me` and replaces the session permission snapshot. A failed refresh invalidates the token and the session. Logout calls Fastify `POST /auth/logout` through the Auth.js sign-out event, then removes the frontend session. Fastify `403` remains an authorization error; it is not logout.

The authenticated session lasts 7 days (`ACCESS_TOKEN_TTL=604800` and Auth.js `session.maxAge`). The refresh token remains longer-lived so a session that is still in use can rotate before expiry.

The Backend's `requiresTwoFactor` login response creates no Auth.js session. The challenge must be completed at `POST /auth/two-factor/verify` or `/auth/two-factor/recovery` before a session can exist. The current frontend exposes the architecture for this flow but does not invent a 2FA page.

## Effective permissions (UX mirror)

Backend database effective permissions are the authorization authority. `GET /auth/me` exposes them. The Auth.js JWT copies that list so frontend guards and navigation can mirror it. The access token is not permission authority — every protected Backend request still loads effective permissions from the database.

Frontend permission snapshots are loaded and replaced (never merged) from `GET /auth/me` at:

- Credentials login (after `POST /auth/login`)
- successful access-token refresh
- explicit session update (`trigger === "update"`)
- JWT revalidation when the snapshot is missing (existing sessions) or older than 5 minutes

`usePermissions()` and `hasPermission("contracts.read")` read `session.user.permissions` only. They do not call `/auth/me` on React render. Concurrent NextAuth `jwt` callbacks share one in-flight `/auth/me` per access token.

New domain permissions require: catalog → seed → `RolePermission` → `GET /auth/me` verification → frontend session verification after the next revalidation. A manual logout is not required for the snapshot to catch up.

## Route guards

The single `src/proxy.ts` combines next-intl and Auth.js. Authenticated users are redirected before render from locale-aware `/ar|en/login`, `/forgot-password`, and `/reset-password` to the same-locale dashboard. Unauthenticated users are redirected from `/ar|en/dashboard` and its descendants to the same-locale login. The dashboard also verifies the server session as a defense in depth. Auth API routes, static files, and assets are excluded by the Proxy matcher.

## Main files

- `APP/frontend/src/auth.ts`: Credentials provider, JWT refresh, permission re-hydration from `GET /auth/me`, session projection, Backend logout.
- `APP/frontend/src/infrastructure/auth/session-permissions.ts`: when and how the JWT permission snapshot is replaced.
- `APP/frontend/src/proxy.ts`: locale-aware pre-render route guards.
- `APP/frontend/src/app/api/auth/[...nextauth]/route.ts`: Auth.js App Router handler.
- `APP/frontend/src/modules/auth/hooks/`: UI authentication facades.
- `APP/frontend/src/infrastructure/api/client.ts`: central access-token injection.

## Token refresh (single-use rotation)

The Backend ROTATES refresh tokens: `POST /auth/refresh` returns a new pair and
answers any reuse of the old one with `TOKEN_INVALID`.

The NextAuth `jwt` callback runs once per request, so a page that fires several
requests at once (a list plus a lookup) used to refresh the same stored token
several times in parallel: the first rotation succeeded, the rest came back 401,
and the session was marked `RefreshAccessTokenError` — which surfaced on every
page as a data-loading error ("could not load the fleet") roughly 15 minutes
after login, fixable only by signing in again.

Two pieces prevent that:

- `src/infrastructure/auth/refresh-coordinator.ts` — keys in-flight requests and
  their results by the OLD token, so concurrent callbacks share one rotation and
  a straggler still receives usable tokens (60s window). Failures are never
  cached. Unit-tested in `refresh-coordinator.test.ts`.
- `src/shared/layouts/app-shell/session-guard.tsx` — when a session really can no
  longer be refreshed, it signs out and sends the user to the login screen
  instead of leaving an authenticated-looking shell whose every request 401s.
