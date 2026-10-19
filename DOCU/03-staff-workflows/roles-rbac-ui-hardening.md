# Roles RBAC UI hardening (V2)

## Live permission propagation

`SessionPermissionSync` polls NextAuth `update({ diamondPermissionSync: true })` every **1s** (1000ms) while the document is visible (no overlapping calls). The POST body is required so Auth.js runs the JWT callback with `trigger: "update"`; a bare `update()` only GETs the session and does not re-read `/auth/me` while the permission snapshot is still inside the JWT TTL.

On `trigger === "update"`, `auth.ts` calls `GET /auth/me` through `fetchCurrentUserFresh` (no in-process cache). Ordinary JWT ticks still use the coordinated `/auth/me` fetch (5s TTL) for anti-stampede. Local matrix writes still call `requestSessionPermissionSync()` immediately. Remote grant/revoke on another session should reach sidebar, route guards, and Roles matrix within about **1–2s** without reload.

## Matrix delegation precheck

Functional matrix checkboxes use `actorMayDelegateFunctionalGrantToggle`, mirroring Backend `assertActorMayDelegatePermissionKeys` on the **proposed** grant set after parent/child normalization. System admin bypasses the check.

## Concurrency (409)

`toggleFunctionalGrant` on `RESOURCE_MODIFIED` refreshes roles from the Backend and **does not** restore the pre-click optimistic snapshot.

## Open dialog / live capability loss

- Loss of `create_edit` closes the Create/Edit Role dialog.
- Loss of `manage_permissions` removes matrix toggles (read-only).
- Loss of `view_page` shows Roles denied and hides navigation via existing access hooks.
