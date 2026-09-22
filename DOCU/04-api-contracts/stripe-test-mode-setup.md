# Stripe test-mode setup (Diamond V1)

Diamond V1 uses **Stripe Hosted Checkout** in one-time `payment` mode. Production cutover requires only key/webhook/URL swaps — no payment workflow redesign.

## Environment

Backend (`APP/backend/.env`, never commit):

```env
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=http://localhost:3100
```

- `STRIPE_SECRET_KEY` — backend only. Never `NEXT_PUBLIC_*`, never frontend, never tests, never docs.
- `STRIPE_WEBHOOK_SECRET` — from Stripe Dashboard (deployed) or Stripe CLI (local). Separate from the API secret. Checkout can start with only the API secret; webhook confirmation needs this value. The public callback page can still settle via Stripe status polling when the webhook is delayed.
- `STRIPE_PUBLISHABLE_KEY` — optional for hosted Checkout (`session.url` redirect). Diamond does not load Stripe.js for rental pay.

Frontend does not need Stripe keys for hosted Checkout.

## Local webhook forwarding

1. Install [Stripe CLI](https://stripe.com/docs/stripe-cli).
2. `stripe login`
3. Start Diamond backend on port `8000` (or your `PORT`).
4. Forward events:

```bash
stripe listen --forward-to http://localhost:8000/payments/webhooks/stripe
```

5. Copy the CLI `whsec_...` into `STRIPE_WEBHOOK_SECRET` and restart the backend.

No public tunnel is required when using CLI forwarding.

## Flow

1. Public rental **Pay now with Stripe** → `POST /contracts/rental/:token/payment` with body `{ savePaymentMethodForFutureUse: true|false }` (requires `Idempotency-Key`, `Accept-Language` for return URLs).
2. Backend creates `ContractPayment` (+ consent fields when authorized) and a Stripe Checkout Session (`price_data` from authoritative contract amount; `setup_future_usage=off_session` only when consented).
3. Browser redirects to `checkoutUrl`.
4. Customer pays on Stripe.
5. Stripe webhook → `POST /payments/webhooks/stripe` (raw body + signature).
6. Verified event → existing payment settlement (`SIGNED` → `PAID` for rental).
7. Success/cancel redirect hits `/[locale]/payment/callback?statusToken=...` — **poll only**; redirect does not settle.

## Test cards (manual QA only)

Use in Stripe Checkout UI, not in application code:

| Scenario | Number |
|----------|--------|
| Success | `4242 4242 4242 4242` |
| UAE success | `4000 0078 4000 0001` |
| 3DS | `4000 0025 0000 3155` |
| Insufficient funds | `4000 0000 0000 9995` |
| Decline | `4000 0000 0000 0002` |

Use any future expiry and valid CVC.

## Test → live cutover

1. Replace `sk_test_*` with `sk_live_*`.
2. Register production webhook URL (HTTPS) in Stripe Dashboard → `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`.
3. Set production `STRIPE_WEBHOOK_SECRET` from the live endpoint.
4. Set production `FRONTEND_URL` / public URLs.
5. Restart deployment.
6. Run one controlled live payment and verify webhook + ledger + contract state.

See also [payments-backend.md](../05-pages/payments-backend.md).
