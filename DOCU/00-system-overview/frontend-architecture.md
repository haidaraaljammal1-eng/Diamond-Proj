# Diamond Frontend — Architecture

## Stack

- Next.js App Router
- React and TypeScript strict mode
- `next-intl` with `ar` as the default locale and `en` as the secondary locale
- Zustand for API-backed application state
- Native `fetch` through one central API client

## Structure

```text
APP/frontend/
├── src/app/[locale]/       # Locale-aware routing only
├── src/modules/<domain>/    # Domain API, stores, hooks, components
├── src/infrastructure/     # API, auth, i18n, and other cross-cutting infrastructure
├── src/config/             # Environment-backed configuration
└── messages/               # ar.json and en.json
```

## Request Path

```text
Page / Component
→ Domain Hook
→ Zustand Store
→ Domain API Adapter
→ Central API Client
→ Fastify Backend
```

Pages and UI components do not call `fetch`, API adapters, or Zustand stores directly. Hooks are the UI facade; stores coordinate API-backed state and operation status; API adapters contain typed endpoint calls; the central client owns HTTP behavior and normalized errors.

## Domain Convention

Each domain is self-contained and may expose `api/`, `stores/`, `hooks/`, `components/`, `types/`, and `index.ts`. Consumers should use the domain public API. Lookup flows remain separate from CRUD flows when the Backend exposes a separate permission or endpoint.

## State and Errors

Use domain stores rather than one global store. Selectors keep subscriptions narrow. Keep transient UI state local to the component. Store normalized errors with `code`, `message`, `details`, `context`, `requestId`, and `status` where available. UI concerns such as toasts, translated copy, routing decisions, and JSX do not belong in stores.

### Authoritative refresh after actions

After a successful backend mutation, the owning domain store refreshes the affected list, summary, and open detail before the action resolves. The UI never requires a browser reload. A post-mutation refresh must not reuse a read that started before the write: it waits for that request to settle, then starts one new backend read. Concurrent refresh callers still share that new request.

Cross-domain projections refresh with the owning mutation when they can remain mounted in Zustand. Contract actions refresh Contracts and Fleet; Maintenance actions refresh Maintenance and Fleet; role create/update refreshes both the permission matrix and the assignable-role lookup. Stores may apply the backend mutation response immediately for responsive UI, but the follow-up read remains authoritative.

## i18n

Routes are locale-aware (`/ar/...` and `/en/...`). The default locale is Arabic. The locale layout sets `lang` and `dir` (`rtl` for Arabic, `ltr` for English), and user-facing strings belong in `messages/`.

## Backend Integration

The Backend in `APP/backend` remains the authority for authentication, authorization, permissions, validation, and business rules. The frontend uses the Backend's `{ data, meta? }` success envelope and structured `error` envelope. Access-token storage is not invented in the frontend; requests use credentials so the Backend session strategy remains authoritative.

## Public customer routes

Public rental lives outside `(protected)` and does not use AppShell. Route: `/[locale]/rental/[token]`. Domain module: `src/modules/public-rental/`. See `DOCU/05-pages/public-rental-flow.md`.
