# Current implementation status

Updated 2026-09-19.

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

## Local verification

Start both applications with the DEV flags, log in normally, generate a real Rental Link from an AVAILABLE Vehicle, then use the three provider actions around manual review and signature. Verify the same PAID Contract in staff Contracts and complete Car-Out with real evidence on disposable data. Disable DEV payment simulation to restore normal Stripe Card Setup. No session reset can roll back persisted Contract or payment state.

On 2026-09-19, a browser session using the configured local system-admin account and a new disposable vehicle/Contract verified DEV OCR actions, persisted FORM, manual SIGNED, and DEV payment to PAID. The same agreement appeared on Contracts; the Vehicle remained AVAILABLE, reserved, and non-bookable with `canCarOut=true`. This did not use a manager-role account or complete Car-Out. No lifecycle state was inferred from a browser redirect alone.
