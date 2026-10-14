# Functional RBAC V2 — Phase 3 Frontend Integration Contract

Backend enforcement is implemented behind `FUNCTIONAL_RBAC_V2_ENABLED` (default **false**).
Phase 3 must not enable V2 in production until this contract is implemented end-to-end.

## Frontend flags (Phase 3)

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_UI` | off | Functional matrix, navigation, route guard, action hooks |
| `NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_BACKEND_ENABLED` | off | Declared mirror for mismatch banner only (not read from API) |

When UI is on and declared backend is off, functional grant editing is disabled and a warning is shown.

## Activation sequence

1. Deploy backend with V2 flag **off**; run idempotent seed so catalog shows **151** keys.
2. Ship Phase 3 UI (matrix, navigation, action guards) against staging with V2 **on**.
3. Verify HTTP integration suite on disposable `haidara_test`.
4. Enable `FUNCTIONAL_RBAC_V2_ENABLED=true` in target environment only after sign-off.

## Reading effective permissions

- Staff JWT + `GET /auth/me` continues to expose flattened `permissions: string[]`.
- Functional keys appear as `diamond.fn.*` alongside legacy keys.
- `system_admin` receives the full catalog server-side; UI treats `isSystemAdmin` as full access.
- After role changes, force session refresh (re-login or existing token refresh path) so `/auth/me` matches DB.

## Saving role grants

| Endpoint | Purpose |
| -------- | ------- |
| `PUT /admin/roles/:id/functional-grants` | Replace **only** functional grants; legacy/hidden keys preserved server-side |
| `PUT /admin/roles/:id/permissions` | Replace **legacy** keys only when V2 on; functional keys **rejected** (400) |

Body for functional grants:

```json
{ "functionalGrants": ["diamond.fn.finance.add_expense", "..."] }
```

Server normalizes: child ⇒ parent auto-included; unknown keys ⇒ 400 validation.

## Parent / child UI rules

- Display tree from `registry.ts` / Phase 3 manifest (do not duplicate keys manually).
- Saving a child must send the child key; server adds parent.
- Revoking parent must send parent removal; server drops descendants (`removeFunctionalGrant` semantics).
- Parent-only must not show child action buttons as enabled.

## Delegation (V2 on)

- Non–system-admin users cannot assign permissions or functional capabilities they do not hold.
- Cannot assign `system_admin` role (403).
- Cannot assign a role whose stored permissions exceed actor delegation (403).
- Role **delete** is system-admin only under V2.

## Sensitive admin-only operations (V2)

- `resetUserPassword` and `deleteRole` require `system_admin` when V2 is enabled (no dedicated functional capability yet for password reset).
- Complaint/PE/template lookups (`lookupUsers`, `lookupPurchaseExperiences`, `lookupCommunicationTemplates`) remain legacy ANY-of until a future capability exists.

## Errors

| Case | Typical response |
| ---- | ---------------- |
| Missing capability | 403 Forbidden |
| Unknown permission key | 400 Validation |
| Functional keys on legacy PUT | 400 Validation |
| System role mutation | 409 Conflict |
| Last admin removal | 409 Conflict |
| Stale role revision (`ifMatchUpdatedAt`) | 409 `RESOURCE_MODIFIED` |

## Navigation & guards

- Sidebar page visibility: `canViewFunctionalPage` per page id (TYPE A root or TYPE B parent).
- Actions: `canPerformFunctionalCapability` per `diamond.fn.*` key (mirror backend `operationId` map).
- Do not use legacy ANY-of in UI when V2 is active for Diamond pages.
- Hide `diamond.fn.*` from legacy matrix until Phase 3 (`roles-display-permissions` filter removed).

## Concurrency

- Role grant updates are transactional (replace role_permission rows in one TX).
- `PUT /roles/:id/functional-grants` accepts optional `ifMatchUpdatedAt` (ISO-8601). Mismatch returns **409** `RESOURCE_MODIFIED`; the matrix refetches and shows a translated error.
- Grant-only writes bump `Role.updatedAt` so revisions advance without metadata edits.

## Session sync (Phase 3.5)

- After a successful functional-grant save, the frontend triggers NextAuth `session.update()` so JWT permissions re-sync from `GET /auth/me`.

## Dashboard / lookups

- `dashboard.full` gates aggregated sections server-side.
- Contextual lookups use functional capabilities (see `route-requirements.ts`); do not grant broad `customers.read` for WhatsApp.
