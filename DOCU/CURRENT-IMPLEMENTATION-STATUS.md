# Current implementation status

Updated 2026-09-20.

Diamond has two separate development simulation categories. Rental provider substitutions are Driver License OCR, Passport OCR, and successful payment; they require a real Rental Link and update the real Contract. Browser-only UI demos are Dashboard, WhatsApp, and Road Liabilities; they use local fixtures and never write Contracts, Vehicles, Payments, or any backend data. The former general rental journey simulation remains disabled. Contract Review, legal signatures, lifecycle, PAID reservation, and Car-Out use the normal persisted workflow.

## Development provider mode

The backend requires `NODE_ENV !== production` and `DIAMOND_SIMULATION_ENABLED=true`; the frontend additionally requires `NEXT_PUBLIC_DIAMOND_SIMULATION=true` to show the three actions. The frontend flag never authorizes a mutation. Invalid or expired Rental Links remain blocked. OCR returns normalized identity through the existing Contract flow and does not mutate Customer.

DEV payment mode skips the external Stripe Card Setup requirement before signing. It does not create a fake card, Stripe Customer, PaymentMethod, Checkout Session, or provider id. A real legal signature is still required. The DEV payment action derives the amount server-side, records a `dev_simulation` payment source, uses the shared settlement transition, and persists `SIGNED -> PAID` idempotently. Payment does not perform Car-Out.

When DEV payment mode is off, the original Stripe Card Setup and Checkout/webhook flow applies. Stripe Test Mode still needs configured credentials and a webhook.

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

## Multi-company (UNIQUE / ELITE) — database phase only

The database now models two operating companies. `OperatingCompany` holds `code`
(UNIQUE / ELITE), display and legal Arabic/English names, an accent colour and
`isActive`. `Vehicle.companyId` is required, and `Contract.companyId` is required and
historical: it records the company that owned the Vehicle when the Contract was created
and is never recomputed from the Vehicle later. Both foreign keys are `RESTRICT`.
Migration `20260920012059_multi_company_foundation` inserted both companies, backfilled
all 32 existing Vehicles to UNIQUE and all 17 existing Contracts from their Vehicle, and
then made both columns NOT NULL. Contract numbering stays global (`DE-{year}-{sequence}`).

The backend is now company-aware end to end: `GET /operating-companies`, required company on vehicle creation, optional company transfer on vehicle update, `company` on Vehicle and Contract DTOs, `?companyId=` filters on both lists, contract company derived from the Vehicle and frozen in the official-contract snapshot, the renting company on the public rental context, and TARS provider resolution keyed by `Contract.companyId` (both companies still unconfigured). `externalId` is unique per company; plate and VIN stay globally unique.

**No frontend exists yet.** Backend routes and DTOs, Frontend filters, the
official-contract company branding and company-aware TARS routing are later phases. Because
both columns are required, vehicle and contract creation code still has to pass a company:
`npm run typecheck` currently reports 36 errors (5 in `src/`, 31 in test fixtures), and
creating a Vehicle or Contract through the API fails until the Backend phase lands. Reading,
Car-Out, Car-In, payments, reconciliation and close are unaffected. The exact file list, the
inheritance rule, the `externalId` uniqueness decision and the placeholder accent colours are
in `DOCU/00-system-overview/operating-companies.md`.

## RETOUT and Car-In

Car-In is a staged workflow with the same shape as Car-Out. A RETOUT Contract offers **Receive vehicle**; the dialog saves a server-side draft (mileage IN, fuel IN, damage IN, notes, hirer IN signature) and the eight required photos plus three optional ones, all resumable after closing and reopening. Nothing is prefilled from Car-Out. Complete is enabled only by the Backend `canComplete`, and it atomically moves `RETOUT -> REVIEW` with Vehicle `RENTED -> AVAILABLE`. Car-In does not close the Contract, and there is no OUT versus IN comparison yet.

## Local verification

Start both applications with the DEV flags, log in normally, generate a real Rental Link from an AVAILABLE Vehicle, then use the three provider actions around manual review and signature. Verify the same PAID Contract in staff Contracts and complete Car-Out with real evidence on disposable data. Disable DEV payment simulation to restore normal Stripe Card Setup. No session reset can roll back persisted Contract or payment state.

On 2026-09-20, a browser session on a real RETOUT Contract verified the staged Car-In end to end: draft save, close and reopen with mileage, fuel, damage, notes and signature restored, the eight required photos with one replaced and one deleted and re-uploaded, an optional photo, the confirmation dialog, and Complete. The Contract moved to REVIEW and the Vehicle to AVAILABLE in the database, and the Contracts list showed the new status without a manual browser refresh. Verified in Arabic RTL and English LTR at 1440px and 390px. Note for repeat runs: the development backend allows 100 requests a minute, which an automated run driving the whole flow at machine speed can exceed; staff pace does not.

On 2026-09-19, a browser session using the configured local system-admin account and a new disposable vehicle/Contract verified DEV OCR actions, persisted FORM, manual SIGNED, and DEV payment to PAID. The same agreement appeared on Contracts; the Vehicle remained AVAILABLE, reserved, and non-bookable with `canCarOut=true`. This did not use a manager-role account or complete Car-Out. No lifecycle state was inferred from a browser redirect alone.
