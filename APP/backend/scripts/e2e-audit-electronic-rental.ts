/**
 * Audits an electronic rental after Playwright E2E settlement.
 * Usage: npx tsx scripts/e2e-audit-electronic-rental.ts --token=<rentalToken>
 */
import "./e2e-script-env";
import { buildApp } from "src/app";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  const token = arg("token");
  if (!token) throw new Error("Pass --token=<rentalToken>");

  const app = await buildApp();
  const prisma = app.prisma;

  const ctx = await app.inject({ method: "GET", url: `/contracts/rental/${token}` });
  if (ctx.statusCode !== 200) throw new Error(`Rental context failed (${ctx.statusCode})`);
  const contractNumber = ctx.json().data.contract.contractNumber as string;
  const contract = await prisma.contract.findFirst({
    where: { contractNumber },
    include: { payments: { where: { purpose: "RENTAL" }, orderBy: { createdAt: "asc" } } },
  });
  if (!contract) throw new Error(`Contract not found: ${contractNumber}`);

  const cardPayments = contract.payments.filter(
    (payment) => payment.method === "CARD" && payment.status === "CONFIRMED",
  );
  const cashPayments = contract.payments.filter(
    (payment) => payment.method === "CASH" && payment.status === "CONFIRMED",
  );
  const ledgerRows = cardPayments.length
    ? await prisma.financialLedgerEntry.findMany({
        where: {
          contractPaymentId: { in: cardPayments.map((payment) => payment.id) },
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
    cardConfirmedCount: cardPayments.length,
    cashConfirmedCount: cashPayments.length,
    cardPayment: cardPayments[0]
      ? {
          purpose: cardPayments[0].purpose,
          method: cardPayments[0].method,
          status: cardPayments[0].status,
          provider: cardPayments[0].provider,
          amount: cardPayments[0].amount,
        }
      : null,
    rentalPaymentLedgerCount: ledgerRows.length,
    ledgerCompanyId: ledgerRows[0]?.companyId ?? null,
    ledgerAmount: ledgerRows[0]?.amount ?? null,
  };

  console.log(`E2E_ELECTRONIC_RENTAL_AUDIT_JSON=${JSON.stringify(payload)}`);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
