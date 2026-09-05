# Changelog

## 2026-09-04

- Created the unified `DIAMOND-SYSTEM` workspace.
- Moved the existing backend project to `APP/backend` without changing its internal structure.
- Added the reserved `APP/frontend` directory.
- Added the central `DOCU` documentation structure.

## 2026-09-05

- Added the read-only Roles & Permissions page (`/[locale]/roles`) with a
  Backend-driven permission matrix. See `DOCU/05-pages/roles-permissions.md`.
- Added a shared `PageHeader` UI component and completed the shared Button
  `ghost` variant for inline/toolbar actions.
- Navigation now treats a declared Backend permission as authoritative over the
  Demo `adminonly` heuristic.
- Added frontend unit tests on the Node test runner (`npm test`, no new
  dependency).
