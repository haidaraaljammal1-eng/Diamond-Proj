/**
 * Prints reconciliation card-payment and Stripe Checkout session status.
 * Does not print secrets, tokens, or checkout URLs.
 *
 * Usage: npx tsx scripts/reconciliation-checkout-status.ts <contractId>
 */
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import Stripe from "stripe";

dotenv.config({ override: true });

const contractKey = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;
if (!contractKey || !databaseUrl) {
  console.error("contract id or contract number required");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main(key: string) {
  const contractId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)
    ? contractKey
    : (
        await prisma.contract.findFirst({
          where: { contractNumber: key },
          select: { id: true },
        })
      )?.id;
  if (!contractId) {
    console.log(JSON.stringify({ error: "NOT_FOUND" }));
    return;
  }
  const payment = await prisma.contractPayment.findFirst({
    where: { contractId, purpose: "RECONCILIATION", method: "CARD" },
    orderBy: { createdAt: "desc" },
    select: { status: true, providerReference: true },
  });
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { status: true, reconciliation: { select: { settledAt: true, finalizedAt: true } } },
  });
  let sessionStatus: string | null = null;
  if (payment?.providerReference && process.env.STRIPE_SECRET_KEY) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(payment.providerReference);
    sessionStatus = session.status;
  }
  console.log(
    JSON.stringify({
      contractStatus: contract?.status ?? null,
      finalized: Boolean(contract?.reconciliation?.finalizedAt),
      settled: Boolean(contract?.reconciliation?.settledAt),
      paymentStatus: payment?.status ?? null,
      sessionStatus,
    }),
  );
}

main(contractKey)
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.name : "ERROR";
    console.log(JSON.stringify({ error: message }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
