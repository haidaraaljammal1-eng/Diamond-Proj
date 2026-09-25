/**
 * Reports contracts stuck in REVIEW with settled reconciliation.
 * Usage: npx tsx scripts/audit-reconciliation-close-state.ts
 */
import dotenv from "dotenv";

dotenv.config({ override: true });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const inconsistent = await prisma.contract.findMany({
    where: { status: "REVIEW", reconciliation: { settledAt: { not: null } } },
    select: {
      id: true,
      contractNumber: true,
      status: true,
      reconciliation: {
        select: {
          finalizedAt: true,
          approvedAt: true,
          settledAt: true,
          settledPaymentId: true,
          finalAmount: true,
          settledPayment: { select: { status: true, purpose: true, method: true } },
        },
      },
      carIn: { select: { id: true } },
    },
    orderBy: { contractNumber: "asc" },
  });

  console.log("REVIEW + settledAt count:", inconsistent.length);
  for (const c of inconsistent) {
    console.log(
      JSON.stringify({
        contractNumber: c.contractNumber,
        id: c.id,
        status: c.status,
        hasCarIn: Boolean(c.carIn),
        finalizedAt: c.reconciliation?.finalizedAt?.toISOString() ?? null,
        settledAt: c.reconciliation?.settledAt?.toISOString() ?? null,
        settledPaymentId: c.reconciliation?.settledPaymentId,
        paymentStatus: c.reconciliation?.settledPayment?.status ?? null,
        paymentPurpose: c.reconciliation?.settledPayment?.purpose ?? null,
        finalAmount: c.reconciliation?.finalAmount ?? null,
      }),
    );
  }

  const closedSettled = await prisma.contract.count({
    where: { status: "CLOSED", reconciliation: { settledAt: { not: null } } },
  });
  const reviewUnsettled = await prisma.contract.count({
    where: { status: "REVIEW", reconciliation: { settledAt: null, finalizedAt: { not: null } } },
  });
  console.log("CLOSED + settled:", closedSettled);
  console.log("REVIEW + finalized but unsettled:", reviewUnsettled);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
