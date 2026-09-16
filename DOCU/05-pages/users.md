# Users / Staff Page

Staff accounts as a responsive card grid (Demo `.team` / `.emp`), backed by the
real Backend user APIs. No Demo `EMP` mock data is used.

## Route

| Locale | URL         |
| ------ | ----------- |
| ar     | `/ar/team`  |
| en     | `/en/team`  |

Navigation key: `team` (Demo label: Staff / الموظفون).

## Required permissions

| Permission      | Used for                                      |
| --------------- | --------------------------------------------- |
| `users.read`    | `GET /users` — page access and list           |
| `users.create`  | `POST /users` — “New employee” dialog         |
| `users.update`  | `PATCH /users/:id/status` — card status switch |
| `roles.read`    | `GET /lookups/roles` — role picker (accepted any-of with `users.create` / `users.update`) |

Frontend visibility is UX only; the Backend enforces every request.

## Backend endpoints

| Endpoint                    | Notes                                      |
| --------------------------- | ------------------------------------------ |
| `GET /users`                | Paginated list; `search`, `status`, `sort` |
| `POST /users`               | Create with initial password (`password` + `confirmPassword`) |
| `PUT /users/:id`                | Update name/email — `users.update`            |
| `PUT /users/:id/roles`          | Replace roles — `users.update`                |
| `DELETE /users/:id`             | Delete user — `users.delete`                  |
| `PATCH /users/:id/status`       | `ACTIVE` \| `SUSPENDED` only                  |
| `GET /lookups/roles`            | Role picker options (id + label + key), capped at 50 |

Card actions (permission-gated UX):

- **Edit** → `users.update` — Dialog + FormBuilder (`PUT /users/:id`, optional `PUT /users/:id/roles`)
- **Delete** → `users.delete` — confirmation Dialog (`DELETE /users/:id`)

## User fields shown

From `UserPublic` response:

- `name` (fallback: `email`)
- `email` (subtitle — replaces Demo phone)
- `roles[]` (badges)
- `status` (`PENDING` \| `ACTIVE` \| `SUSPENDED`)
- `lastSeenAt` (locale-formatted; never mock times)

## Status mapping

| Backend   | UI key            | Badge variant |
| --------- | ----------------- | ------------- |
| `ACTIVE`  | `statusActive`    | success       |
| `PENDING` | `statusPending`   | warning       |
| `SUSPENDED` | `statusSuspended` | danger      |

Toggle switch (Demo `.switch`) only for `ACTIVE`/`SUSPENDED` when the session
holds `users.update`. `PENDING` shows a badge only.

## Architecture

```text
TeamPage → UsersScreen → useUsers() → users.store → users.api → API client
UserFormDialog → useUserMutations() → users.store → users.api
Role picker → useRoleLookup() → role-lookup.api → GET /lookups/roles
UserCard → Shared Card + Avatar + Badge + Switch (shared)
```

## Shared Card

`src/shared/components/ui/card` — generic surface (padding, interactive hover,
optional header/footer). `UserCard` composes it; it does not redefine card
border/shadow CSS.

Status toggles use the shared `Switch` (`src/shared/components/ui/switch`) with
the primary gold ON palette.

## FormBuilder

Create-user dialog: `email`, optional `name`, required `password` +
`confirmPassword`, optional `roleId` (when the session may use the role
lookup). Password uses the
shared `PasswordInput` via FormBuilder field type `password`. Frontend rules:
min 8 characters, at least one letter, at least one number, confirmation match.
The Backend hashes the password (argon2id) and creates the account `ACTIVE`.
No phone field. Edit dialog does not change the password.

## Development cleanup

Integration tests (`RUN_INTEGRATION=true`) can leave disposable staff rows in a
local dev database (emails like `veh-admin-*@example.test`). To reset the staff
list to the seeded admin only:

```bash
cd APP/backend && npm run db:cleanup:dev-users
```

Keeps `DEV_ADMIN_EMAIL`; removes `@example.test`, `@ex.test`, and known test-prefix
emails only. To reset staff to **only** the seeded admin (remove every other
account, including manually created dev rows):

```bash
cd APP/backend && npm run db:cleanup:dev-users:only-admin
```

## Demo vs Backend gaps

| Demo              | Backend / page behaviour                          |
| ----------------- | ------------------------------------------------- |
| Phone on card     | Not in User model — show `email` instead          |
| Contract stats    | Not in Users API — omitted (not faked as zero)    |
| Mock last times   | `lastSeenAt` from API, formatted per locale       |
| WhatsApp wording  | Create sets an initial password; account is ACTIVE |
| Owner excluded    | All users returned by API are shown               |

## Main files

- `src/app/[locale]/(protected)/team/page.tsx`
- `src/modules/users/` (api, store, hooks, components, forms)
- `src/shared/components/ui/card/`
- `src/shared/components/ui/password-input/`
- `src/shared/components/ui/avatar/`
- `src/shared/components/ui/badge/`
- `messages/en.json` / `messages/ar.json` → `Users` namespace
