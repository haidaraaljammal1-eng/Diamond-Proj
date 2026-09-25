/**
 * Collects an electronic road liability using the fake payment provider (deterministic E2E settlement).
 * Usage: npx tsx scripts/e2e-collect-electronic-road-liability.ts --liability=<id> [--mode=off-session|payment-link]
 */
import "./e2e-script-env";
import { buildApp } from "src/app";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import {
  createFakePaymentProvider,
  flushStripeWebhookInbox,
  sendTestStripeWebhook,
} from "tests/helpers/fake-payment-provider";
import {
  resetStripeAccountKeyCache,
  resolveStripeProviderAccountKey,
} from "src/modules/contracts/payment/stripe-account-identity";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

async function login(app: Awaited<ReturnType<typeof buildApp>>, email: string, password: string) {
  const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`Login failed (${res.statusCode}): ${res.body}`);
  return res.json().data.accessToken as string;
}

async function main() {
  const liabilityId = arg("liability");
  const mode = arg("mode") ?? "off-session";
  if (!liabilityId) throw new Error("Pass --liability=<roadLiabilityId>");

  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_e2e_fake";
  process.env.PAYMENT_PROVIDER = "stripe";
  resetStripeAccountKeyCache();

  const run = `e2e-rl-${Date.now().toString(36)}`;
  const fakePayments = createFakePaymentProvider(run);
  setPaymentProviderForTests(fakePayments.provider);

  const app = await buildApp();
  const token = await login(app, "admin@diamond.test", "Diamond123!");
  const Stripe = (await import("stripe")).default;
  const { env } = await import("src/config/env");
  await resolveStripeProviderAccountKey(new Stripe(env.STRIPE_SECRET_KEY!));

  const url =
    mode === "payment-link"
      ? `/road-liabilities/${liabilityId}/collection/payment-link`
      : `/road-liabilities/${liabilityId}/collection/off-session`;

  const res = await app.inject({
    method: "POST",
    url,
    headers: {
      authorization: `Bearer ${token}`,
      "idempotency-key": `${mode}-${run}`,
    },
    payload: {},
  });
  if (res.statusCode !== 200) {
    throw new Error(`Collection failed (${res.statusCode}): ${res.body}`);
  }

  if (mode === "payment-link") {
    const paymentId = res.json().data.paymentId as string;
    const providerRef = fakePayments.refForPayment(paymentId);
    if (!providerRef || !paymentId) {
      throw new Error("Payment link collection did not return provider reference");
    }
    fakePayments.confirm(providerRef);
    const event = fakePayments.buildWebhookEvent({ paymentId, status: "CONFIRMED" });
    const webhookRes = await sendTestStripeWebhook(app, event);
    if (webhookRes.statusCode !== 200) {
      throw new Error(`Webhook failed (${webhookRes.statusCode}): ${webhookRes.body}`);
    }
    await flushStripeWebhookInbox(app);
  }

  const prisma = app.prisma;
  const liability = await prisma.roadLiability.findUniqueOrThrow({ where: { id: liabilityId } });
  const payment = await prisma.contractPayment.findFirst({
    where: { purpose: "ROAD_LIABILITY", status: "CONFIRMED" },
    orderBy: { createdAt: "desc" },
  });

  console.log(
    `E2E_ELECTRONIC_RL_COLLECT_JSON=${JSON.stringify({
      liabilityId,
      mode,
      collectionStatus: liability.collectionStatus,
      paymentId: payment?.id ?? null,
      paymentStatus: payment?.status ?? null,
      paymentMethod: payment?.method ?? null,
    })}`,
  );

  setPaymentProviderForTests(undefined);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
