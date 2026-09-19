# Contracts Page — Frontend V1

Staff Contracts desk for Diamond Rent Car. Backend contract: [contracts-backend.md](./contracts-backend.md). Visual source: `demo.html` `vContracts` (table + drawer). Fleet Set Rental Price is the create-offer entry. No mock contracts.

## Route / Permission

- `/ar/contracts`
- `/en/contracts`

Navigation rail `contracts` → `/contracts`. Page access: `contracts.read`. Actions use `contracts.manage`, `contracts.activate`, `contracts.car_out`, `contracts.return`, `contracts.reconcile`, `contracts.close`, `contracts.renew`. Backend remains final authority.

## Architecture

```
ContractsPage
  → ContractsScreen
    → useContracts() / useContract()
      → contracts.store.ts
        → contracts.api.ts
          → Central API Client
            → Fastify Backend
```

UI dialog/drawer state stays in the screen. Transient issued-link URLs live in the Zustand store in memory only — never `localStorage` / `sessionStorage` / persisted Zustand. Raw tokens are converted to a customer URL then dropped.

## Module

`APP/frontend/src/modules/contracts/`

| Area | Files |
| ---- | ----- |
| API | `api/contracts.api.ts` |
| Store | `stores/contracts.store.ts` |
| Hooks | `hooks/use-contracts.ts`, `hooks/use-contract.ts` |
| Types | `types/contract.types.ts` |
| Screen / table | `components/contracts-screen/`, `components/contracts-table/` |
| Filters | `components/contract-filters/` + Shared `DataSearch` + Shared `DateRangePicker` |
| Drawer | Shared `Drawer` + `components/contract-detail/` |
| Timeline | `components/contract-timeline/` |
| Status | `components/contract-status/` |
| Link result | `components/contract-link-result/` |
| Forms | `forms/offer`, `payment`, `car-out`, `car-in`, `renew`, `reconcile`, `close` |
| Policy | `utils/contract-actions.ts`, `utils/contract-status.ts`, `utils/contract-timeline.ts` |
| TARS status | `api/tars.api.ts`, `stores/contract-tars.store.ts`, `hooks/use-contract-tars.ts`, `components/contract-tars/`, `utils/tars-status.ts` |

## List / search / filter

Server-side only. Changing any filter resets to page 1.

| Control | Query | Notes |
| ------- | ----- | ----- |
| Status chips | `status` | omitted when `all` |
| Search | `search` | Explicit submit via Shared `DataSearch` — no per-keystroke request |
| Date range | `from` / `to` | `YYYY-MM-DD` → ISO instants via Shared `DateRangePicker` (explicit Apply; one toolbar control) |
| Sort | `sort` | UX presets → Backend `field:direction` (`createdAt`, `agreedAmount`, `startAt`, `contractNumber`) |
| Pagination | `page` / `pageSize` | default 20 |
| Result count | — | `meta.total` |

No employee filter (Backend list does not support it).

### Date Range Filtering

- **UI:** Shared `DateRangePicker` (`src/shared/components/ui/date-range-picker`) built on **React DayPicker v9** with Diamond CSS — no native `<input type="date">` and no default DayPicker theme.
- **Architecture:** Controlled component (`value`, `onApply`, `onClear`). Contracts filters pass applied `from` / `to` strings from Zustand query state; the picker keeps a draft range inside its popover until Apply.
- **Server query:** `buildContractsQuery` still sends `from` / `to` as ISO instants (`YYYY-MM-DD` → `T00:00:00.000Z` / `T23:59:59.000Z`). Query param names are unchanged.
- **Explicit Apply:** Calendar clicks and quick presets update draft only. Apply sets `from` + `to`, resets `page` to 1, closes the popover, and triggers one list request. Clear removes the range and refetches.
- **Quick ranges:** Today, Last 7/30 Days, This/Last Month, Custom (i18n via `DateRangePicker` namespace).
- **Layout:** Two months side-by-side on desktop (`≥769px`); one month on mobile/tablet.
- **RTL/LTR:** `dir` from locale; logical CSS in picker + popover.
- **Date-only safety:** Calendar dates serialize with `formatCalendarDate` / `parseCalendarDate` (local calendar fields) — never blind `toISOString().slice(0, 10)`.
- **Active filter badge:** A date range counts as **one** active filter (not `from` + `to` separately).

## Status presentation

Canonical Backend statuses only: `AWAITING → FORM → SIGNED → PAID → ACTIVE → RETOUT → REVIEW → CLOSED`.

Shared `Chip`: AWAITING/FORM/RETOUT warn; SIGNED/PAID/REVIEW gold; ACTIVE ok; CLOSED neutral.

Labels: Awaiting Customer / Form Completed / Signed / Ready for Car-Out / Active / Return in Progress / Reconciliation / Closed.

## Action matrix

`getContractActions(contract, permissions)` AND Backend `actions` flags.

| Status | Staff actions |
| ------ | ------------- |
| AWAITING / FORM | Generate rental link (`contracts.manage`) |
| SIGNED | Confirm payment (+ optional regenerate link) |
| PAID | Car-Out |
| ACTIVE | Return link + Renew |
| RETOUT | Staff Car-In (`contracts.return`). Waiting copy only if Car-In is not available |
| REVIEW | Reconciliation; Close after Backend `canClose` |
| CLOSED | Read-only |

## Detail drawer

Row click opens the Shared Drawer. `GET /contracts/:id` shows number, status, vehicle, customer, pricing, period, payment, Car-Out/In, reconciliation, renewals, timeline, optional GPS Salik informational flag, and compact post-close receivables. Empty fields are omitted.

Timeline is derived from `contract.status` only (done / current / upcoming). REVIEW copy is financial review after return, not current possession.

## TARS integration status

Read-only. Full contract and rationale: [tars-integration.md](../04-api-contracts/tars-integration.md).

One drawer section, placed after the lifecycle timeline and before the staff action area — there is no TARS page. `GET /contracts/:id/tars` via `useContractTars()`, reusing the existing `contracts.read` request; no new permission and no role-name checks. The store is separate from `contracts.store`, is cached per contract, fetches once when the drawer opens or the id changes, and never polls.

Header shows an overall chip: **Not Connected / غير متصل حالياً** on the neutral champagne tone while TARS is unconfigured — a development state, never red — with the line "Synchronization will be enabled once the official TARS API is configured." When configured it shows **Connected**, plus `TARS Reference` (LTR-isolated) and `Last Sync` when the Backend has them.

Below it, the five approved procedures render as shared `IntegrationStatusRow` lines: Contract Registration, Contract Acceptance, Vehicle Handover, Vehicle Return, Contract Completion. Statuses map `NOT_STARTED` neutral / `PENDING` amber / `PROCESSING` gold with a slow pulse / `SUCCEEDED` positive / `FAILED` soft red.

Compact read-only indicators also sit in the Car-Out dialog (`TARS Handover`), the Car-In dialog and drawer Car-In record (`TARS Return`) and the Close dialog (`TARS Completion`). They render nothing while loading or on error.

**No action buttons of any kind** — no Register, Send, Submit, Retry, Test or Sync Now. Contract lifecycle, validation and existing actions are untouched, and the public rental pages show no TARS state. While loading, the section shows skeletons; if the read fails, only "Unable to load TARS integration status." appears inside the section and the rest of the drawer keeps working.

## Fleet Set Rental Price

AVAILABLE vehicle with no `currentRental` → real dialog.

`POST /contracts/offers` then `POST /contracts/:id/rental-link`. Default fleet rates are suggestions only. `agreedAmount` is what is sent. Periods: DAILY / WEEKLY / MONTHLY / CUSTOM.

After success the link result UI offers Copy / Open. Vehicle stays AVAILABLE until PAID.

## Rental / return / renewal links

Staff generate real Backend tokens. Frontend builds `/{locale}/rental|return|renew/{token}`. Rental public pages are live (`PublicRental` module). Return public pages are live (`PublicReturn` module at `/[locale]/return/[token]`). Renewal public pages are live (`PublicRenewal` module at `/[locale]/renew/[token]`). Open Link is Development / QA preview, not an operational staff action. Copy still copies the real URL.

## Payment confirmation

SIGNED → customer Stripe Checkout on the public rental page (`POST /contracts/rental/:token/payment`). Staff manual `POST /contracts/:id/payment/confirm` is disabled in V1. Trusted provider confirmation moves SIGNED → PAID; fleet card becomes Ready for Car-Out.

## Car-Out

The contract-scoped Car-Out dialog opens from a PAID Contract. Its wide Shared Dialog fills most of the viewport, with one content scrollbar and a fixed action footer. It shows a short preview of the frozen signed A4 contract from `Contract.snapshot.officialContract`, confirmed payment, and contract/vehicle identity. **Open full-size A4 contract** opens `/[locale]/contracts/[id]/car-out/contract` in a protected page, rendered at its original A4 size. The legal copy stays read-only; Vehicle OUT edits remain in the same Car-Out draft. Staff signature images are read through `contracts.read`.

Header: vehicle name first, then a plate block (plate code merged into the number, LTR) with color and year, then contract number and hirer. One status line holds shared `Chip`s for contract status, confirmed payment (omitted until confirmed) and vehicle status, followed by the TARS handover row. While PAID and not handed over, vehicle status reads Reserved alone; the fleet status is not appended.

Step 1 edits only Vehicle OUT mileage, fuel, damage, notes and the separate hirer handover signature. Save Draft persists through the existing PATCH/signature routes without changing PAID or the Vehicle's AVAILABLE + reserved state. Next saves Step 1 before opening Step 2; save/validation errors appear next to the fixed actions. Reopening reloads the latest draft, signature and photos.

Step 2 is vehicle photography. Required slots: FRONT, REAR, FRONT_RIGHT, REAR_RIGHT, FRONT_LEFT, REAR_LEFT, ODOMETER, DASHBOARD_FUEL. LEFT, RIGHT and OTHER remain optional. Each slot supports camera capture, file upload/replace and delete; progress comes from the Backend projection. Complete Handover is available only after saved mileage, fuel, OUT signature and all eight required photos. `POST /contracts/:id/car-out/complete` alone changes PAID → ACTIVE and Vehicle AVAILABLE → RENTED atomically, then refetches Contracts and Vehicles. The signed legal snapshot and A4 design do not change.

## Return link / public return

ACTIVE → `POST /contracts/:id/return-link` → RETOUT. Vehicle stays RENTED. RETOUT fleet action opens contract detail (does not mint a new link). Customer page `/[locale]/return/[token]` is public, token-scoped, no staff JWT, no AppShell. It shows office, contract number, vehicle, agreed return context, and instructions. It never exposes TARS, reconciliation, payment internals, or a close action. Customer cannot submit Car-In.

## Car-In

Staff operational action on RETOUT via `POST /contracts/:id/car-in` (`contracts.return`). Same fields as Backend `CarInSchema`: optional `occurredAt`, `mileageIn`, `fuelIn`, notes, eight inspection photos. RETOUT → REVIEW. Vehicle RENTED → AVAILABLE. Car-In never closes the contract. Public `POST /contracts/return/:token/car-in` remains for the hashed token path.

Drawer Car-In copy: Vehicle returned / حالة الحيازة: انتهت. GPS Salik is a small informational champagne flag (`hasSalikGpsSignal`), never “waiting for a violation”. Compact Post-Close Charges appear when receivables exist.

## Reconciliation / Close

Diamond V1 does not use rental deposits. Reconciliation `finalAmount` equals `chargesTotal`. No deposit collection, deduction, credit, or refund exists.

REVIEW → line items (`DAMAGE` / `FUEL` / `LATE` / `SALIK` / `VIOLATION` / `OTHER`). The dialog lists every category and opens with empty Salik and Violation rows (amount / reference / note) so those settlement types are visible immediately — no live engines and no invented amounts. Totals come from the Backend after save (`chargesTotal`, `finalAmount`). Close uses Shared confirmation Dialog and is available only when Backend `canClose` is true (REVIEW + Car-In + approved reconciliation). REVIEW → CLOSED. Close does not release the vehicle; Fleet trusts refreshed backend state (a newer rental may already be RENTED).

## Overlay stacking

Shared Dialog stacks above Shared Drawer (dialog z-index 110, drawer 95/96). Escape on the dialog does not close the drawer. See `AGENTS.md`.

## Renewal

ACTIVE contracts only. The same Contract stays ACTIVE; no second Contract or Rental is created. Vehicle stays RENTED. Staff enter `additionalDays` + `additionalAmount` when generating a Renewal Link (`POST /contracts/:id/renewal-link`). Those values are stored as a pending `ContractRenewal` and become the server-owned offer. The customer page `/[locale]/renew/[token]` is public, token-scoped, no staff JWT, no AppShell. The customer reviews Current Rental vs Renewal Offer and confirms; when `additionalAmount > 0`, Stripe Checkout must confirm before terms apply. Zero additional amount may apply without payment. The client cannot override amount, duration, vehicle, or contract identity. Used links may be reloaded for the success state. Drawer Renewal History uses existing `ContractRenewal` rows (date, previous/new end, days, amount, pending vs confirmed). Renewal is not part of mandatory TARS execution. Hidden in RETOUT / REVIEW / CLOSED.

## Refresh

Sensitive mutations refetch the contract, contracts list, and vehicles list.

## Errors / idempotency

Store keeps `ApiRequestError` including `context.reason`. UI maps `CONTRACT_*` codes via next-intl. Payment, Car-Out, Car-In, renew, close send `Idempotency-Key` per UI attempt.

## Out of scope

White Contract PDF, Stripe / Tamara / Tabby, Salik / Violations engines, Finance, Invoices, GPS map, WhatsApp, Maintenance workflow, TARS renewal execution.
