/**
 * Audits a CASH rental contract after public E2E completion.
 * Usage: npx tsx scripts/cash-rental-db-audit.ts --token=<rentalToken>
 *        npx tsx scripts/cash-rental-db-audit.ts --contract=<uuid|DE-2026-000123>
 */
import dotenv from "dotenv";

dotenv.config({ override: true });

import { buildApp } from "src/app";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  const token = arg("token");
  const contractKey = arg("contract");
  if (!token && !contractKey) {
    throw new Error("Pass --token=<rentalToken> or --contract=<id|contractNumber>");
  }

  const app = await buildApp();
  const prisma = app.prisma;

  let contractId = contractKey;
  if (token) {
    const ctx = await app.inject({ method: "GET", url: `/contracts/rental/${token}` });
    if (ctx.statusCode !== 200) {
      throw new Error(`Rental context failed (${ctx.statusCode}): ${ctx.body}`);
    }
    const contractNumber = ctx.json().data.contract.contractNumber as string;
    const row = await prisma.contract.findFirst({
      where: { contractNumber },
      select: { id: true },
    });
    if (!row) throw new Error(`Contract not found for token: ${contractNumber}`);
    contractId = row.id;
  }

  const contract = await prisma.contract.findFirst({
    where: contractId!.startsWith("DE-")
      ? { contractNumber: contractId }
      : { id: contractId },
    include: {
      payments: { where: { purpose: "RENTAL" }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!contract) throw new Error(`Contract not found: ${contractId}`);

  const cashPayments = contract.payments.filter(
    (payment) => payment.method === "CASH" && payment.status === "CONFIRMED",
  );
  const ledgerRows = cashPayments.length
    ? await prisma.financialLedgerEntry.findMany({
        where: {
          contractPaymentId: { in: cashPayments.map((payment) => payment.id) },
          kind: "RENTAL_PAYMENT",
        },
      })
    : [];

  const payload = {
    contractId: contract.id,
    contractNumber: contract.contractNumber,
    contractStatus: contract.status,
    companyId: contract.companyId,
    collectionMode: contract.collectionMode,
    rentalPaymentCount: contract.payments.length,
    cashConfirmedCount: cashPayments.length,
    cashPayment: cashPayments[0]
      ? {
          id: cashPayments[0].id,
          purpose: cashPayments[0].purpose,
          method: cashPayments[0].method,
          status: cashPayments[0].status,
          provider: cashPayments[0].provider,
          amount: cashPayments[0].amount,
        }
      : null,
    rentalPaymentLedgerCount: ledgerRows.length,
    ledgerCompanyId: ledgerRows[0]?.companyId ?? null,
    ledgerAmount: ledgerRows[0]?.amount ?? null,
  };

  console.log(`CASH_RENTAL_AUDIT_JSON=${JSON.stringify(payload)}`);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
