/**
 * Settles an electronic rental through the fake Stripe provider (deterministic E2E).
 * Usage: npx tsx scripts/e2e-settle-electronic-rental.ts --token=<rentalToken>
 */
import "./e2e-script-env";
import { hashToken } from "src/lib/security/tokens";
import { buildApp } from "src/app";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import {
  createFakePaymentProvider,
  flushStripeWebhookInbox,
  reconcileFakeProviderPayment,
  sendTestStripeWebhook,
} from "tests/helpers/fake-payment-provider";
import {
  resetStripeAccountKeyCache,
  resolveStripeProviderAccountKey,
} from "src/modules/contracts/payment/stripe-account-identity";

function arg(name: string): string | undefined {
  return process.argv.find((entry) => entry.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  const token = arg("token");
  if (!token) throw new Error("Pass --token=<rentalToken>");

  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_e2e_fake";
  process.env.PAYMENT_PROVIDER = "stripe";
  resetStripeAccountKeyCache();

  const run = `e2e-er-${Date.now().toString(36)}`;
  const fakePayments = createFakePaymentProvider(run);
  setPaymentProviderForTests(fakePayments.provider);

  const app = await buildApp();
  const prisma = app.prisma;
  const Stripe = (await import("stripe")).default;
  const { env } = await import("src/config/env");
  await resolveStripeProviderAccountKey(new Stripe(env.STRIPE_SECRET_KEY!));

  const start = await app.inject({
    method: "POST",
    url: `/contracts/rental/${token}/payment`,
    headers: {
      "content-type": "application/json",
      "idempotency-key": `e2e-rental-${run}`,
    },
    payload: { savePaymentMethodForFutureUse: false },
  });
  if (start.statusCode !== 200) {
    throw new Error(`Rental payment start failed (${start.statusCode}): ${start.body}`);
  }

  const statusToken = start.json().data.statusToken as string | null;
  if (!statusToken) throw new Error("Rental payment did not return statusToken");

  const payment = await prisma.contractPayment.findUnique({
    where: { statusTokenHash: hashToken(statusToken) },
  });
  if (!payment) throw new Error("Payment row missing for rental status token");

  const providerRef = fakePayments.refForPayment(payment.id);
  if (!providerRef) throw new Error("Fake provider reference missing for rental payment");

  fakePayments.confirm(providerRef);
  const webhookRes = await sendTestStripeWebhook(
    app,
    fakePayments.buildWebhookEvent({ paymentId: payment.id, status: "CONFIRMED" }),
  );
  if (webhookRes.statusCode !== 200) {
    throw new Error(`Webhook failed (${webhookRes.statusCode}): ${webhookRes.body}`);
  }
  await flushStripeWebhookInbox(app);
  await reconcileFakeProviderPayment(app, fakePayments, payment.id);

  const settled = await prisma.contract.findUnique({
    where: { id: payment.contractId },
    select: { status: true, collectionMode: true },
  });

  console.log(
    `E2E_ELECTRONIC_RENTAL_SETTLED_JSON=${JSON.stringify({
      contractId: payment.contractId,
      paymentId: payment.id,
      contractStatus: settled?.status ?? null,
      collectionMode: settled?.collectionMode ?? null,
    })}`,
  );
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
