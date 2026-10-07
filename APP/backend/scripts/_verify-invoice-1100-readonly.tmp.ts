/** READ-ONLY closure verification */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";

const INVOICE_ID = "269c8186-08eb-4a1f-83a0-fd061dfea4c0";
const CONTRACT_ID = "4cb0e8d5-9c7e-47b3-9390-0764ededeac4";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

async function main() {
  const db = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  const invoice = await prisma.invoice.findUnique({
    where: { id: INVOICE_ID },
    include: { lines: true, company: { select: { code: true } } },
  });
  const sequences = await prisma.invoiceNumberSequence.findMany({
    include: { company: { select: { code: true } } },
  });
  const contract = await prisma.contract.findUnique({
    where: { id: CONTRACT_ID },
    select: { status: true, contractNumber: true, agreedAmount: true },
  });
  const outbox = await prisma.domainOutboxEvent.findUnique({ where: { id: 1619 } });
  const invoiceCount = await prisma.invoice.count();
  const deliveries = await prisma.invoiceDelivery.findMany({ where: { invoiceId: INVOICE_ID } });
  console.log(
    JSON.stringify(
      { database: db[0]?.current_database, invoiceCount, invoice, sequences, contract, outbox1619: outbox, deliveries },
      null,
      2,
    ),
  );
}

main().finally(() => prisma.$disconnect());
