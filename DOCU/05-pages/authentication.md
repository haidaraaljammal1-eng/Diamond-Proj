# Frontend Authentication

Fastify at `APP/backend` is the authentication authority. The frontend uses Auth.js (`next-auth` 5.0.0-beta.32) only as its Credentials sign-in and frontend session layer; it has no user database or Prisma adapter.

## Flow

`useAuth` and `useLogin` are the only UI facades. Credentials are sent by the Auth.js Credentials provider to `POST /auth/login`. A successful non-2FA response is verified through `GET /auth/me` and stored in the encrypted Auth.js JWT. The access token is exposed only where the browser API client needs it. The refresh token remains server-side in the Auth.js JWT and is never part of the client session, Zustand, storage APIs, logs, or URLs.

Auth.js refreshes the rotating Backend token when its access token is near expiry. A failed refresh invalidates the token and the session. Logout calls Fastify `POST /auth/logout` through the Auth.js sign-out event, then removes the frontend session. Fastify `403` remains an authorization error; it is not logout.

The authenticated session lasts 7 days (`ACCESS_TOKEN_TTL=604800` and Auth.js `session.maxAge`). The refresh token remains longer-lived so a session that is still in use can rotate before expiry.

The Backend's `requiresTwoFactor` login response creates no Auth.js session. The challenge must be completed at `POST /auth/two-factor/verify` or `/auth/two-factor/recovery` before a session can exist. The current frontend exposes the architecture for this flow but does not invent a 2FA page.

## Route guards

The single `src/proxy.ts` combines next-intl and Auth.js. Authenticated users are redirected before render from locale-aware `/ar|en/login`, `/forgot-password`, and `/reset-password` to the same-locale dashboard. Unauthenticated users are redirected from `/ar|en/dashboard` and its descendants to the same-locale login. The dashboard also verifies the server session as a defense in depth. Auth API routes, static files, and assets are excluded by the Proxy matcher.

## Main files

- `APP/frontend/src/auth.ts`: Credentials provider, JWT refresh, session projection, Backend logout.
- `APP/frontend/src/proxy.ts`: locale-aware pre-render route guards.
- `APP/frontend/src/app/api/auth/[...nextauth]/route.ts`: Auth.js App Router handler.
- `APP/frontend/src/modules/auth/hooks/`: UI authentication facades.
- `APP/frontend/src/infrastructure/api/client.ts`: central access-token injection.
