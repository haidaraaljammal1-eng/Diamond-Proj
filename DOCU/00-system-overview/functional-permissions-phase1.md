# Functional Permissions — Phase 1 Foundation

Phase 1 adds an **inactive** functional RBAC registry and pure policy engine in the
backend. No route guards, database seeds, or UI changes are activated yet.

## Source of truth

| Location | Purpose |
| -------- | ------- |
| `APP/backend/src/lib/rbac/functional-permissions/keys.ts` | Stable `diamond.fn.*` keys |
| `APP/backend/src/lib/rbac/functional-permissions/registry.ts` | Owner-approved definitions |
| `APP/backend/src/lib/rbac/functional-permissions/policy-engine.ts` | Parent/child normalization & checks |
| `APP/backend/tests/unit/functional-permissions.test.ts` | Deterministic unit tests |

Frontend integration (Phase 3+) must import the same keys from a generated manifest
or shared package — **do not duplicate keys by hand**.

## Contract rules

1. **12 pages** — dashboard, vehicles, gps, maintenance, archive, violations,
   finance, invoices, contracts, whatsapp, users, roles.
2. **TYPE A** (single full control): dashboard, gps, archive, whatsapp.
3. **TYPE B** (parent + children): all other pages.
4. Child grant **implies** parent in `normalizeFunctionalGrants`.
5. Revoking parent **removes** all descendants via `removeFunctionalGrant`.
6. Parent-only **never** authorizes child capabilities (`canPerformFunctionalCapability`).
7. `getCapabilityDependencyMetadata().impliedPersistedLegacyKeys` is **always empty**
   in Phase 1 — no auto-persist of `vehicles.manage`, `maintenance.manage`, etc.
8. `system_admin` bypass: `isSystemAdmin: true` on `FunctionalAuthContext`.

## Activation (Phase 2)

| Control | Default | Effect |
| ------- | ------- | ------ |
| `FUNCTIONAL_RBAC_V2_ENABLED` in `APP/backend/.env` | `false` | When `true`, mapped routes use `diamond.fn.*` only (no legacy bypass). |

- Catalog: run idempotent `npm run db:seed` (or `dev:bootstrap`) to upsert **149** keys (117 legacy + **32** functional).
- **Oct 2026 simplification:** `diamond.fn.contracts.operations_closure` replaces delivery/reconcile + collection/closure; `diamond.fn.users.edit` covers role assignment on the Employees edit dialog (`assign_roles` removed). Roles administration stays under `diamond.fn.roles.*` only.
- Role grants: `PUT /admin/roles/:id/functional-grants` with `{ functionalGrants: string[] }` (preserves non-functional keys).
- Frontend matrix still hides `diamond.fn.*` until Phase 3.

## Phase 2.5 (hardening)

- Delegation guard on role/user grant mutations when V2 is enabled.
- Vehicle identity PUT is system-admin-only under V2 (create still allows identity fields).
- Fail-closed for unmapped Diamond staff routes; documented legacy ANY fallback for complaint lookups.
- See `functional-rbac-v2-phase3-contract.md` and integration tests under `tests/integration/functional-rbac-v2.integration.test.ts`.

Phase 3 will enable the flag in deployment config and wire the new matrix UI.
