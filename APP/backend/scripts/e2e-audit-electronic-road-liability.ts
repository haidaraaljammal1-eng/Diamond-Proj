/**
 * Audits electronic road liability collection after Playwright E2E.
 * Usage: npx tsx scripts/e2e-audit-electronic-road-liability.ts --liability=<id>
 */
import "./e2e-script-env";
import { buildApp } from "src/app";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  const liabilityId = arg("liability");
  if (!liabilityId) throw new Error("Pass --liability=<roadLiabilityId>");

  const app = await buildApp();
  const prisma = app.prisma;

  const liability = await prisma.roadLiability.findUnique({
    where: { id: liabilityId },
    include: { customerCharge: true },
  });
  if (!liability) throw new Error(`Liability not found: ${liabilityId}`);

  const payment = await prisma.contractPayment.findFirst({
    where: { purpose: "ROAD_LIABILITY", targetId: liability.customerCharge?.id, status: "CONFIRMED" },
  });
  const ledger = payment
    ? await prisma.financialLedgerEntry.findFirst({
        where: { contractPaymentId: payment.id, kind: "ROAD_LIABILITY_PAYMENT" },
      })
    : null;
  const contract = await prisma.contract.findUnique({ where: { id: liability.attributedContractId! } });

  const payload = {
    liabilityId,
    collectionStatus: liability.collectionStatus,
    contractId: liability.attributedContractId,
    contractStatus: contract?.status ?? null,
    contractCollectionMode: contract?.collectionMode ?? null,
    chargeOperationalState: liability.customerCharge?.operationalState ?? null,
    settlementChannel: liability.customerCharge?.settlementChannel ?? null,
    roadLiabilityPaymentCount: payment ? 1 : 0,
    payment: payment
      ? {
          purpose: payment.purpose,
          method: payment.method,
          status: payment.status,
          provider: payment.provider,
          amount: payment.amount,
        }
      : null,
    ledgerCount: ledger ? 1 : 0,
    ledgerCompanyId: ledger?.companyId ?? null,
    ledgerAmount: ledger?.amount ?? null,
  };

  console.log(`E2E_ELECTRONIC_RL_AUDIT_JSON=${JSON.stringify(payload)}`);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
