/**
 * Asserts combined final settlement invariants for one contract (post Stripe/Cash success).
 * Usage: npx tsx scripts/verify-combined-settlement-payment.ts <contractId|contractNumber>
 */
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ override: false });

const key = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;
if (!key || !databaseUrl) {
  console.error("contract id or number required");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function resolveContractId(input: string): Promise<string | null> {
  if (/^[0-9a-f-]{36}$/i.test(input)) return input;
  const row = await prisma.contract.findFirst({
    where: { contractNumber: input },
    select: { id: true },
  });
  return row?.id ?? null;
}

async function main() {
  const contractId = await resolveContractId(key);
  if (!contractId) {
    console.log(JSON.stringify({ ok: false, error: "NOT_FOUND" }));
    return;
  }

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      status: true,
      vehicleId: true,
      reconciliation: {
        select: { id: true, finalAmount: true, settledAt: true, settledPaymentId: true },
      },
      vehicle: { select: { operationalStatus: true } },
    },
  });

  const payments = await prisma.contractPayment.findMany({
    where: { contractId, purpose: "RECONCILIATION", method: "CARD", status: "CONFIRMED" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      amount: true,
      status: true,
      method: true,
      purpose: true,
      providerReference: true,
      confirmedAt: true,
    },
  });

  const payment = payments.length === 1 ? payments[0]! : null;

  const allocations = payment
    ? await prisma.contractPaymentAllocation.findMany({
        where: { contractPaymentId: payment.id },
        select: { allocationPurpose: true, targetId: true, amount: true },
        orderBy: { allocationPurpose: "asc" },
      })
    : [];

  const ledger = payment
    ? await prisma.financialLedgerEntry.findMany({
        where: {
          contractPaymentId: payment.id,
          kind: { in: ["RECONCILIATION_PAYMENT", "RENEWAL_PAYMENT"] },
        },
        select: { kind: true, amount: true },
      })
    : [];

  const renewals = await prisma.contractRenewal.findMany({
    where: { contractId },
    select: { id: true, settledPaymentId: true, additionalAmount: true },
  });

  const webhook = payment
    ? await prisma.stripeWebhookEvent.findFirst({
        where: {
          paymentId: payment.id,
          processingStatus: "PROCESSED",
          eventType: { in: ["checkout.session.completed", "checkout.session.async_payment_succeeded"] },
        },
        orderBy: { processedAt: "desc" },
        select: { eventType: true, processedAt: true, stripeEventId: true },
      })
    : null;

  const reconAlloc = allocations.find((a) => a.allocationPurpose === "RECONCILIATION");
  const renewalAlloc = allocations.find((a) => a.allocationPurpose === "RENEWAL");
  const reconLedger = ledger.find((l) => l.kind === "RECONCILIATION_PAYMENT");
  const renewalLedger = ledger.find((l) => l.kind === "RENEWAL_PAYMENT");

  const allocSum = allocations.reduce((s, a) => s + Number(a.amount), 0);
  const ledgerSum = ledger.reduce((s, l) => s + Number(l.amount), 0);
  const paymentAmount = payment ? Number(payment.amount) : 0;

  const trustedPath = webhook?.processedAt ? "WEBHOOK" : payment?.confirmedAt ? "PROVIDER_POLL_OR_UNKNOWN" : null;

  const ok =
    contract?.status === "CLOSED" &&
    payments.length === 1 &&
    paymentAmount === 700 &&
    reconAlloc?.amount != null &&
    Number(reconAlloc.amount) === 200 &&
    renewalAlloc?.amount != null &&
    Number(renewalAlloc.amount) === 500 &&
    allocSum === 700 &&
    reconLedger?.amount != null &&
    Number(reconLedger.amount) === 200 &&
    renewalLedger?.amount != null &&
    Number(renewalLedger.amount) === 500 &&
    ledgerSum === 700 &&
    contract?.reconciliation?.settledAt != null &&
    contract.reconciliation.settledPaymentId === payment?.id &&
    renewals.every((r) => r.settledPaymentId === payment?.id);

  console.log(
    JSON.stringify(
      {
        ok,
        contractStatus: contract?.status ?? null,
        vehicleStatus: contract?.vehicle?.operationalStatus ?? null,
        reconciliationFinalAmount: contract?.reconciliation?.finalAmount ?? null,
        paymentCount: payments.length,
        payment: payment
          ? {
              id: payment.id,
              purpose: payment.purpose,
              method: payment.method,
              status: payment.status,
              amount: paymentAmount,
              sessionIdSuffix: payment.providerReference?.slice(-8) ?? null,
            }
          : null,
        allocations: allocations.map((a) => ({
          purpose: a.allocationPurpose,
          amount: Number(a.amount),
        })),
        allocationSum: allocSum,
        ledger: ledger.map((l) => ({ kind: l.kind, amount: Number(l.amount) })),
        ledgerSum,
        renewals: renewals.map((r) => ({
          id: r.id,
          additionalAmount: Number(r.additionalAmount),
          settledPaymentId: r.settledPaymentId,
        })),
        trustedConfirmationPath: trustedPath,
        webhookProcessed: Boolean(webhook),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "ERROR" }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
