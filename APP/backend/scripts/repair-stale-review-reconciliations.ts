/**
 * Closes REVIEW contracts whose reconciliation is already settled but the contract
 * was never transitioned to CLOSED (legacy data before auto-close).
 *
 * Report only:  npx tsx scripts/repair-stale-review-reconciliations.ts
 * Apply repair: npx tsx scripts/repair-stale-review-reconciliations.ts --apply
 */
import dotenv from "dotenv";

dotenv.config({ override: true });

import { buildApp } from "src/app";
import { withTransaction } from "src/lib/db/transaction";
import {
  finalizeReconciliationAndCloseInTx,
  isReconciliationFinalized,
} from "src/modules/contracts/contracts-reconciliation";

const APPLY = process.argv.includes("--apply");

async function main() {
  const app = await buildApp();
  const prisma = app.prisma;

  const candidates = await prisma.contract.findMany({
    where: {
      status: "REVIEW",
      carIn: { isNot: null },
      reconciliation: { settledAt: { not: null } },
    },
    select: {
      id: true,
      contractNumber: true,
      vehicleId: true,
      reconciliation: {
        select: {
          id: true,
          chargesTotal: true,
          settledAt: true,
          settledPaymentId: true,
          finalizedAt: true,
          approvedAt: true,
          settledPayment: { select: { status: true, purpose: true } },
        },
      },
    },
    orderBy: { contractNumber: "asc" },
  });

  const repairable = candidates.filter((row) => {
    const reconciliation = row.reconciliation;
    if (!reconciliation) return false;
    if (!isReconciliationFinalized(reconciliation)) return false;
    if (reconciliation.chargesTotal > 0 && reconciliation.settledPaymentId) {
      return reconciliation.settledPayment?.status === "CONFIRMED";
    }
    return true;
  });

  console.log(`Found ${candidates.length} REVIEW + settledAt contract(s).`);
  console.log(`${repairable.length} eligible for safe close.`);
  for (const row of repairable) {
    console.log(
      JSON.stringify({
        contractNumber: row.contractNumber,
        id: row.id,
        finalAmount: row.reconciliation?.chargesTotal ?? null,
        settledPaymentStatus: row.reconciliation?.settledPayment?.status ?? null,
      }),
    );
  }

  if (!APPLY) {
    console.log("\nDry run only. Pass --apply to close eligible contracts.");
    await app.close();
    return;
  }

  let closed = 0;
  for (const row of repairable) {
    const outcome = await withTransaction(prisma, async (tx) =>
      finalizeReconciliationAndCloseInTx(tx, row.id),
    );
    if (outcome.closed) closed += 1;
  }

  console.log(`\nClosed ${closed} contract(s).`);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
