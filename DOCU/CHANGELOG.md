# Changelog

## 2026-09-08

- Contracts Backend V1: Contract aggregate, explicit lifecycle, hashed public
  links, payment/Car-Out/Car-In/reconciliation/renewal foundations, and real
  `currentRental` on Vehicles. See `DOCU/05-pages/contracts-backend.md`.

## 2026-09-06

- Staff create dialog now requires an initial password and confirmation.
  Password uses the shared `PasswordInput` / FormBuilder `password` field,
  with min-length, letter, number, and match rules. See `DOCU/05-pages/users.md`.

## 2026-09-05

- Added the read-only Roles & Permissions page (`/[locale]/roles`) with a
  Backend-driven permission matrix. See `DOCU/05-pages/roles-permissions.md`.
- Added a shared `PageHeader` UI component and completed the shared Button
  `ghost` variant for inline/toolbar actions.
- Navigation now treats a declared Backend permission as authoritative over the
  Demo `adminonly` heuristic.
- Added frontend unit tests on the Node test runner (`npm test`, no new
  dependency).
- Roles page: permission grants are editable checkboxes with auto-save, plus
  create/edit role dialogs built on a new shared Dialog and Checkbox.
- Restored the glass effect on the shell header and rail: the CSS pipeline was
  dropping `backdrop-filter` written before its `-webkit-` counterpart.

## 2026-09-04

- Created the unified `DIAMOND-SYSTEM` workspace.
- Moved the existing backend project to `APP/backend` without changing its internal structure.
- Added the reserved `APP/frontend` directory.
- Added the central `DOCU` documentation structure.
