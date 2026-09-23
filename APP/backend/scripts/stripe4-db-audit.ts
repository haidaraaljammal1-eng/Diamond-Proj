/**
 * Audits a rental contract payment settlement in DB.
 * Usage: npx tsx scripts/stripe4-db-audit.ts --contract=<uuid|DE-2026-000123>
 *        npx tsx scripts/stripe4-db-audit.ts --latest-consent-off=true
 */
import dotenv from "dotenv";

dotenv.config({ override: true });

import { buildApp } from "src/app";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  const app = await buildApp();
  const prisma = app.prisma;
  let key = arg("contract");
  if (arg("latest-consent-off") === "true") {
    const latest = await prisma.contractPayment.findFirst({
      where: {
        purpose: "RENTAL",
        status: "CONFIRMED",
        savePaymentMethodForFutureUse: false,
      },
      orderBy: { confirmedAt: "desc" },
      include: { contract: { select: { contractNumber: true } } },
    });
    if (!latest) throw new Error("No confirmed Consent OFF rental payment found");
    key = latest.contract.contractNumber;
    console.error(`Auditing latest Consent OFF payment: ${key}`);
  }
  if (!key) throw new Error("Pass --contract=<id|contractNumber> or --latest-consent-off=true");

  const contract = await prisma.contract.findFirst({
    where: key.startsWith("DE-") ? { contractNumber: key } : { id: key },
    include: {
      payments: { where: { purpose: "RENTAL" }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!contract) throw new Error(`Contract not found: ${key}`);

  const payment = contract.payments[0];
  const ledgerCount = payment
    ? await prisma.financialLedgerEntry.count({ where: { contractPaymentId: payment.id } })
    : 0;
  const authCount = payment
    ? await prisma.contractPaymentAuthorization.count({ where: { sourcePaymentId: payment.id } })
    : 0;
  const profile = contract.customerId
    ? await prisma.customerPaymentProfile.findFirst({
        where: { customerId: contract.customerId },
        orderBy: { createdAt: "desc" },
      })
    : null;
  const customerMethods = profile
    ? await prisma.customerPaymentMethod.count({ where: { profileId: profile.id } })
    : 0;

  const payload = {
        contractId: contract.id,
        contractNumber: contract.contractNumber,
        contractStatus: contract.status,
        customerId: contract.customerId,
        payment: payment
          ? {
              id: payment.id,
              status: payment.status,
              savePaymentMethodForFutureUse: payment.savePaymentMethodForFutureUse,
              providerReference: payment.providerReference,
              confirmedAt: payment.confirmedAt,
            }
          : null,
        rentalPaymentLedgerCount: ledgerCount,
        contractPaymentAuthorizationCount: authCount,
        customerPaymentMethodCount: customerMethods,
        stripeCustomerId: profile?.providerCustomerId ?? null,
  };
  console.log(`STRIPE4_AUDIT_JSON=${JSON.stringify(payload)}`);

  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
