/** Run invoice outbox cycles after sequences exist; does not create invoices directly. */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { normalizedNameExtension } from "src/lib/db/prisma-extensions";
import { createInvoiceOutboxConsumer } from "src/modules/invoices/invoice-outbox-consumer";
import type { FastifyInstance } from "fastify";

const CONTRACT_ID = "4cb0e8d5-9c7e-47b3-9390-0764ededeac4";
const OUTBOX_ID = 1619;

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter }).$extends(normalizedNameExtension);

async function snapshot() {
  const outbox = await prisma.domainOutboxEvent.findUnique({ where: { id: OUTBOX_ID } });
  const contractInvoices = await prisma.invoice.findMany({
    where: { contractId: CONTRACT_ID },
    include: { lines: true, company: { select: { code: true } } },
  });
  const sequences = await prisma.invoiceNumberSequence.findMany({
    include: { company: { select: { code: true } } },
  });
  return { outbox1619: outbox, contractInvoices, sequences };
}

async function main() {
  const db = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  if (db[0]?.current_database !== "haidara") {
    throw new Error("Refusing: not haidara");
  }

  const before = await snapshot();
  const now = new Date();
  if (before.outbox1619?.availableAt && before.outbox1619.availableAt > now) {
    await prisma.domainOutboxEvent.update({
      where: { id: OUTBOX_ID },
      data: { availableAt: now },
    });
  }

  const fakeApp = { prisma, log: { error: console.error, info: console.log } } as FastifyInstance;
  const consumer = createInvoiceOutboxConsumer(fakeApp);

  console.log(JSON.stringify({ phase: "before_cycles", ...(await snapshot()) }, null, 2));

  for (let i = 0; i < 3; i++) {
    const cycle = await consumer.runInvoiceOutboxCycle();
    const snap = await snapshot();
    console.log(JSON.stringify({ phase: `cycle_${i + 1}`, cycle, ...snap }, null, 2));
    if (snap.outbox1619?.status === "PROCESSED" && snap.contractInvoices.some((x) => x.invoiceType === "RENTAL")) {
      break;
    }
  }

  await consumer.runInvoiceOutboxCycle();
  const rentalCount = await prisma.invoice.count({
    where: { contractId: CONTRACT_ID, invoiceType: "RENTAL" },
  });
  console.log(JSON.stringify({ phase: "idempotency_extra_cycle", rentalCount, ...(await snapshot()) }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
