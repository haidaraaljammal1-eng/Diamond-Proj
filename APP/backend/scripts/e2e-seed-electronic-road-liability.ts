/**
 * Seeds an ELECTRONIC closed contract with an open chargeable road liability for Playwright E2E.
 * Usage: npx tsx scripts/e2e-seed-electronic-road-liability.ts [--consent=v1|v2]
 */
import "./e2e-script-env";
import { buildApp } from "src/app";
import { companyId as resolveCompanyId } from "tests/helpers/operating-company";
import { PAYMENT_CONSENT_SCOPE_V2 } from "src/modules/contracts/payment/payment-consent.catalog";
import {
  resetStripeAccountKeyCache,
  resolveStripeProviderAccountKey,
} from "src/modules/contracts/payment/stripe-account-identity";

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  const consent = arg("consent") ?? "v2";
  const withV2Scope = consent !== "v1";
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const app = await buildApp();
  const prisma = app.prisma;
  const company = await resolveCompanyId(prisma, "UNIQUE");

  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_e2e_fake";
  process.env.PAYMENT_PROVIDER = "stripe";
  resetStripeAccountKeyCache();
  const Stripe = (await import("stripe")).default;
  const { env } = await import("src/config/env");
  const stripeAccountKey = await resolveStripeProviderAccountKey(new Stripe(env.STRIPE_SECRET_KEY!));

  const customer = await prisma.customer.create({
    data: { name: `E2E ERL Customer ${run}`, mobile: `+9715100${run.slice(-6)}` },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      companyId: company,
      vehicleName: `E2E ERL ${run}`,
      plateNumber: `ERL ${run}`.slice(0, 16),
      modelYear: 2024,
      color: "White",
      dailyRate: 400,
      operationalStatus: "AVAILABLE",
    },
  });
  const contract = await prisma.contract.create({
    data: {
      companyId: company,
      contractNumber: `E2E-ERL-${run}`,
      status: "CLOSED",
      vehicleId: vehicle.id,
      customerId: customer.id,
      createdByUserId: 1,
      priceType: "DAILY",
      rentalDays: 1,
      agreedAmount: 500,
      collectionMode: "ELECTRONIC",
    },
  });

  const profile = await prisma.customerPaymentProfile.create({
    data: {
      customerId: customer.id,
      provider: "STRIPE",
      providerAccountKey: stripeAccountKey,
      livemode: false,
      providerCustomerId: `cus_e2e_${run}`,
    },
  });
  const method = await prisma.customerPaymentMethod.create({
    data: {
      profileId: profile.id,
      providerPaymentMethodId: `pm_e2e_${run}`,
      cardBrand: "visa",
      cardLast4: "4242",
      status: "ACTIVE",
    },
  });
  const payment = await prisma.contractPayment.create({
    data: {
      contractId: contract.id,
      purpose: "RENTAL",
      targetId: contract.id,
      amount: 500,
      currency: "AED",
      method: "CARD",
      status: "CONFIRMED",
      confirmedAt: new Date(),
    },
  });
  await prisma.contractPaymentAuthorization.create({
    data: {
      contractId: contract.id,
      customerId: customer.id,
      customerPaymentMethodId: method.id,
      sourcePaymentId: payment.id,
      consentVersion: withV2Scope ? "payment_method_authorization_v2" : "payment_method_authorization_v1",
      consentLocale: "en",
      consentTextHash: "hash",
      scope: withV2Scope ? PAYMENT_CONSENT_SCOPE_V2 : "contract_related_future_charges_v1",
      authorizedAt: new Date(),
    },
  });

  const liability = await prisma.roadLiability.create({
    data: {
      type: "RTA_VIOLATION",
      vehicleId: vehicle.id,
      occurredAt: new Date("2026-09-10T12:00:00.000Z"),
      amount: 520,
      currency: "AED",
      authoritativeSourceKey: "RTA",
      authoritativeExternalReference: `E2E-ERL-RTA-${run}`,
      confirmationStatus: "CONFIRMED",
      attributionStatus: "MATCHED",
      collectionStatus: "OPEN",
      attributedContractId: contract.id,
      confirmedAt: new Date(),
    },
  });

  console.log(
    `E2E_ELECTRONIC_RL_SEED_JSON=${JSON.stringify({
      liabilityId: liability.id,
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      vehicleId: vehicle.id,
      amount: 520,
      companyId: company,
      consent,
      offSessionEligible: withV2Scope,
    })}`,
  );
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
