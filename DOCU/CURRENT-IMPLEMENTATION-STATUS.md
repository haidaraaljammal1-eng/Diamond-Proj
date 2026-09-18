# Current implementation status

Updated 2026-09-18.

Diamond does not have a general workflow simulation anymore. The only DEV provider substitutions are Driver License OCR, Passport OCR, and successful payment. They require a real Rental Link and a real Contract. Contract Review, legal signatures, lifecycle, PAID reservation, and Car-Out use the normal persisted workflow.

## Development provider mode

The backend requires `NODE_ENV !== production` and `DIAMOND_SIMULATION_ENABLED=true`; the frontend additionally requires `NEXT_PUBLIC_DIAMOND_SIMULATION=true` to show the three actions. The frontend flag never authorizes a mutation. Invalid or expired Rental Links remain blocked. OCR returns normalized identity through the existing Contract flow and does not mutate Customer.

DEV payment mode skips the external Stripe Card Setup requirement before signing. It does not create a fake card, Stripe Customer, PaymentMethod, Checkout Session, or provider id. A real legal signature is still required. The DEV payment action derives the amount server-side, records a `dev_simulation` payment source, uses the shared settlement transition, and persists `SIGNED -> PAID` idempotently. Payment does not perform Car-Out.

When DEV payment mode is off, the original Stripe Card Setup and Checkout/webhook flow applies. Stripe Test Mode still needs configured credentials and a webhook.

## PAID and handover

A PAID Contract reserves its assigned Vehicle: operational status stays `AVAILABLE`, while `isReserved=true` and `isBookable=false`. Staff opens Car-Out from that same Contract. Mileage, fuel, damage, eight exterior photos, and a real OUT signature are required. Completion atomically changes `PAID -> ACTIVE` and Vehicle `AVAILABLE -> RENTED`; the evidence becomes immutable.

## Local verification

Start both applications with the DEV flags, log in normally, generate a real Rental Link from an AVAILABLE Vehicle, then use the three provider actions around manual review and signature. Verify the same PAID Contract in staff Contracts and complete Car-Out with real evidence on disposable data. Disable DEV payment simulation to restore normal Stripe Card Setup. No session reset can roll back persisted Contract or payment state.

This session verified focused tests, builds, the development database, server boot, health, login-page rendering, invalid-token rejection, and removal of the card-simulation route. An authenticated staff session and disposable Rental Link were not available, so the full browser journey through PAID and Car-Out remains to be run manually.
