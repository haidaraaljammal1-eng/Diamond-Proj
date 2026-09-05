# AppShell Architecture

> Diamond Rent Car — Protected Application Shell Foundation.
> Phase scope: the protected shell only. No page content was implemented.

## Source of Truth

The Diamond HTML Demo (`/demo.html`) is the visual source of truth. This shell
is extracted from the Demo's **final effective cascade** — the last visual
layer ("PEARL IVORY") that ends in a warm pearl-white + champagne-gold theme.

## Route Structure

```text
src/app/[locale]/
├── (auth)/login/page.tsx                      # no AppShell (own layout)
└── (protected)/
    ├── layout.tsx                             # auth guard + AppShell
    └── dashboard/page.tsx                     # placeholder only
```

Route groups do not change URLs: `/ar/dashboard`, `/en/dashboard`.

## Protected Layout

`src/app/[locale]/(protected)/layout.tsx` — intentionally thin:

- Server auth guard (`auth()`); unauthenticated → `/<locale>/login`
  (no UI flash; protection happens before render).
- `setRequestLocale(locale)` for next-intl static rendering.
- Renders the shared `<AppShell>{children}</AppShell>`.

No sidebar/navigation/permission/business logic lives here.

## AppShell

`src/shared/layouts/app-shell/` — shared by every protected page.

| File | Responsibility |
| --- | --- |
| `app-shell.tsx` | Layout structure (header + rail + content) |
| `app-shell.module.css` | Stage + mobile scrim |
| `header/app-header.tsx` | Demo `#topbar` capsule (brand, role segment, user chip, language) |
| `sidebar/sidebar.tsx` | Demo `#rail` icon dock, render-only |
| `sidebar/sidebar-item.tsx` | `.navit` item (link/action, active state, badge) |
| `sidebar/sidebar-footer.tsx` | `.railfoot` (admin only) |
| `content/app-content.tsx` | `#main` area + centered `.wrap` |
| `store/app-shell.store.ts` | Zustand UI-only state (mobile drawer) |
| `index.ts` | Public API — import `AppShell` only |

AppShell owns no API, no business logic, no page data.

## Navigation

`src/modules/navigation/` — centralized and typed:

- `navigation.config.ts` — single source; mirrors the Demo rail exactly
  (labels, icons, order, `adminOnly`, WhatsApp `action`, badge).
- `navigation.types.ts` — typed config + `UseNavigationResult`.
- `navigation.icons.tsx` — Demo SVGs, extracted verbatim (viewBoxes, stroke).
- `hooks/use-navigation.ts` — active item from the URL (never stored),
  locale-aware hrefs, permission filtering by real Backend permissions,
  and Demo `adminOnly` role behavior.

Policies:

- Only `dashboard.read` maps to a real Backend permission today. No permission
  is invented; remaining Demo pages declare none yet.
- `adminOnly` mirrors the Demo owner/employee `adminonly` behavior (session
  role `system_admin`).
- Desktop and mobile render from the same config/hook/component (one source).

## AppShell Store (UI only)

`app-shell.store.ts` stores `mobileSidebarOpen` + open/toggle/close.
It never stores route, user, permissions, auth, or navigation items.

## Active Route

URL is the source of truth: `usePathname` (locale stripped) matches the item
`href` (exact or child prefix). No duplicated Zustand route state.

## RTL / LTR

Same components for `ar` (RTL) and `en` (LTR). The `<html dir>` from the
locale layout drives placement via logical CSS properties
(`inset-inline-start/end`). Mobile drawer hidden transforms use
`[dir="ltr"]` overrides.

## Permission UX

Backend remains the permission authority. The shell only uses session
permissions to filter navigation visibility (UX). Page/API protection stays
server-side in the Protected Layout and the Fastify backend.

## Auth Relationship

Protected routes → `auth()` (server) → AppShell. `useAuth()`/`usePermissions()`
(the session) feed the header user chip and nav filtering. Logout is not part
of the Demo layout, so the shell defines none.

## CSS Organization

- `tokens.css` — final Demo palette, gradients, shadows, stage background,
  shell surfaces, corner brackets, fonts (IBM Plex Sans Arabic).
- `globals.css` — body stage composition (`body::before/::after`) + selection.
- `app-shell/*.module.css` — per-region CSS extracted from the Demo cascade.
- Page CSS stays inside the page; pages never style the shell and vice-versa.

## Responsive Behavior (from the Demo)

- ≤ 1080px: content margin tightens to the rail.
- ≤ 900px: rail becomes an off-canvas drawer + scrim; topbar floats full-width;
  burger appears; wordmark/user text/short labels toggle.
- ≤ 560px / ≤ 400px: content padding tiers.

## Shared Pieces

- `shared/components/ui/brand-logo` — the single Diamond crystal mark.
- Shared Button is not reused for shell controls because the Demo topbar/rail
  controls are distinct shell primitives (documented visual extracts).

## Files

- `src/app/[locale]/(protected)/layout.tsx`
- `src/shared/layouts/app-shell/*`
- `src/modules/navigation/*`
- `src/styles/tokens.css`, `src/styles/globals.css`
- `messages/ar.json`, `messages/en.json` (Navigation / Shell / Dashboard)

## Visual Regression Note

No Playwright baseline can be checked in until a reference screenshot of the
original Demo is captured and committed. Until then the shell is verified by
typecheck, lint, and production build; visual parity is tracked against
`/demo.html` manually.