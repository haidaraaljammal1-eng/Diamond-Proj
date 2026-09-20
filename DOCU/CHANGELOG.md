# Changelog

## 2026-09-20

- Standardized automatic frontend data refresh after successful record actions. Contracts (including Car-Out drafts/evidence), Vehicles, Users, Roles, Maintenance, Finance, and Road Liabilities now wait out any older in-flight read and then fetch a new backend-authoritative snapshot, so row/card actions no longer require a browser refresh. Maintenance also refreshes Fleet vehicle projections, and role changes refresh the user-form role lookup. See `DOCU/00-system-overview/frontend-architecture.md`.

## 2026-09-19

- Closed the renewal/return race: `applyRenewal` now re-checks the Contract under the `contract_lifecycle` lock and never extends a Contract that is no longer ACTIVE. A renewal payment captured after the return was confirmed stays CONFIRMED but is not applied, and `contract.renewal_not_applied` tells staff to settle it. Repaired the integration harness for the current lifecycle (card linking before rental payment, Car-Out angles and OUT signature). Return/renewal integration is green; the in-flight payment case is verified by integration only, because dev has no card provider. See `DOCU/05-pages/contracts-backend.md`.

- Fixed the return lifecycle: generating a Return Link no longer moves a Contract to RETOUT. The Contract stays ACTIVE with the vehicle RENTED, and Renew stays available. The hirer confirms the return on the public return page (new `POST /contracts/return/:token/confirm`, ACTIVE → RETOUT), and staff at the desk use the same link. Renewal and return confirmation are serialised on a `contract_lifecycle` lock. Contract list items now carry `actions.canCarIn`, and each row's primary action comes from one policy: ACTIVE opens the contract (Renew and return link), RETOUT offers Receive vehicle. See `DOCU/05-pages/contracts.md` and `DOCU/05-pages/contracts-backend.md`.

- Reworked the Contracts table action column. The next step is a `secondaryStrong` button with a glyph per step (rental link, Car-Out, return link, reconciliation) at one fixed width; View contract is a 40×40 icon button in a fixed last slot. The column sizes to its content and, below 880px of table width, the next step collapses to its glyph, so nothing is clipped and there is no horizontal scroll at 900 to 1600px in either direction. Plates now align under the vehicle name, a missing customer shows a muted "—", Arabic day counts use proper plurals (also in the detail drawer), and the table's hardcoded gold literals now use `--diamond-gold`. See `DOCU/05-pages/contracts.md`.

- Added **View contract** to every Contracts table row from SIGNED onward. It opens `/[locale]/contracts/[id]/contract`, the read-only A4 contract with everything recorded after signing: Car-Out mileage, fuel, damage marks and the hirer OUT signature, plus Car-In mileage and fuel. This is frontend only (`liveContractView`) and the frozen signed snapshot is untouched. See `DOCU/05-pages/contracts.md`.

- Reworked the Car-Out dialog header only (steps, photo grid and footer unchanged). The title is monolingual without an em dash; vehicle name and a plate block lead, contract and hirer follow, and contract, payment and vehicle states sit on one line of shared `Chip`s with the TARS handover row. Plate code merges into the plate instead of an empty field, and a PAID contract shows the vehicle as Reserved instead of "Available · Reserved". `Contracts.tars.inline.*` in Arabic now use `·` instead of an em dash, which also changes Car-In, Close and the detail drawer. See `DOCU/05-pages/contracts.md`.

- Documented `DIAMOND_SIMULATION_ENABLED=true` in `APP/backend/.env.example`; without it fresh setups hid the DEV License OCR, Passport OCR, and Payment actions. All related env lines are tagged `TEMP-DEV-SIMULATION` for one-search removal. See `DOCU/05-pages/public-rental-flow.md`.

- Added the frontend-only header Notification Center targeting real loaded
  Contract, Vehicle, and Road Liability records. The bell now stays in the
  left header action cluster; notification actions navigate with `focus` and
  destination records receive a temporary reduced-motion-aware highlight.
  Synthetic or unregistered records are not shown. See
  `DOCU/05-pages/notifications.md`.

- Separated real development rental provider substitutions (License OCR, Passport OCR, successful Payment) from browser-only Dashboard, WhatsApp, and Road Liabilities demos. Restored scoped UI demo controls without re-enabling the old rental journey, set local frontend provider and auth URL flags for port 3100, and persisted Official Contract review as FORM before manual signing to SIGNED. Corrected Car-Out photo documentation to six exterior, odometer, and dashboard/fuel images. See `DOCU/CURRENT-IMPLEMENTATION-STATUS.md` and `DOCU/05-pages/public-rental-flow.md`.

## 2026-09-18

- Made the contract-scoped Car-Out dialog nearly viewport-wide, removed nested scrolling in its signed-contract preview, and added a protected full-size A4 signed-contract page. Improved visibility of Step 1 save errors and multipart upload retry after token refresh. The legal document remains read-only and Car-Out remains the same draft workflow. See `DOCU/05-pages/contracts.md`.

- Expanded the existing contract-scoped Car-Out dialog to a 2XL two-step handover. It displays the frozen signed A4 contract read-only, saves Vehicle OUT details and signature before the separate photo step, and restores saved drafts and evidence on reopen. The eight required photos now include six vehicle views plus odometer and fuel; completion still alone activates the Contract and rents the Vehicle. See `DOCU/05-pages/contracts.md` and `DOCU/05-pages/contracts-backend.md`.

- Replaced the general rental Simulation journey with three development-only external-provider substitutes: Driver License OCR, Passport OCR, and successful Payment on a real Rental Link. Review, signatures, reservation, Contracts, and Car-Out stay real. DEV payment skips Stripe Card Setup without persisting a fake card and settles through the shared payment service. Production registers no DEV routes. See `DOCU/05-pages/public-rental-flow.md` and `DOCU/05-pages/payments-backend.md`.
- Reproduced and fixed the login blank-page incident by restarting the frontend server after its `.next` build; stale asset requests had been returning HTTP 500. See `DOCU/05-pages/login.md`.

## 2026-09-14

- WhatsApp operational provider migrated from Meta Cloud API to UltraMsg (env-provided instance id) without rebuilding Inbox. Additive Prisma fields, capability-driven UI, QR connection management, isolated UltraMsg webhook (callback-key compensating control, not HMAC), ACK mapping, no 24h/template gating, no provider queue-while-offline sends. Meta implementation retained inactive. Live webhook/send gated on public URL + explicit env. Token never documented. See `DOCU/05-pages/whatsapp-backend.md` and `DOCU/05-pages/whatsapp.md`.

## 2026-09-13

- WhatsApp final completion: approved templates, authenticated media proxy + outbound image/document/audio/video, Embedded Signup / webhook activate in Inbox Manage WhatsApp, optional explicit Customer match/link (`whatsapp.link_customer`). Manual office communication only. On-demand media proxy (no Attachment archive). Live Meta verification still deferred. See `DOCU/05-pages/whatsapp-backend.md` and `DOCU/05-pages/whatsapp.md`.

## 2026-09-12

- WhatsApp Phase 6: authenticated SSE Inbox notifications (`GET /whatsapp/realtime`, `whatsapp.read`). SSE is not the source of truth; DB/REST remain authoritative. JWT stays in `Authorization` (never the query string). Events are ids-only, published after commit via `DomainOutboxEvent` + in-process hub, with a 15-minute replay window and REST reconciliation. No polling. Simulation stays frontend-only. Live Meta not required. See `DOCU/05-pages/whatsapp-backend.md` and `DOCU/05-pages/whatsapp.md`.
- WhatsApp Phase 5: manual staff TEXT send (`POST /whatsapp/conversations/:id/messages`, `whatsapp.send`). Recipient is derived server-side. 24-hour customer service window is enforced from `lastInboundAt`. Idempotent (`Idempotency-Key`); no automatic Meta POST retry. Provider HTTP accept is `ACCEPTED`, not `SENT`. Webhook owns SENT/DELIVERED/READ/FAILED. Ambiguous send is `UNKNOWN` with no auto-resend. Simulation send stays frontend-only. Live Meta send verification deferred. See `DOCU/05-pages/whatsapp-backend.md` and `DOCU/05-pages/whatsapp.md`.
- WhatsApp Phase 4 frontend: real Inbox at `/[locale]/whatsapp` (`whatsapp.read`) using conversation/message APIs, All/Unread, search, internal mark-read, disabled composer. Optional frontend-only simulation. No outbound send, media download, Customer link, or Dock. `GET /whatsapp/connection` is readable with `whatsapp.read` (sanitized; mutations stay `whatsapp.manage_connection`). See `DOCU/05-pages/whatsapp.md`.
- WhatsApp Phase 3 backend: `WhatsAppConversation` + `WhatsAppMessage` from normalized `MESSAGE_RECEIVED` events; office unread; `whatsapp.read` list/detail/messages/mark-read APIs. No Inbox UI, outbound send, media download, Customer auto-link, or auto-reply. See `DOCU/05-pages/whatsapp-backend.md`.
- WhatsApp Phase 2 backend: secure Meta Cloud API webhook foundation (`GET`/`POST /whatsapp/webhooks/meta`, raw-body HMAC, verify token, idempotent `WhatsAppWebhookEvent`, WABA/`phone_number_id` routing). No inbox, conversations, outbound send, media download, or auto-reply. Live Meta verification deferred. See `DOCU/05-pages/whatsapp-backend.md`.
- WhatsApp Phase 1 backend: secure Meta Cloud API connection foundation (`WhatsAppConnection` + short-lived `WhatsAppConnectionAttempt`, encrypted credentials, `whatsapp.manage_connection`). No messaging, webhooks, or phone migration. Missing Meta config fails closed. See `DOCU/05-pages/whatsapp-backend.md`.
- Sidebar cleanup: brand wordmark is `DIAMOND` (ELITE removed); New Contract shortcut and the mock fleet-status block are gone from the rail; Operations Center is removed from navigation, i18n, and frontend routing (no dedicated page or backend module existed). Dashboard Quick Access, GPS, Contracts, Maintenance, Finance, and remaining rail items are unchanged. See `DOCU/00-system-overview/app-shell-architecture.md`.

## 2026-09-11

- Dashboard weekly charts use the last 7 consecutive calendar days (weekends included, zero-activity days retained). The financial donut is interactive (hover/tap slice detail from existing Finance breakdown). Optional frontend-only Dashboard Simulation (`NEXT_PUBLIC_DEMO_SIMULATION_ENABLED`) is a removable overlay and does not change Real-mode APIs. See `DOCU/05-pages/dashboard.md` and `DOCU/05-pages/dashboard-backend.md`.
- Dashboard is a live operational aggregation (`GET /dashboard/overview`): KPI, fleet, weekly finance donut, Car-Out/Car-In rental activity, today’s deliveries, and permission-aware Quick Access. Demo dashboard fixtures are removed. See `DOCU/05-pages/dashboard.md` and `DOCU/05-pages/dashboard-backend.md`.
- Finance Manual Expense Correct is an in-place update of the same record (same ID, ACTIVE) with immutable Correction History inside expense details. Void remains a separate cancellation workflow. Financial Ledger header/body share one column definition. See `DOCU/05-pages/finance.md`.
- Finance ledger table order: Financial Ledger now sits above analytics / Open Receivables (Open Receivables moved to the former ledger position). Voided Manual Expense is shown as a single operational row (**Voided / ملغى**, Source Manual Expense, original amount struck through). The technical reversal stays in backend accounting and is hidden from the main Ledger. Expense filter = active expenses; Voided filter = voided Manual Expenses. Standalone Void still requires a reason. Ledger read projection exposes `manualExpenseStatus` and omits `MANUAL_EXPENSE_REVERSAL` from the operational list without changing financial totals. See `DOCU/05-pages/finance.md`.
- Finance ledger Movement vs Source semantics: Source is origin (Rental Payment, Maintenance, Manual Expense, …); Expense Reversal is a Movement, not a Source. Frontend-only Finance Demo Simulation overlay (`NEXT_PUBLIC_DEMO_SIMULATION_ENABLED`) derives KPIs/breakdowns from one fixture set and never writes to Finance/Stripe/DB. See `DOCU/05-pages/finance.md`.
- Finance Frontend V1: `/[locale]/finance` administrative operations center (`finance.read`) — KPIs, Open Receivables, analytics, ledger, manual expense add/void/correct (`finance.manage_expenses`). Backend-authoritative totals; Stripe-only collections; no invoices/deposit/manual income. See `DOCU/05-pages/finance.md`.
- Finance Manual Expense forms pass relative FormError keys (`required`, `wholeAed`, `positiveAmount`, `tooLong`) — never `validation.*` prefixes.
- Finance Backend V1: `FinancialLedgerEntry` + `ManualExpense`; Stripe-only Collected; Open Receivables projection; summary/ledger/analytics APIs; maintenance completion expense recognition; manual expense void/correct. Permissions `finance.read` / `finance.manage_expenses`. See `DOCU/05-pages/finance-backend.md`.
- Unified Stripe payment foundation verification: dedicated reconciliation/post-close/security integration tests; public renewal payment UX; TARS integration tests use test payment provider double; manual `payment/confirm` hidden from active OpenAPI; historical `MANUAL` rows preserved. See `DOCU/05-pages/payments-backend.md`.
- Unified Stripe payment foundation (Phase 2): shared payment engine for rental, renewal, reconciliation, and post-close receivable; Stripe Checkout + webhook idempotency; manual `payment/confirm` disabled; renewal applies only after payment; close blocked until reconciliation settled. See `DOCU/05-pages/payments-backend.md`.

## 2026-09-10

- Diamond V1 deposit removal: rental deposits are out of scope. Reconciliation `finalAmount` equals `chargesTotal`; no deposit collection, deduction, credit, or refund. Legacy DB columns remain but are ignored in active API/UI. See `DOCU/05-pages/contracts-backend.md` and `DOCU/05-pages/contracts.md`.
- Vehicle custody vs Contract lifecycle: Car-In ends possession (RETOUT → REVIEW and Vehicle RENTED → AVAILABLE). REVIEW is financial review, not currentRental. Close no longer releases the vehicle. Late official RTA/Salik on CLOSED Contracts create Post-Close Receivables without reopening the Contract. One `RoadLiabilityCustomerCharge` per liability. GPS Salik Contract flag is derived and informational. See `DOCU/05-pages/contracts-backend.md`, `DOCU/05-pages/violations-salik.md`, and `DOCU/05-pages/gps.md`.
- Violations & Salik customer charge review (frontend): staff confirm the customer charge from the Liability Drawer; official amount stays read-only; increase requires a reason; backend creates one locked reconciliation line **or** a post-close receivable. GPS predictions and users without `violations.charge` cannot confirm. See `DOCU/05-pages/violations-salik.md`.
- Road Liability → Reconciliation customer charge review (backend): official RTA/Salik amount stays immutable; staff may increase customer charge before attach; unique `roadLiabilityId` + idempotent confirm-charge; new manual SALIK/VIOLATION lines rejected. See `DOCU/05-pages/violations-salik.md` and `DOCU/05-pages/contracts-backend.md`.
- Violations & Salik UX simplification: server-derived `workState` + `queue`/`channel` list queries + unique `needsAttentionCount`; staff UI uses 3 KPIs, work-queue tabs, one toolbar, and a single operational status. Detailed confirmation/attribution/collection stay in the Drawer and Advanced Filters. No schema migration. See `DOCU/05-pages/violations-salik.md`.
- Violations & Salik frontend: `/[locale]/violations` (`violations.read`), Road Liabilities operations center (summary/list/detail, three status dimensions, GPS prediction vs official confirmation, Contract Drawer + GPS deep-link, production-safe empty state, existing Demo Simulation overlay). See `DOCU/05-pages/violations-salik.md`.
- Road Liabilities backend foundation (Violations & Salik): observations vs canonical liabilities, unconfigured RTA/Salik providers, GPS segment-crossing inference (never authoritative), Car-Out/Car-In custody attribution, staff read APIs `GET /road-liabilities/summary|/` `/:id` (`violations.read`). No manual create routes, no fake gates/events. See `DOCU/05-pages/violations-salik.md`.
- GPS Operations Center frontend: `/[locale]/gps` (`gps.read`), Leaflet/OpenStreetMap map-first layout, compact KPIs, vehicle panel, detail Drawer, Fleet `?vehicleId` deep-link, presentation-only GPS simulation. See `DOCU/05-pages/gps.md`.
- GPS summary `online` is the fresh-location total (`moving` + `parked` + row-level unknown-motion `online`). Row-level `trackingStatus` is unchanged. See `DOCU/05-pages/gps.md`.
- GPS Operations backend foundation: staff `GET /gps/summary`, `/gps/vehicles`, `/gps/map-points`, `/gps/vehicles/:vehicleId` (`gps.read`). `GpsUnconfiguredProvider` — no vendor, no fake coordinates. `VehicleGpsBinding` + `VehicleGpsLatestState` only (no history table). Tracking status is derived centrally. See `DOCU/05-pages/gps.md`.
- Maintenance sidebar + list projection: Maintenance Center remains in the Demo operational rail after Fleet/GPS (`/maintenance`, `maintenance.read`). `GET /maintenance` now includes the Vehicle projection used by cards and history, so the frontend no longer hydrates each row with `GET /maintenance/:id`. Detail fetch stays for opening one order. See `DOCU/05-pages/maintenance.md`.
- Maintenance Center frontend: `/[locale]/maintenance` wired to the existing Maintenance APIs (list, summary, detail, create, patch, start/ready/complete/cancel). Demo layout preserved (KPIs, overdue banner, status chips, cards, سجل الصيانة). Add Vehicle to Maintenance dialog uses a plate-forward `vehicleId` selector (`GET /vehicles?status=available&active=true`). Cost is optional and editable later. Completed orders are history and read-only. Permissions: `maintenance.read` / `maintenance.manage`. See `DOCU/05-pages/maintenance.md`.

## 2026-09-09

- The historical general rental Simulation journey was retired by the 2026-09-18 provider-only flow. Scoped browser-only Dashboard, WhatsApp, and Road Liabilities demos remain available in development; historical Finance/GPS controls are disabled.
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
