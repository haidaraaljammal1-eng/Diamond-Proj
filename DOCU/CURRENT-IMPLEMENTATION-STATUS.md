# Current implementation status

Updated 2026-09-22.

Diamond has two separate development simulation categories. Rental provider substitutions are Driver License OCR, Passport OCR, and successful payment; they require a real Rental Link and update the real Contract. Browser-only UI demos are Dashboard, WhatsApp, and Road Liabilities; they use local fixtures and never write Contracts, Vehicles, Payments, or any backend data. The former general rental journey simulation remains disabled. Contract Review, legal signatures, lifecycle, PAID reservation, and Car-Out use the normal persisted workflow.

## Development provider mode

The backend requires `NODE_ENV !== production` and `DIAMOND_SIMULATION_ENABLED=true`; the frontend additionally requires `NEXT_PUBLIC_DIAMOND_SIMULATION=true` to show the three actions. The frontend flag never authorizes a mutation. Invalid or expired Rental Links remain blocked. OCR returns normalized identity through the existing Contract flow and does not mutate Customer.

DEV payment mode skips the external Stripe Card Setup requirement before signing. It does not create a fake card, Stripe Customer, PaymentMethod, Checkout Session, or provider id. A real legal signature is still required. The DEV payment action derives the amount server-side, records a `dev_simulation` payment source, uses the shared settlement transition, and persists `SIGNED -> PAID` idempotently. Payment does not perform Car-Out.

When DEV payment mode is off, Stripe Hosted Checkout pays the rental in one trip (**STRIPE-4 foundation**). Customer identity is resolved before payment (`Customer` → `CustomerPaymentProfile` → optional `CustomerPaymentMethod` + `ContractPaymentAuthorization`). Optional future-use authorization is consent-based (`savePaymentMethodForFutureUse` + backend consent version); Checkout sets `setup_future_usage=off_session` only when consented. One Stripe Customer per Diamond Customer per TEST/LIVE profile. Webhooks ACK fast into `StripeWebhookEvent` and settle via the background worker. Callback polling is DB-first. Legacy card-link routes are gated off by default (`LEGACY_CARD_LINK_ENABLED=false`). Off-session Road Liability charging is **not** implemented. Stripe Test Mode needs `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` (Stripe CLI `whsec_...` locally). See `DOCU/05-pages/stripe4-payment-foundation.md`, `DOCU/04-api-contracts/stripe-test-mode-setup.md`, and `DOCU/05-pages/public-rental-flow.md`.

## Review and signing

The customer reviews the real Official Contract and confirms it through `POST /contracts/rental/:token/official-contract/review/submit`. This persists `AWAITING -> FORM` even when no personal field changes. Manual signing requires persisted `FORM` and writes `FORM -> SIGNED`, ContractAcceptance, signature Attachments, and the frozen legal snapshot. Existing FORM Contracts continue to sign normally.

## Browser-only UI demos

`NEXT_PUBLIC_DEMO_SIMULATION_ENABLED=true` enables only the scoped Dashboard, WhatsApp, and Road Liabilities controls in development. Their fixtures stay in browser memory; their real APIs and stores remain the source of truth outside demo mode. This flag is independent of `NEXT_PUBLIC_DIAMOND_SIMULATION` and cannot authorize rental provider routes.

Legacy Finance and GPS fixture code remains in the frontend, but the general demo gate keeps those controls disabled. Their documentation describes retained historical overlays, not currently active local actions.

The header Notification Center is another scoped browser-only UI demo. It uses
the shared Popover and in-memory Zustand state. Notifications are registered
only from real records already loaded by Contracts, Vehicles, Dashboard, or
Violations; each item navigates with a `focus` query and the destination page
temporarily highlights the matching record. It never writes to Backend or DB.

## PAID and handover

A PAID Contract reserves its assigned Vehicle: operational status stays `AVAILABLE`, while `isReserved=true` and `isBookable=false`. Staff opens Car-Out from that same Contract. Completion requires mileage, fuel, a real OUT signature, and eight photos: six exterior views (FRONT, REAR, FRONT_RIGHT, REAR_RIGHT, FRONT_LEFT, REAR_LEFT), one ODOMETER, and one DASHBOARD_FUEL. Damage is recorded in the OUT draft. Completion atomically changes `PAID -> ACTIVE` and Vehicle `AVAILABLE -> RENTED`; the evidence becomes immutable.

## Multi-company (UNIQUE / ELITE) — end to end

The database now models two operating companies. `OperatingCompany` holds `code`
(UNIQUE / ELITE), display and legal Arabic/English names, an accent colour and
`isActive`. `Vehicle.companyId` is required, and `Contract.companyId` is required and
historical: it records the company that owned the Vehicle when the Contract was created
and is never recomputed from the Vehicle later. Both foreign keys are `RESTRICT`.
Migration `20260920012059_multi_company_foundation` inserted both companies, backfilled
all 32 existing Vehicles to UNIQUE and all 17 existing Contracts from their Vehicle, and
then made both columns NOT NULL. Contract numbering stays global (`DE-{year}-{sequence}`).

The backend is now company-aware end to end: `GET /operating-companies`, required company on vehicle creation, a **write-once** vehicle company that no update path can change (422 `immutable_field`), `company` on Vehicle and Contract DTOs, `?companyId=` filters on both lists, contract company derived from the Vehicle and frozen in the official-contract snapshot, the renting company on the public rental context, and TARS provider resolution keyed by `Contract.companyId` (both companies still unconfigured). `externalId` is unique per company; plate and VIN stay globally unique.

The frontend now loads active companies through a dedicated API/store/hook chain.
Add Vehicle requires a company with no default. Fleet and Contracts show compact
accent-aware company identity and filter server-side by company id; Contract UI
always reads historical `Contract.company`. The existing rate-only vehicle editor
shows Company read-only, which matches the final rule: the operating company is
selected once at Add Vehicle and is immutable afterwards — Diamond has no vehicle
company transfer workflow on either side of the stack.

The public rental UI displays the Contract company. The Official Contract keeps
the approved black A4 header, dimensions, logo, contact block and legal body; only
the Arabic/English legal-name lines come from the authoritative official view, so
ELITE changes يونيك / UNIQUE to إيليت / ELITE. Car-Out and Car-In add historical
Contract company to their context headers without changing either workflow.
Placeholder accents remain `#C9A15C` and `#3E5C76`, sourced from backend data.
TARS provider routing remains company-aware and unconfigured for both companies.
Future invoices and statements must reuse the same authoritative company identity.

### RBAC Phase A — system admin full access

The `system_admin` role (`Role.isSystem = true`) is the Diamond owner/manager account.
It has **full access by definition**: central backend `hasPermission` / `hasAnyPermission`
and frontend `usePermissions` treat system admins as authorized for every catalog
permission, including permissions added later. `/auth/me` expands the permission list to
the full catalog for UX. Employee roles remain explicitly permission-controlled.
Authentication is still required. See `DOCU/00-system-overview/system-admin-full-access.md`.

### TARS Phase T1 — dual-provider foundation + OTP UI

UNIQUE and ELITE TARS are **fully isolated** integrations: separate `TARS_UNIQUE_*` /
`TARS_ELITE_*` configuration namespaces, separate `createTarsProvider(companyCode)`
instances, and **no cross-company fallback**. Routing is always from frozen
`Contract.companyId`.

`TarsWorkflowOrchestrator` centralizes integration and OTP calls. Official
capabilities (`CREATE_RENTAL`, `UPDATE_RENTAL`, `RETURN_RENTAL`, `SETTLE_RENTAL`)
plus uncertain boundaries (OTP, vehicle identity, upload, handover/return evidence,
driver-license inquiry, digital acceptance) are prepared on `TarsProvider` and fail
closed through `TarsUnconfiguredProvider` until live mapping exists. Optional TARS
catalog APIs (Salik, fines, maintenance, borrowing, reservation) are excluded.

Public rental now includes a **Verify identity** OTP panel before signature when the
provider is configured and OTP is required. Diamond OTP UI states are internal
(`NOT_STARTED`, `REQUESTING`, `CODE_SENT`, `VERIFYING`, `VERIFIED`, `FAILED`,
`EXPIRED`, `RATE_LIMITED`, `UNAVAILABLE`); `otpLength`, `expiresAt`,
`resendAvailableAt` and `attemptsRemaining` are backend-driven when available. OTP
plaintext is never stored or logged. The browser calls Diamond public routes only
(`POST /contracts/rental/:token/tars-otp/request|verify`). CREATE_RENTAL vs OTP
order remains provider-mappable (`TARS_CREATE_RENTAL_CHECKPOINT_PENDING_STAGING_VERIFICATION`).

Migration `20260922050000_tars_otp_metadata` adds safe OTP challenge metadata
(`resendAvailableAt`, `otpLength`, `maxAttempts`). Staff TARS status shows
`TARS · UNIQUE` / `TARS · ELITE` with nine operation keys (four official + five legacy).
See `DOCU/04-api-contracts/tars-integration.md` and `tars-api-scope-matrix.md`.

### Phase A rollout — TARS UI, Vehicle pickers, Maintenance, GPS

Company visibility now reaches the first operational modules, with **no database
change** (no Prisma edit, no migration, no new `companyId` column, no Finance
schema change). The full domain-by-domain map, including what is still missing
and which phase owns it, lives in
`DOCU/00-system-overview/operating-company-rollout-audit.md`.

Maintenance and GPS **derive** company from the Vehicle rather than storing one,
which is safe because `Vehicle.companyId` is write-once. `MaintenanceOrder` has
no company column; `VehicleGpsBinding` and `VehicleGpsLatestState` hold none.
Maintenance list/detail embed the company on the existing Vehicle projection and
`GET /maintenance?companyId=` filters through the Vehicle relation, composing
with status, search, type, vehicle, sort and paging; the maintenance lifecycle,
cost rules and AVAILABLE/SERVICE transitions are unchanged. GPS exposes company on
`GpsVehicleSummary` and `GpsMapPoint`, `GET /gps/vehicles?companyId=` filters
`Vehicle.companyId`, and no company reaches a provider — the `GpsProvider`
boundary carries only `name` and `configured`. The map stays unfiltered and free
of company chrome, matching the existing search and tracking filters.

Both Vehicle pickers (Maintenance, Finance) show the company per option, keep it
in the selected-vehicle summary, and filter through the existing
`GET /vehicles?companyId=` query.

TARS now displays its routing company: `TARS · UNIQUE` / `TARS · ELITE`, read
from `tars.company` (`Contract.companyId`), never from the Vehicle. **UNIQUE TARS
and ELITE TARS remain two separate integrations** — separate provider,
configuration, credentials and API — and both are still unconfigured and fail
closed with `TARS_NOT_CONFIGURED`. No TARS endpoint, credential or payload shape
was invented, and no execute/retry/test control was added.

Finance gained its company columns in **Phase C1** (below). Invoices, daily
statements and company-scoped RBAC come later.

Verified on 2026-09-20 in the browser against real UNIQUE and ELITE data:
maintenance cards, detail and All/UNIQUE/ELITE filter with Clear Filters resetting
to All Companies; both Vehicle pickers before and after selection; the GPS fleet
list, detail drawer and company filter; and the TARS section on both a UNIQUE and
an ELITE contract. Arabic RTL and English LTR at 1440px and 390px, no horizontal
overflow.

### Phase B rollout — road liabilities / Salik, single Vehicle creation source, dashboard rows

Again **no database change** (no Prisma edit, no migration, no new `companyId`
column, nothing in Finance).

**Fleet → Add Vehicle is now the only Vehicle creation source in Diamond.**
`POST /vehicles` is the one place the operating company is chosen, and the choice
is permanent, so every other creation path was a way into the wrong fleet. The
sales import is now **match-only**: it resolves an existing Vehicle by
`externalId` or global `vin`, and a row that matches nothing is `INVALID` with
reason `vehicle_not_found` and guidance to add the vehicle from the Vehicles page
first — `executeRow` writes no Vehicle. Purchase experiences require an existing
`vehicleId` and refuse their old inline `vehicle` block with 422. With no caller
left, `resolveDefaultOperatingCompanyId` is deleted. Imports deliberately gained
**no Company selector**, a matched ELITE vehicle stays ELITE, and an `externalId`
held by two companies matches nothing rather than guessing one.

**Road liabilities and Salik derive company by a three-way precedence** that lives
only in the Backend: the attributed `Contract.company` always wins, the Vehicle
answers only when there is no Contract, and a liability with neither stays
`company: null`. No guess, no UNIQUE fallback, no `UNMATCHED` company row, and no
company inferred from a provider, account or endpoint.
`GET /road-liabilities?companyId=` filters contract-first to match, and All
Companies keeps unmatched rows visible. `RoadLiabilityCustomerCharge` and
`ContractPostCloseReceivable` gained no company column. The UI shows
`CompanyIdentity` in the row, card and drawer, and a neutral "No company" /
"بدون شركة" label for unmatched.

**The dashboard rows from Phase B now sit under a page scope (Phase C2).**
All Companies is the default. UNIQUE and ELITE filter fleet by
`Vehicle.companyId` and contract figures by `Contract.companyId`. Weekly finance
for All Companies still includes GENERAL. GENERAL is not a dashboard option.

Verified on 2026-09-21 in the browser against real UNIQUE and ELITE data: all
five liability cases (contract-UNIQUE, contract-ELITE, vehicle-only UNIQUE,
vehicle-only ELITE, fully unmatched), the Company filter returning 5 / 2 / 2 for
All / ELITE / UNIQUE with the crossed row following its Contract, the detail
drawer on both a matched and an unmatched liability, and the dashboard showing
ELITE on DE-2026-000018 beside UNIQUE rows with KPIs untouched. Arabic RTL and
English LTR at 1440px and 390px. The verification liabilities were removed
afterwards and the two temporarily shifted contract start dates restored exactly.

### Phase C1 — Finance database + backend

The first Finance database change since `finance_v1`, and the first phase since
the foundation to touch Prisma. Migration
`20260921090000_finance_company_classification` adds **nullable**
`ManualExpense.companyId` and `FinancialLedgerEntry.companyId`. **No frontend
change, no Invoice, no daily statement, no third operating company.**

**GENERAL is `companyId IS NULL`, not a company.** A financial record with no
authoritative company-bearing source behind it — office rent booked without a
Vehicle — is GENERAL. The DTO returns `company: null`; it never returns a
synthetic `{ code: "GENERAL" }` object, and the frontend never infers a company
from the row's Vehicle.

**Manual Expense gets no company selector.** The company is derived from the
optional Vehicle and owned by the Backend: a Vehicle makes it that Vehicle's
company, no Vehicle makes it GENERAL, changing the Vehicle re-derives it, and
removing the Vehicle makes it GENERAL again. The create/correct schemas carry no
`companyId`, so a client-sent one is stripped — a request claiming *Vehicle =
ELITE, companyId = UNIQUE* stores ELITE. The Vehicle picker's company filter stays
search UX and never classifies the expense.

**The ledger persists its company at write time**, from each writer's own
authoritative source: contract payments from the frozen `Contract.companyId`
(never the Vehicle's current company), maintenance from
`MaintenanceOrder → Vehicle`, the three Manual Expense writers from the expense
itself. All five funnel through one `insertLedgerEntry`, which now requires
`companyId` explicitly. **Nothing falls back to UNIQUE** — unresolvable stays
null.

**Scope on every Finance read:** nothing = ALL (UNIQUE + ELITE + GENERAL),
`?companyId=` = that company, `?companyScope=GENERAL` = null only; the two
together are 422 `FINANCE_COMPANY_SCOPE_CONFLICT`. ALL adds no predicate, because
`companyId IS NOT NULL` would silently hide GENERAL. Receivables derive through
`Contract.company` with no column added, so GENERAL correctly has none.

Backfill was relation-only (Contract → Manual Expense → Maintenance → Vehicle →
null), with migration guards that abort on a mismatch or an unexpected company.
`diamond`: 10 manual expenses, all vehicle-less and therefore GENERAL, and 12
ledger rows, all GENERAL. `haidara_test`: 173 ledger rows — 165 from their
Contract, 8 from maintenance, 0 unresolved. Zero mismatches on both.
`npm run verify:finance-company` reproduces this evidence on demand.

Verified: `finance-company` integration 24/24, `finance-company-scope` unit 5/5,
backend typecheck, build, touched lint and `git diff --check` all clean.

### Phase C2 — Finance page and Dashboard scope

No Prisma change and no new migration. Finance gained a page scope of All /
UNIQUE / ELITE / GENERAL. ALL includes GENERAL. The Manual Expense dialog still
has no Company field; `company: null` renders as عام / GENERAL without
`CompanyIdentity`. The dashboard scope is All Companies / UNIQUE / ELITE only.
`companyScope=GENERAL` on the overview is 422. Weekly finance for All Companies
includes GENERAL ledger rows. Invoices and daily statements were not built.

The current operational pages — Fleet, Contracts, Official Contract, Public
Rental, Car-Out, Car-In, Maintenance, GPS, Violations / Salik, Imports, Finance
and Dashboard — now carry UNIQUE / ELITE. GENERAL exists only in Finance.

## RETOUT and Car-In

Car-In is a staged workflow with the same shape as Car-Out. A RETOUT Contract offers **Receive vehicle**; the dialog saves a server-side draft (mileage IN, fuel IN, damage IN, notes, hirer IN signature) and the eight required photos plus three optional ones, all resumable after closing and reopening. Nothing is prefilled from Car-Out. Complete is enabled only by the Backend `canComplete`, and it atomically moves `RETOUT -> REVIEW` with Vehicle `RENTED -> AVAILABLE`. Car-In does not close the Contract, and there is no OUT versus IN comparison yet.

## Local verification

Start both applications with the DEV flags, log in normally, generate a real Rental Link from an AVAILABLE Vehicle, then use the three provider actions around manual review and signature. Verify the same PAID Contract in staff Contracts and complete Car-Out with real evidence on disposable data. Disable DEV payment simulation to restore normal Stripe Card Setup. No session reset can roll back persisted Contract or payment state.

On 2026-09-20, a browser session on a real RETOUT Contract verified the staged Car-In end to end: draft save, close and reopen with mileage, fuel, damage, notes and signature restored, the eight required photos with one replaced and one deleted and re-uploaded, an optional photo, the confirmation dialog, and Complete. The Contract moved to REVIEW and the Vehicle to AVAILABLE in the database, and the Contracts list showed the new status without a manual browser refresh. Verified in Arabic RTL and English LTR at 1440px and 390px. Note for repeat runs: the development backend allows 100 requests a minute, which an automated run driving the whole flow at machine speed can exceed; staff pace does not.

On 2026-09-19, a browser session using the configured local system-admin account and a new disposable vehicle/Contract verified DEV OCR actions, persisted FORM, manual SIGNED, and DEV payment to PAID. The same agreement appeared on Contracts; the Vehicle remained AVAILABLE, reserved, and non-bookable with `canCarOut=true`. This did not use a manager-role account or complete Car-Out. No lifecycle state was inferred from a browser redirect alone.
