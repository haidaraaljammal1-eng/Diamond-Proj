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
| Forms | `forms/offer`, `payment`, `car-out`, `renew`, `reconcile`, `close` |
| Policy | `utils/contract-actions.ts`, `utils/contract-status.ts`, `utils/contract-timeline.ts` |

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
| RETOUT | Waiting for customer return — no renew, no Car-Out |
| REVIEW | Reconciliation; Close after Backend `canClose` |
| CLOSED | Read-only |

## Detail drawer

Row click opens the Shared Drawer. `GET /contracts/:id` shows number, status, vehicle, customer, pricing, period, payment, Car-Out/In, reconciliation, renewals, timeline. Empty fields are omitted.

Timeline is derived from `contract.status` only (done / current / upcoming).

## Fleet Set Rental Price

AVAILABLE vehicle with no `currentRental` → real dialog.

`POST /contracts/offers` then `POST /contracts/:id/rental-link`. Default fleet rates are suggestions only. `agreedAmount` is what is sent. Periods: DAILY / WEEKLY / MONTHLY / CUSTOM.

After success the link result UI offers Copy / Open. Vehicle stays AVAILABLE until PAID.

## Rental / return / renewal links

Staff generate real Backend tokens. Frontend builds `/{locale}/rental|return|renew/{token}`. Rental public pages are live (`PublicRental` module). Open Link is Development / QA preview, not an operational staff action. RETURN / RENEWAL public pages are later. Copy still copies the real URL.

## Payment confirmation

SIGNED + `contracts.manage` → `POST /contracts/:id/payment/confirm` (`MANUAL` / `BANK_TRANSFER` / `CARD`). SIGNED → PAID. Fleet card becomes Ready for Car-Out. No gateway UI.

## Car-Out

PAID fleet card and contract drawer. Eight inspection slots + mileage + fuel. Photos upload to `POST /files` (not Vehicle gallery), then `POST /contracts/:id/car-out`. PAID → ACTIVE; Vehicle → RENTED. Then refetch contracts + vehicles.

## Return link

ACTIVE → `POST /contracts/:id/return-link` → RETOUT. Vehicle stays RENTED. RETOUT fleet action opens contract detail (does not mint a new link). REVIEW opens Reconciliation.

## Renewal

ACTIVE only. `additionalDays` + `additionalAmount`. Optional renewal link. Hidden in RETOUT.

## Reconciliation / Close

REVIEW → line items (`DAMAGE` / `FUEL` / `LATE` / `SALIK` / `VIOLATION` / `OTHER`). Backend computes totals. Close uses Shared confirmation Dialog. REVIEW → CLOSED; Vehicle → AVAILABLE.

## Refresh

Sensitive mutations refetch the contract, contracts list, and vehicles list.

## Errors / idempotency

Store keeps `ApiRequestError` including `context.reason`. UI maps `CONTRACT_*` codes via next-intl. Payment, Car-Out, renew, close send `Idempotency-Key` per UI attempt.

## Out of scope

Return / renewal public pages, White Contract PDF, Stripe / Tamara / Tabby, Salik / Violations engines, Finance, Invoices, GPS map, WhatsApp, Maintenance workflow.
