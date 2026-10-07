/** READ-ONLY one-off diagnostic — safe to delete after review. */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { normalizedNameExtension } from "src/lib/db/prisma-extensions";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter }).$extends(normalizedNameExtension);

async function main() {
  const closed = await prisma.contract.findMany({
    where: { status: "CLOSED" },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: {
      id: true,
      contractNumber: true,
      status: true,
      companyId: true,
      customerId: true,
      vehicleId: true,
      agreedAmount: true,
      createdAt: true,
      updatedAt: true,
      closedAt: true,
      company: { select: { code: true, displayName: true } },
      acceptance: { select: { acceptedAt: true, createdAt: true } },
      officialSignatures: {
        select: { capturedAt: true, slot: true },
        orderBy: { capturedAt: "asc" },
      },
    },
  });

  const target = closed[0];
  if (!target) {
    console.log(JSON.stringify({ error: "NO_CLOSED_CONTRACTS" }, null, 2));
    return;
  }

  const cid = target.id;
  const allSignedForContract = await prisma.domainOutboxEvent.findMany({
    where: { eventType: "contract.signed", aggregateId: cid },
    orderBy: { id: "asc" },
  });

  const outboxAggregate = await prisma.domainOutboxEvent.findMany({
    where: { aggregateType: "contract", aggregateId: cid },
    orderBy: { id: "asc" },
  });

  const sequences = await prisma.invoiceNumberSequence.findMany({
    include: { company: { select: { code: true } } },
  });

  const invoices = await prisma.invoice.findMany({
    where: { contractId: cid },
    include: { lines: true },
    orderBy: { createdAt: "asc" },
  });

  const audits = await prisma.auditLog.findMany({
    where: { entityType: "contract", entityId: cid },
    orderBy: { createdAt: "asc" },
    take: 80,
    select: { id: true, action: true, createdAt: true, metadata: true },
  });

  const recentAny = await prisma.contract.findMany({
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: {
      id: true,
      contractNumber: true,
      status: true,
      updatedAt: true,
      company: { select: { code: true } },
    },
  });

  const pendingSigned = await prisma.domainOutboxEvent.findMany({
    where: { eventType: "contract.signed", status: { in: ["PENDING", "FAILED", "PROCESSING"] } },
    orderBy: { id: "desc" },
    take: 20,
  });

  const failedInvoiceOutbox = await prisma.domainOutboxEvent.findMany({
    where: {
      eventType: { in: ["contract.signed", "road_liability.customer_charge.confirmed", "reconciliation.finalized"] },
      OR: [{ status: "FAILED" }, { lastErrorCode: { not: null } }],
    },
    orderBy: { id: "desc" },
    take: 20,
  });

  const totalInvoices = await prisma.invoice.count();

  console.log(
    JSON.stringify(
      {
        recentContractsTop10: recentAny,
        pendingOrFailedContractSigned: pendingSigned,
        invoiceOutboxWithErrors: failedInvoiceOutbox,
        totalInvoiceCount: totalInvoices,
        latestClosedTop5: closed.map((c) => ({
          id: c.id,
          contractNumber: c.contractNumber,
          updatedAt: c.updatedAt,
          closedAt: c.closedAt,
        })),
        contract: target,
        outboxContractSigned: allSignedForContract,
        outboxAllForAggregate: outboxAggregate,
        invoiceSequences: sequences.map((s) => ({
          companyCode: s.company.code,
          companyId: s.companyId,
          nextNumber: s.nextNumber,
        })),
        invoices,
        auditSample: audits,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
