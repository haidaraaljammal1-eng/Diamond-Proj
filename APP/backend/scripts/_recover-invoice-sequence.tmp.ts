/**
 * One-off: inspect invoices, configure sequences, optionally run one invoice outbox cycle.
 * Uses DATABASE_URL from .env (must be haidara).
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { normalizedNameExtension } from "src/lib/db/prisma-extensions";
import { ensureDevelopmentInvoiceNumberSequences } from "src/modules/invoices/invoice-number-sequence.bootstrap";

const CONTRACT_ID = "4cb0e8d5-9c7e-47b3-9390-0764ededeac4";
const OUTBOX_ID = 1619;

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter }).$extends(normalizedNameExtension);

async function main() {
  const db = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  const dbName = db[0]?.current_database;
  if (dbName !== "haidara") {
    throw new Error(`Refusing to run: current_database=${dbName}, expected haidara`);
  }

  const invoices = await prisma.invoice.findMany({
    orderBy: [{ companyId: "asc" }, { invoiceNumber: "asc" }],
    include: { company: { select: { code: true } } },
  });

  const elite = await prisma.operatingCompany.findUnique({ where: { code: "ELITE" } });
  const unique = await prisma.operatingCompany.findUnique({ where: { code: "UNIQUE" } });

  const maxElite = await prisma.invoice.aggregate({
    where: { companyId: elite!.id },
    _max: { invoiceNumber: true },
  });
  const maxUnique = await prisma.invoice.aggregate({
    where: { companyId: unique!.id },
    _max: { invoiceNumber: true },
  });

  const outboxBefore = await prisma.domainOutboxEvent.findUnique({ where: { id: OUTBOX_ID } });
  const seqBefore = await prisma.invoiceNumberSequence.findMany({
    include: { company: { select: { code: true } } },
  });

  console.log(
    JSON.stringify(
      {
        phase: "before",
        database: dbName,
        invoices,
        maxElite: maxElite._max.invoiceNumber,
        maxUnique: maxUnique._max.invoiceNumber,
        sequences: seqBefore,
        outbox1619: outboxBefore,
      },
      null,
      2,
    ),
  );

  const bootstrapResults = await ensureDevelopmentInvoiceNumberSequences(
    prisma as unknown as PrismaClient,
  );

  const seqAfterBootstrap = await prisma.invoiceNumberSequence.findMany({
    include: { company: { select: { code: true } } },
  });

  console.log(JSON.stringify({ phase: "after_bootstrap", bootstrapResults, sequences: seqAfterBootstrap }, null, 2));

  const pollMs = 5_000;
  const maxWaitMs = 120_000;
  const started = Date.now();
  let lastSnapshot: unknown = null;
  while (Date.now() - started < maxWaitMs) {
    const outbox = await prisma.domainOutboxEvent.findUnique({ where: { id: OUTBOX_ID } });
    const contractInvoices = await prisma.invoice.findMany({
      where: { contractId: CONTRACT_ID },
      include: { lines: true, company: { select: { code: true } } },
    });
    lastSnapshot = { outbox1619: outbox, contractInvoices, waitedMs: Date.now() - started };
    if (outbox?.status === "PROCESSED" && contractInvoices.some((inv) => inv.invoiceType === "RENTAL")) {
      break;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  const seqAfter = await prisma.invoiceNumberSequence.findMany({
    include: { company: { select: { code: true } } },
  });
  const contract = await prisma.contract.findUnique({
    where: { id: CONTRACT_ID },
    select: { status: true, contractNumber: true, agreedAmount: true, companyId: true },
  });
  const rentalCount = await prisma.invoice.count({
    where: { contractId: CONTRACT_ID, invoiceType: "RENTAL" },
  });
  console.log(
    JSON.stringify(
      {
        phase: "after_wait",
        lastSnapshot,
        sequences: seqAfter,
        contract,
        rentalCount,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
