# Diamond Rent Car Workspace Instructions

- The project root is `DIAMOND-SYSTEM`.
- All application code lives inside `APP`.
- The approved backend exists only at `APP/backend`.
- The approved frontend exists only at `APP/frontend`.
- Central project documentation lives inside `DOCU`.
- Before implementing any feature, read the documentation related to it in `DOCU`.
- The Demo and its analysis are the source of truth for Diamond's frontend behavior.
- The Fastify backend inside `APP/backend` is the approved backend template; preserve its architecture.
- Do not create a new or independent backend outside `APP/backend`.
- Do not create another frontend outside `APP/frontend`.
- Do not invent features or workflows that are not present in the Demo unless the user explicitly requests them.
- If the Demo conflicts with the documentation, stop and report the conflict instead of guessing.
- Preserve the existing Authentication, Authorization, Roles, and Permissions in the backend template.
- Any new module must follow the architecture that already exists in the backend.
- Do not modify the backend foundation unless there is a clear need and explicit approval.
- Keep backend-specific operational documentation under `APP/backend/docs`.
- Keep documentation shared by the Diamond backend and frontend under `DOCU`.
- Every new Diamond workflow or feature must create or update concise documentation under `DOCU`. Documentation must remain proportional to the feature and no single documentation file may exceed 500 lines. Large topics must be split into smaller linked documents.
- UI must use domain hooks and must not call stores or APIs directly.
- Stores own API-backed domain state, while the API layer owns HTTP calls.
- TypeScript strict mode is required for the frontend.
- Lookup APIs, stores, and hooks remain separate when the Backend permission or API is separate.
- Do not implement behavior outside the Diamond Demo.
- Diamond Demo is the visual source of truth.
- Reusable UI uses shared components, and standard forms use the shared FormBuilder.
- Every dropdown uses the shared Diamond Select (`src/shared/components/ui/select`); a native `<select>` is never used. In forms use `SelectField` or the FormBuilder `select` field type. See `DOCU/00-system-overview/ui-select.md` and the `diamond-select` skill.
- FormBuilder is powered by React Hook Form and Zod and never performs API calls.
- Pages and components use domain hooks rather than calling APIs or Zustand stores directly.
- Roles and permissions always come from the Backend; RBAC data is never hardcoded in the frontend.
- Frontend NextAuth session mirrors `GET /auth/me` for UX guards; permissions re-hydrate on login, token refresh, and session revalidation. Backend DB effective permissions remain the authorization authority.
- Permission matrix rows represent backend permissions and columns represent backend roles.
- Frontend permission visibility is UX only; the Backend remains the authorization authority.
- Dialogs use the shared Dialog (`src/shared/components/ui/dialog`) with FormBuilder inside; overlays are portalled to `<body>`. When a Dialog opens over a Drawer, the Dialog must stack above it (dialog z-index 110 vs drawer 95/96). Dialog Escape uses capture + `stopImmediatePropagation` so it does not close the Drawer.
- Every checkbox uses the shared Diamond Checkbox (`src/shared/components/ui/checkbox`).
- Form values are not duplicated in Zustand; lookup fields use dedicated lookup hooks/APIs when available.
- Page-specific decorative layouts stay inside their feature.
- Reusable card surfaces must use the shared Card component (`src/shared/components/ui/card`).
- Domain cards compose Shared Card instead of recreating generic card CSS.
- Every toggle switch uses the shared Switch (`src/shared/components/ui/switch`); do not recreate switch CSS in feature modules.
- Diamond button hierarchy uses Shared Button (`src/shared/components/ui/button`) variants only: `primary` (dark-gold filled) for the main CTA; `secondary` (ivory/light surface, gold border, gold text/icons) for search, utility, and secondary actions; `secondaryStrong` (stronger champagne/ivory, dark-gold text/icon, clearer border/shadow) for important secondary actions over photos or strong backgrounds. Pages must not add page-specific button CSS when a Shared variant covers the design.
- Users data must come from Backend APIs; never from Demo mock EMP data.
- Current authenticated user comes from Auth infrastructure, not Users Store.
- User forms must use the shared FormBuilder.
- Do not invent User fields that are absent from Backend contracts.
- No documentation file may exceed 500 lines.

## Frontend i18n Rules

- `next-intl` is the single source of truth for all user-facing text.
- No raw translation key may be rendered to the user.
- Navigation config stores namespace-local keys (e.g. `dashboard`), not already-prefixed keys (e.g. `navigation.dashboard`), when `useTranslations("navigation")` is used.
- `useNavigation()` is responsible for translating labels; the Sidebar receives final text.
- Zod schemas must use stable validation message keys, never raw Zod defaults.
- Shared `FormError` translates validation keys through the `validation` namespace.
- Stores must not contain translated UI strings or translator functions.
- Backend errors should be translated from stable error codes, not raw backend messages.
- `ar.json` and `en.json` must remain structurally aligned.

## AppShell / Protected Shell Rules

- All protected Diamond pages must use the shared AppShell (`src/shared/layouts/app-shell`).
- Pages must not recreate the Sidebar or the App Header.
- Navigation definitions must be centralized and typed (`src/modules/navigation`).
- Active navigation state must come from routing, not duplicated Zustand state.
- AppShell Zustand state is UI-only (mobile drawer).
- Authentication and permissions must not be duplicated in AppShell state.
- Diamond Demo is the visual source of truth for AppShell.
- Do not implement page content while working on the Shell unless explicitly requested.

## Vehicles backend (Diamond)

- Extend the existing `vehicles` domain only — never create a duplicate Cars domain.
- Vehicle backend scope must match the Demo Vehicles page only.
- Vehicle default pricing (`dailyRate` / `monthlyRate`) and rental-offer pricing are different concepts.
- Vehicles must not absorb Contract, GPS, or Maintenance workflows.
- Demo mock `CARS` data must never become production backend data.
- Vehicle list APIs should provide card-ready projections without N+1 frontend calls.

## Vehicles frontend (Diamond)

- Vehicles frontend must follow the Diamond Demo exactly and must not grow into generic fleet-management UI.
- Vehicle data must come from Backend APIs, never Demo mock CARS.
- VehicleCard must compose Shared Card.
- Vehicle page/components consume hooks, never stores/APIs directly.
- `currentRental` is a Contracts projection (`PAID` / `ACTIVE` / `RETOUT`). Never fake renter/timer data and never denormalize it onto Vehicle.
- Vehicle page must not implement Contract, GPS, or Maintenance domains.

## Contracts backend (Diamond)

- Contract is the only rental aggregate — do not add a parallel Rental/Client/Car model.
- Canonical status path: AWAITING → FORM → SIGNED → PAID → ACTIVE → RETOUT → REVIEW → CLOSED. No generic status PUT.
- PAID reserves the vehicle; ACTIVE begins only at Car-Out (`operationalStatus = RENTED`).
- Car-In ends vehicle custody: RETOUT → REVIEW and Vehicle RENTED → AVAILABLE. It must never CLOSE the contract.
- CLOSE (staff, REVIEW + Car-In + approved reconciliation) closes the Contract only. It does not release the vehicle and must not overwrite a newer rental or SERVICE.
- Double-booking: `withTransaction` + `acquireAdvisoryLock(tx, "vehicle_rental", vehicleId)` around PAID / ACTIVE / renewal / Car-In.
- Blocking / currentRental statuses: PAID, ACTIVE, RETOUT. REVIEW is financial review after Car-In, not possession and not a blocking vehicle state.
- Contracts never wait for hypothetical future RTA/Salik liabilities. No WAITING_FOR_VIOLATION (or equivalent) Contract status.
- Public customer routes authenticate with hashed ContractLink tokens, not staff JWT. Persist hash only; never log raw tokens or PII.
- Public customer pages (`/[locale]/rental/[token]`) must not use AppShell, staff JWT, or staff navigation. The rental token comes from the route only and must never be persisted (localStorage, sessionStorage, cookies, or persisted Zustand).
- Any new Prisma model requires migrate → generate → runtime verification. Never `prisma migrate reset` against Development.
- Any new staff permission requires PERMISSION_CATALOG → idempotent seed → RolePermission → `/auth/me` verification.
- Public Rental customers cannot override vehicle, amount, duration, or contract number.
- An expired driving license blocks customer form and signing. License expiry is a backend calendar date.
- Do not implement fake OCR or fake payment success. Unconfigured providers must fail closed.
- Demo simulation must remain environment-gated, frontend-only, visibly labeled, non-persistent, and must never create provider/business success in backend.
- Payment success is backend/provider authoritative. A redirect URL is not confirmation.
- PROCESSING/PENDING card attempts block duplicate retry. UNKNOWN provider status stays in-flight.
- Stripe is the only V1 customer payment method. Manual staff confirmation and frontend actions never confirm money.
- Collected/settled state requires trusted Stripe/provider confirmation (webhook primary, status poll fallback).
- Payment amount is always server-derived; clients must not send authoritative amounts.
- Positive approved Reconciliation must be paid before Contract Close. Car-In releases Vehicle regardless of payment.
- Late CLOSED road liabilities collect through Post-Close Receivable, not by reopening the Contract.
- Renewal additional amount applies to the Contract only after payment (zero additional amount may apply without Stripe).
- Diamond V1 has no Deposit.
- After a successful implementation, update the relevant MD under `DOCU` (API detail does not belong in this file).

## Finance (Diamond)

- Finance Collected means trusted confirmed customer collections: Stripe (`CONFIRMED` + `CARD` + `provider = stripe`) and explicit CASH (`CONFIRMED` + `CASH`, `provider = null`). Historical `MANUAL` / `BANK_TRANSFER` rows are preserved and excluded from V1 Collected unless a future workflow explicitly promotes them.
- Rental collection mode (`Contract.collectionMode`: `ELECTRONIC` | `CASH`) is staff-selected at offer creation and backend-authoritative. CASH rentals settle on signature via shared `ContractPayment` settlement; they never call Stripe.
- Road liabilities on cash rental contracts require cash collection (`cashCollectionRequired`); off-session Stripe is blocked. `POST /road-liabilities/:id/collection/cash/confirm` settles through the same `ContractPayment` + ledger foundation as Stripe.
- Outstanding is a current customer obligation balance, not collected revenue. It is not period-filtered away.
- `FinancialLedgerEntry` records recognized movements only; unpaid obligations stay in Open Receivables projections.
- Maintenance `COMPLETED` actual `cost` is a company Expense (`MAINTENANCE_EXPENSE`), never a customer charge.
- Manual Expense exists for operational company spend; Manual Income does not. Corrections use Void + replacement, not hard delete.
- Finance V1 has no Invoices, no Deposit, and no manual customer collection routes.

## GPS Operations (Diamond)

- Never invent GPS/provider data, coordinates, devices, or vendor API contracts.
- GPS provider integrations stay behind `GpsProvider` (`APP/backend/src/modules/gps/`). Vehicles and Contracts must not call a GPS vendor.
- Exact location is staff-permission protected (`gps.read`). No public or customer GPS API.
- Frontend Demo Simulation must never persist fake GPS coordinates to Backend.
- Unconfigured GPS still serves read APIs (`providerConfigured: false`, empty map points) and must not throw `GPS_NOT_CONFIGURED` on ordinary reads.
- GPS inference is never authoritative financial evidence. Predicted road liabilities never enter confirmed financial totals.
- GPS Salik signals on a Contract are derived, informational, and non-blocking. They never create debt or hold Close.
- Never overwrite an authoritative external charge amount (`RoadLiability.amount`).
- A RoadLiability may produce exactly one Customer Charge destination (Reconciliation or Post-Close Receivable), enforced by `RoadLiabilityCustomerCharge.roadLiabilityId` UNIQUE.
- New Salik/traffic-violation reconciliation charges must originate from a confirmed RoadLiability.
- Final customer charge may exceed the official amount only through explicit pre-confirmation charge review (increase + reason). Discounts/waivers are a separate future workflow.
- Road liabilities are attributed by actual Car-Out/Car-In custody windows, not `currentRental` or scheduled rental dates.
- Late authoritative Road Liabilities on CLOSED Contracts create Post-Close Receivables. They must not reopen the Contract or rewrite the old Reconciliation.
- External road liabilities enter through provider/ingestion boundaries, never staff CRUD.

## TARS integration (Diamond)

- TARS integration follows official RTA/TARS capabilities: CREATE_RENTAL, UPDATE_RENTAL, RETURN_RENTAL, SETTLE_RENTAL (legacy operation enum values remain for migration-safe history only). OTP uses `requestContractOtp` / `verifyContractOtp` — never Diamond-generated OTP. CREATE_RENTAL timing vs OTP is unresolved (`TARS_CREATE_RENTAL_CHECKPOINT_PENDING_STAGING_VERIFICATION`).
- Never call TARS directly from a domain service (`contracts.service.ts`, `vehicles.service.ts`, Car-Out, Car-In). Always go through `TarsIntegrationService` → `TarsProvider`.
- Do not invent TARS API endpoints, authentication, configuration or payload field names before official documentation exists.
- No fake TARS success: no invented `externalContractId`, `externalReference` or sync timestamp. An unconfigured provider fails closed with `TARS_NOT_CONFIGURED` and writes no operation row.
- TARS state must never replace or extend the Contract lifecycle. Do not add TARS states to `Contract.status`.
- Contract, Customer and Vehicle remain the Diamond Source of Truth. TARS tables store external references, sync state and operation history only — never business data or Attachment bytes.
- TARS network calls must not run inside a long DB transaction: claim the attempt, call the provider outside the transaction, then persist the outcome.
- The TARS frontend is status display only: no execute/retry/test/sync control, and no customer-facing TARS state. A Diamond action will drive TARS automatically once the official API exists; the employee never gets a second action to remember.
- Update `DOCU/04-api-contracts/tars-integration.md` after any successful TARS implementation work.

## Vehicle creation (Add Vehicle)

- Diamond Add Vehicle uses direct free-text `vehicleName`, not a required VehicleModel lookup.
- New Diamond vehicles always start with operational status **AVAILABLE**.
- Vehicle creation forms must not expose operational-status selection or `modelId`.
- Backend, not the Frontend, enforces the initial AVAILABLE status (`CreateVehicleSchema` omits `operationalStatus`; service sets `AVAILABLE`).
- Add Vehicle must use Shared Button, Shared Dialog, and Shared FormBuilder.
- Creating a vehicle must not create Rental, Contract, GPS, or Maintenance records.

### Vehicle card actions

- VehicleCard visual reference is the latest approved Fleet screenshot.
- VehicleCard edit (pencil) changes default `dailyRate` / `monthlyRate` only — not rental-offer pricing.
- VehicleCard delete maps to `POST /vehicles/:id/deactivate` (fleet soft-remove), not hard delete.
- The approved Vehicles data toolbar pattern (search, status, model, sort, show retired, count, clear) is reusable for other data-heavy pages.
- Data-heavy explicit searches should use the Shared `DataSearch` pattern: draft locally → Search/Enter → server-side applied query (`src/shared/components/data-search/`). Inside an existing `<form>`, pass `embedded` so DataSearch does not render a nested form.
- Date-range/calendar UI must reuse the shared `DateRangePicker` built on React DayPicker v9 (`src/shared/components/ui/date-range-picker`). Do not introduce native date inputs or page-specific calendar implementations when the shared component fits.

## Development Database Bootstrap

Git syncs code, schemas, migrations, and seed scripts — not local PostgreSQL data. Never assume data seeded on one developer's laptop exists on another.

When a backend feature adds Prisma models, migrations, permissions, or required development seed data, update the development bootstrap and relevant MD documentation. A feature is not environment-ready until a clean/local development database can reproduce the required state.

Official command (`APP/backend`): `npm run dev:bootstrap`  
Read-only diagnosis: `npm run dev:check`  
Details: `DOCU/00-system-overview/development-database-bootstrap.md`

The 20 `DEMO-FLEET-*` vehicles are initial seed only, not a fleet maximum. User-created vehicles must never be deleted by bootstrap.

