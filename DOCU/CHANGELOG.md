# Changelog

## 2026-09-09

- Demo Simulation Mode (frontend-only, `NEXT_PUBLIC_DEMO_SIMULATION_ENABLED`): labeled in-memory overlay for public rental OCR/payment progression and staff TARS status display. Shared local enablement lives in committed `APP/frontend/.env.development` (`npm run dev`); production stays off unless the host sets the flag. No Azure, Stripe, or TARS calls, no database writes, no persisted simulation. See `DOCU/05-pages/public-rental-flow.md` and `DOCU/04-api-contracts/tars-integration.md`.
- Contract renewal flow completion: staff Generate Renewal Link stores a pending
  `ContractRenewal` offer; public `/[locale]/renew/[token]` confirms server-owned
  days/amount on the same ACTIVE Contract; Vehicle stays RENTED. Used tokens can
  reload the success state. Drawer shows compact renewal history. No TARS
  renewal execution and no Stripe step. See `DOCU/05-pages/contracts.md` and
  `DOCU/05-pages/contracts-backend.md`.
- Return / Car-In flow completion: public `/[locale]/return/[token]` page, staff
  `POST /contracts/:id/car-in` (RETOUT → REVIEW, vehicle stays RENTED), Salik /
  Violation reconciliation labels, Dialog stacked above Drawer. Close remains the
  only step that sets Vehicle AVAILABLE. TARS stays status-only. See
  `DOCU/05-pages/contracts.md` and `DOCU/05-pages/contracts-backend.md`.
- Reconciliation dialog opens with empty Salik, Violation, and Other rows plus
  emphasized category chips (manual categories only — no amounts invented, no
  Salik/Violations APIs). Visual e2e covers dialog stacking, TARS Return /
  Completion display, and public return EN/AR/mobile.

- TARS integration status frontend (read-only): a new section in the existing Contract
  Detail Drawer showing the connection state and the five mandatory procedures, plus
  compact indicators in the Car-Out dialog, the Car-In record and the Close dialog. No
  execution or retry controls, no lifecycle change, no customer-facing TARS state; the
  unconfigured provider renders as a neutral "Not Connected", not an error. See
  `DOCU/04-api-contracts/tars-integration.md` and `DOCU/05-pages/contracts.md`.

- TARS mandatory integration foundation (backend only): new `src/modules/integrations/tars`
  module with a five-capability `TarsProvider` abstraction, normalized Diamond-owned DTOs,
  a centralized mapper, `TarsContractIntegration` / `TarsOperation` persistence, and a
  read-only `GET /contracts/:id/tars` projection. No real TARS API, no fake success, no
  lifecycle wiring; execution fails closed with `TARS_NOT_CONFIGURED`. See
  `DOCU/04-api-contracts/tars-integration.md` and `DOCU/05-pages/contracts-backend.md`.

- Customer Public Rental Flow V2 frontend: `/[locale]/rental/[token]` three-step journey (license, official contract, payment) driven by Backend `flow.step`, with no AppShell, no fake OCR, and no fake payment. See `DOCU/05-pages/public-rental-flow.md` and `DOCU/05-pages/contracts.md`.
- Public Rental Flow V2 backend: token-scoped license upload, OCR/payment provider boundaries (no fake success), multi-request Rental links, and ContractPayment electronic attempts. See `DOCU/05-pages/public-rental-flow.md` and `DOCU/05-pages/contracts-backend.md`.
- NextAuth now re-hydrates effective permissions from `GET /auth/me` on access-token refresh and session revalidation, so new domain permissions (for example `contracts.read`) apply without a manual re-login. Backend authorization is unchanged. See `DOCU/05-pages/authentication.md`.

## 2026-09-08

- Contracts date filters upgraded to shared React DayPicker-based
  `DateRangePicker` (explicit Apply/Clear, quick presets, two-month desktop).
  See `DOCU/05-pages/contracts.md` and `DOCU/00-system-overview/ui-date-range-picker.md`.
- DateRangePicker calendar grid fix: outside-day cells no longer collapse;
  weekday alignment preserved; outer-edge Previous/Next navigation.
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
