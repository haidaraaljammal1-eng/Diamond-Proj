# Roles & Permissions Page

The Backend RBAC as a matrix: **rows are permissions, columns are roles**. The
Backend is the single authority — no RBAC data is defined, cached or invented in
the frontend. With `roles.manage` the page also writes: each cell is a checkbox
that grants or revokes that permission immediately, and roles can be created and
renamed from the shared dialog.

## Route

| Locale | URL         |
| ------ | ----------- |
| ar     | `/ar/roles` |
| en     | `/en/roles` |

Inside `src/app/[locale]/(protected)/roles/page.tsx`, so the protected layout's
server-side auth guard and the shared AppShell apply. A deep link works on its
own; a language switch keeps the same page and session.

## Required permissions

The page reads two Backend endpoints, so it requires **both** catalog
permissions (`APP/backend/src/constants/permissions.ts`):

| Permission         | Used for                             |
| ------------------ | ------------------------------------ |
| `roles.read`       | `GET /roles` — the matrix columns    |
| `permissions.read` | `GET /permissions` — the matrix rows |

`roles.manage` is required additionally for the create/edit dialogs; without it
no write control is rendered.

Without both, nothing is requested and a "no access" panel is rendered instead.
The navigation entry is hidden by the same rule. This is UX only — the Backend
still enforces every request.

## Backend endpoints

| Endpoint                              | Response                       | Notes                                                   |
| ------------------------------------- | ------------------------------ | ------------------------------------------------------- |
| `GET /roles?page&pageSize` (admin)     | `{ data: Role[], meta }`       | Paginated, `pageSize` capped at 100; all pages fetched   |
| `GET /permissions` (admin)             | `{ data: Permission[] }`       | Full seeded catalog, ordered by `category` then `key`    |
| `POST /roles` (admin)                  | `{ data: Role }`               | Create — `roles.manage`; new role starts with no grants  |
| `PUT /roles/:id` (admin)               | `{ data: Role }`               | Update name/description — `roles.manage`                 |
| `PUT /roles/:id/permissions` (admin)    | `{ data: Role }`               | Replace grants — `roles.manage`; refuses system roles    |

Both are loaded in parallel (`Promise.all`). A failure in either one surfaces as
one error state — a partial matrix is never rendered.

## Models (frontend DTOs, not Prisma types)

```ts
Role       { id, key, name, description|null, isSystem, permissions: string[], createdAt, updatedAt }
Permission { id, key, category|null, description|null }
```

`createdAt` / `updatedAt` are Dates in the Backend and arrive as ISO strings.

## Architecture

```text
RolesPage → RolesScreen → useRolesPermissions() → roles-permissions.store
          → roles.api / permissions.api → central API client → Fastify

RoleFormDialog → useRoleMutations() → roles-permissions.store → roles.api → …
```

The screen and the matrix never touch the store or the API layer. The store
holds raw Backend entities only (no derived map, no translated text, no JSX);
the derived matrix is built in the hook.

## Matrix

`buildPermissionMatrix(roles, permissions)` (pure, unit-tested) produces the
render model and indexes grants as `roleId → Set<permissionKey>`, so
`hasPermission(roleId, key)` is O(1) and no transformation happens inside the
render loop.

- Semantic `<table>`: `<th scope="col">` per role, `<th scope="row">` per
  permission, `<th scope="colgroup">` per group, plus a screen-reader caption.
- Sticky role header (vertical scroll) and sticky permission column
  (horizontal scroll); scrolling is contained in the matrix card, so the page
  itself never scrolls horizontally.
- Every cell is the shared Diamond `Checkbox` carrying an accessible name
  ("View vehicles — Branch manager"), so the state never rests on color alone.
- Cells are disabled — visible but not editable — for a system role (the
  Backend refuses to modify one) and for a session without `roles.manage`.
- When the Backend returns fewer roles than fit, empty placeholder columns fill
  the leftover width so a role column keeps its own width. They are
  `aria-hidden` and carry no data; the count is measured with a
  `ResizeObserver` against the column widths in the CSS module.

## Grouping, search, filter

- Groups come from the Backend `category`, falling back to the key namespace
  (`vehicles.read` → `vehicles`). No business category is invented.
- Backend ordering is preserved (category, then key).
- Search is local (all data is already loaded) over the technical key and the
  displayed label; it never calls the Backend per keystroke and lives in React
  state, not in Zustand.
- The group filter uses the shared Diamond Select and appears only when there
  are at least four groups.
- Groups with no matching row are dropped — no empty group header.

## i18n

`next-intl`, namespace `Roles`, aligned in `ar.json` and `en.json`. The catalog
is Backend-owned and grows without the frontend, so permission labels are
composed rather than written one by one:

1. per-permission override `Roles.permissions.<key with _ for .>` if present,
2. otherwise the translated action `Roles.actions.<action>` (the row already
   sits under its translated group heading),
3. otherwise the technical key itself (`vehicles.read`).

Step 3 is a deliberate, controlled fallback for a permission the Backend added
before the frontend labelled it — never a raw i18n key on screen. Group labels
fall back to the raw category the same way. Backend errors are translated from
stable error codes (`FORBIDDEN`, `UNAUTHORIZED`, `TOKEN_EXPIRED`, …), never from
the backend message text.

## RTL / LTR

Verified in both `/ar/roles` and `/en/roles`. All page CSS uses logical
properties (`inset-inline-*`, `margin-inline-*`, `border-inline-*`,
`text-align: start`). The only physical values are the two gradient directions,
each with an explicit `[dir="rtl"]` counterpart. Technical keys stay LTR through
`direction: ltr; unicode-bidi: isolate`. No page CSS touches `body`, the
AppShell or the Sidebar.

## Navigation

One entry under the `admin` group in `src/modules/navigation/navigation.config.ts`,
declaring `permissions: ROLES_PAGE_PERMISSIONS`. `useNavigation()` now treats a
declared Backend permission as authoritative over the Demo `adminonly`
heuristic: an item that declares real permissions is permission-driven even
inside an `adminOnly` group. Items that declare none keep the Demo behavior.

## Main files

```text
src/app/[locale]/(protected)/roles/page.tsx
src/modules/roles/
├── api/{roles.api.ts, roles.api.types.ts, permissions.api.ts}
├── stores/roles-permissions.store.ts
├── hooks/{use-roles-permissions.ts, use-role-mutations.ts, use-permission-labels.ts}
├── forms/{role.schema.ts, role.fields.ts}
├── components/{roles-screen, permission-matrix, role-header, permission-cell,
│               role-form-dialog}
├── types/{role.types.ts, permission.types.ts}
├── utils/{permission-matrix.ts, role-key.ts, *.test.ts}
├── roles.permissions.ts
└── index.ts
src/shared/components/ui/page-header/   (shared page header)
src/shared/components/ui/dialog/        (shared Demo dialog)
src/shared/components/ui/checkbox/      (shared Diamond checkbox)
```

## Editing grants (auto-save)

Toggling a cell calls `PUT /roles/:id/permissions` with the role's full,
recomputed key list. There is no draft state and no save button:

- the cell flips immediately (optimistic) and is marked pending while in flight,
- the Backend response replaces the role in the store,
- a refusal rolls the whole role back to the previous grants and shows a
  translated, dismissible error next to the matrix.

Pending cells live in the store as `{ "<roleId>:<permissionKey>": true }` —
serializable, no `Set`/`Map` in state.

## Create / edit dialogs

Both use the shared `Dialog` (`src/shared/components/ui/dialog`) — the Demo
modal, value for value: scrim tint plus `backdrop-filter` glass, corner
brackets, top hairline, rise animation, and the clipped close control at the
inline-end. It is portalled to `<body>`, because the AppShell content sits in
its own stacking context and an overlay rendered inside it paints under the
header and the rail. Escape and a scrim click close it, focus returns to the
opener, and the body scroll is locked while it is open.

The body is the shared `FormBuilder` (React Hook Form + Zod), with the Demo
action row: the primary submit fills the row and a ghost Cancel sits beside it
(`secondaryAction`). Buttons use the shared `Button` at `size="md"` — the Demo
`.btn` metrics (38px, radius 12, 13px).

The role **key** is never typed: `buildRoleKey(name, existingKeys)` derives a
Backend-valid key (`^[a-z][a-z0-9_]*# Roles & Permissions Page

The Backend RBAC as a matrix: **rows are permissions, columns are roles**. The
Backend is the single authority — no RBAC data is defined, cached or invented in
the frontend. The matrix itself is read-only; a role's name and description can
be created and edited from the page when the session holds `roles.manage`.

## Route

| Locale | URL         |
| ------ | ----------- |
| ar     | `/ar/roles` |
| en     | `/en/roles` |

Inside `src/app/[locale]/(protected)/roles/page.tsx`, so the protected layout's
server-side auth guard and the shared AppShell apply. A deep link works on its
own; a language switch keeps the same page and session.

## Required permissions

The page reads two Backend endpoints, so it requires **both** catalog
permissions (`APP/backend/src/constants/permissions.ts`):

| Permission         | Used for                             |
| ------------------ | ------------------------------------ |
| `roles.read`       | `GET /roles` — the matrix columns    |
| `permissions.read` | `GET /permissions` — the matrix rows |

`roles.manage` is required additionally for the create/edit dialogs; without it
no write control is rendered.

Without both, nothing is requested and a "no access" panel is rendered instead.
The navigation entry is hidden by the same rule. This is UX only — the Backend
still enforces every request.

## Backend endpoints

| Endpoint                              | Response                       | Notes                                                   |
| ------------------------------------- | ------------------------------ | ------------------------------------------------------- |
| `GET /roles?page&pageSize` (admin)     | `{ data: Role[], meta }`       | Paginated, `pageSize` capped at 100; all pages fetched   |
| `GET /permissions` (admin)             | `{ data: Permission[] }`       | Full seeded catalog, ordered by `category` then `key`    |
| `POST /roles` (admin)                  | `{ data: Role }`               | Create — `roles.manage`; new role starts with no grants  |
| `PUT /roles/:id` (admin)               | `{ data: Role }`               | Update name/description — `roles.manage`                 |

Both are loaded in parallel (`Promise.all`). A failure in either one surfaces as
one error state — a partial matrix is never rendered.

## Models (frontend DTOs, not Prisma types)

```ts
Role       { id, key, name, description|null, isSystem, permissions: string[], createdAt, updatedAt }
Permission { id, key, category|null, description|null }
```

`createdAt` / `updatedAt` are Dates in the Backend and arrive as ISO strings.

## Architecture

```text
RolesPage → RolesScreen → useRolesPermissions() → roles-permissions.store
          → roles.api / permissions.api → central API client → Fastify

RoleFormDialog → useRoleMutations() → roles-permissions.store → roles.api → …
```

The screen and the matrix never touch the store or the API layer. The store
holds raw Backend entities only (no derived map, no translated text, no JSX);
the derived matrix is built in the hook.

## Matrix

`buildPermissionMatrix(roles, permissions)` (pure, unit-tested) produces the
render model and indexes grants as `roleId → Set<permissionKey>`, so
`hasPermission(roleId, key)` is O(1) and no transformation happens inside the
render loop.

- Semantic `<table>`: `<th scope="col">` per role, `<th scope="row">` per
  permission, `<th scope="colgroup">` per group, plus a screen-reader caption.
- Sticky role header (vertical scroll) and sticky permission column
  (horizontal scroll); scrolling is contained in the matrix card, so the page
  itself never scrolls horizontally.
- A cell shows a gold check (allowed) or a dim dash (not allowed), each with a
  screen-reader label — state never depends on color alone.
- Grant cells are read-only. An editable variant only adds an `onToggle` prop
  on `PermissionCell`; the table, layout and semantics stay unchanged.
- When the Backend returns fewer roles than fit, empty placeholder columns fill
  the leftover width so a role column keeps its own width. They are
  `aria-hidden` and carry no data; the count is measured with a
  `ResizeObserver` against the column widths in the CSS module.

## Grouping, search, filter

- Groups come from the Backend `category`, falling back to the key namespace
  (`vehicles.read` → `vehicles`). No business category is invented.
- Backend ordering is preserved (category, then key).
- Search is local (all data is already loaded) over the technical key and the
  displayed label; it never calls the Backend per keystroke and lives in React
  state, not in Zustand.
- The group filter uses the shared Diamond Select and appears only when there
  are at least four groups.
- Groups with no matching row are dropped — no empty group header.

## i18n

`next-intl`, namespace `Roles`, aligned in `ar.json` and `en.json`. The catalog
is Backend-owned and grows without the frontend, so permission labels are
composed rather than written one by one:

1. per-permission override `Roles.permissions.<key with _ for .>` if present,
2. otherwise the translated action `Roles.actions.<action>` (the row already
   sits under its translated group heading),
3. otherwise the technical key itself (`vehicles.read`).

Step 3 is a deliberate, controlled fallback for a permission the Backend added
before the frontend labelled it — never a raw i18n key on screen. Group labels
fall back to the raw category the same way. Backend errors are translated from
stable error codes (`FORBIDDEN`, `UNAUTHORIZED`, `TOKEN_EXPIRED`, …), never from
the backend message text.

## RTL / LTR

Verified in both `/ar/roles` and `/en/roles`. All page CSS uses logical
properties (`inset-inline-*`, `margin-inline-*`, `border-inline-*`,
`text-align: start`). The only physical values are the two gradient directions,
each with an explicit `[dir="rtl"]` counterpart. Technical keys stay LTR through
`direction: ltr; unicode-bidi: isolate`. No page CSS touches `body`, the
AppShell or the Sidebar.

## Navigation

One entry under the `admin` group in `src/modules/navigation/navigation.config.ts`,
declaring `permissions: ROLES_PAGE_PERMISSIONS`. `useNavigation()` now treats a
declared Backend permission as authoritative over the Demo `adminonly`
heuristic: an item that declares real permissions is permission-driven even
inside an `adminOnly` group. Items that declare none keep the Demo behavior.

## Main files

```text
src/app/[locale]/(protected)/roles/page.tsx
src/modules/roles/
├── api/{roles.api.ts, roles.api.types.ts, permissions.api.ts}
├── stores/roles-permissions.store.ts
├── hooks/{use-roles-permissions.ts, use-permission-labels.ts}
├── components/{roles-screen, permission-matrix, role-header, permission-cell}
├── types/{role.types.ts, permission.types.ts}
├── utils/{permission-matrix.ts, permission-matrix.test.ts}
├── roles.permissions.ts
└── index.ts
src/shared/components/ui/page-header/   (shared, reusable page header)
```

, max 50) from the name and suffixes it
until it is unique among the loaded roles. An Arabic-only name has no Latin
slug, so it falls back to `role`, `role_2`, … — a role's visible identity is its
name. Editing changes name/description only; grants stay Backend-owned.

## Loading, error, empty

- Loading renders a skeleton — never a half-built table, `undefined` or `null`.
- Store `load()` is idempotent and shares one in-flight promise, so React Strict
  Mode does not duplicate requests. `refresh()` re-fetches without a page reload.
- Separate states for "no roles", "empty permission catalog", "no search match",
  "no access" and "request failed" (with retry).

## Development cleanup

Integration tests (`RUN_INTEGRATION=true`) can leave disposable role rows in a
local dev database (keys like `veh_reader_MTR8F2WB`). To reset roles to the
seeded system admin only:

```bash
cd APP/backend && npm run db:cleanup:dev-roles:only-system-admin
```

To remove only obvious integration-test role keys while keeping manually created
dev roles:

```bash
cd APP/backend && npm run db:cleanup:dev-roles
```

Refuses production and non-local `DATABASE_URL`. System roles are never deleted.

## Scope and known limitations

- No delete, clone or user assignment, even though the Backend exposes
  `DELETE /roles/:id`.
- A system role is never editable from the page: the Backend rejects both
  permission changes and deletion for one.
- A user holding `roles.read` but not `permissions.read` is shown the no-access
  panel rather than a matrix derived from role grants only, which would hide
  permissions no role holds.
- The Backend exposes no role ordering field; the Backend list order is used
  as-is.
- Role `name` is a single Backend string, so it is not localized per locale.
- Unit tests cover the pure matrix model (Node test runner, `npm test`). There
  is no React component/E2E test infrastructure in the repository yet, so
  rendering, i18n and RTL were verified manually in both locales.
