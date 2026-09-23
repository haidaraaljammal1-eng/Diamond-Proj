/**
 * Guarded DEV/TEST Stripe payment-domain cleanup.
 * DRY RUN by default. Execute with STRIPE_DEV_CLEANUP_EXECUTE=true.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ALLOWED_DB_NAMES = new Set(["diamond", "haidara_test"]);

function databaseName(url: string): string {
  const parsed = new URL(url.replace(/^postgresql:/, "http:"));
  return parsed.pathname.replace(/^\//, "").split("?")[0] ?? "";
}

async function main() {
  const execute = process.env.STRIPE_DEV_CLEANUP_EXECUTE === "true";
  const nodeEnv = process.env.NODE_ENV ?? "development";
  if (nodeEnv === "production") {
    console.error("Refusing cleanup in production NODE_ENV.");
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const dbName = databaseName(databaseUrl);
  if (!ALLOWED_DB_NAMES.has(dbName)) {
    console.error(`Refusing cleanup on database "${dbName}". Allowed: ${[...ALLOWED_DB_NAMES].join(", ")}`);
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  const counts = {
    contractPayments: await prisma.contractPayment.count(),
    checkoutAttempts: await prisma.contractPaymentAttempt.count(),
    webhookEvents: await prisma.stripeWebhookEvent.count(),
    paymentProfiles: await prisma.customerPaymentProfile.count({ where: { livemode: false } }),
    paymentMethods: await prisma.customerPaymentMethod.count(),
    authorizations: await prisma.contractPaymentAuthorization.count(),
    rentalLedgers: await prisma.financialLedgerEntry.count({ where: { kind: "RENTAL_PAYMENT" } }),
    paidContracts: await prisma.contract.count({ where: { status: "PAID" } }),
  };

  console.log(JSON.stringify({ mode: execute ? "execute" : "dry-run", database: dbName, counts }, null, 2));

  if (!execute) {
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.financialLedgerEntry.deleteMany({
      where: { kind: "RENTAL_PAYMENT", contractPayment: { provider: "stripe" } },
    });
    await tx.contractPaymentAuthorization.deleteMany({});
    await tx.contractPaymentAttempt.deleteMany({});
    await tx.stripeWebhookEvent.deleteMany({});
    await tx.contractPayment.deleteMany({ where: { method: "CARD" } });
    await tx.customerPaymentMethod.deleteMany({});
    await tx.customerPaymentProfile.deleteMany({ where: { livemode: false } });
    await tx.contract.updateMany({
      where: { status: "PAID" },
      data: { status: "SIGNED" },
    });
  });

  const after = {
    contractPayments: await prisma.contractPayment.count(),
    checkoutAttempts: await prisma.contractPaymentAttempt.count(),
    webhookEvents: await prisma.stripeWebhookEvent.count(),
    paidContracts: await prisma.contract.count({ where: { status: "PAID" } }),
  };
  console.log(JSON.stringify({ after }, null, 2));
  await prisma.$disconnect();
}

void main();
