/**
 * Seeds one staff-manual road-liability invoice on haidara_test and writes a Playwright fixture.
 * Usage: TEST_DATABASE_URL=.../haidara_test DATABASE_URL=$TEST_DATABASE_URL npx tsx scripts/seed-playwright-smc-invoice.ts
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { APPROVED_INVOICE_SEQUENCE_START } from "src/modules/invoices/invoices.constants";
import path from "node:path";
import assert from "node:assert/strict";
import { PERMISSIONS } from "src/constants/permissions";
import { PAYMENT_CONSENT_SCOPE_V2 } from "src/modules/contracts/payment/payment-consent.catalog";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import {
  resetStripeAccountKeyCache,
  resolveStripeProviderAccountKey,
} from "src/modules/contracts/payment/stripe-account-identity";
import { roadLiabilityInvoiceOriginKey } from "src/modules/invoices/invoices.constants";
import {
  assertTestDatabaseUrl,
  bindIntegrationDatabase,
  extractPostgresDatabaseName,
} from "tests/helpers/integration-harness";
import { configureTestInvoiceSequences, drainInvoiceOutbox } from "tests/helpers/invoice-integration";
import { createFakePaymentProvider } from "tests/helpers/fake-payment-provider";
import { companyId } from "tests/helpers/operating-company";
import { cleanupStaffManualChargeRunArtifacts } from "tests/helpers/staff-manual-charge-cleanup";

bindIntegrationDatabase();
assertTestDatabaseUrl(process.env.DATABASE_URL!);
assert.equal(extractPostgresDatabaseName(process.env.DATABASE_URL!), "haidara_test");

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_integration_fake";
process.env.PAYMENT_PROVIDER = "stripe";

const run = `PW-INV-${Date.now().toString(36).toUpperCase()}`;
const adminEmail = `smc-admin-${run}@test.local`;
const adminPassword = "pass-12345";
const fixturePath = path.resolve(
  __dirname,
  "../../frontend/e2e/.fixtures/smc-invoice-haidara-test.json",
);

async function main() {
  try {
    const existing = await readFile(fixturePath, "utf8");
    const prior = JSON.parse(existing) as {
      run: string;
      cleanup: {
        contractIds: string[];
        customerId: number;
        vehicleIds: number[];
        adminEmail: string;
      };
    };
    const { PrismaClient } = await import("@prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
    const cleanupPrisma = new PrismaClient({ adapter });
    await cleanupStaffManualChargeRunArtifacts(cleanupPrisma, {
      run: prior.run,
      contractIds: prior.cleanup.contractIds,
      customerId: prior.cleanup.customerId,
      vehicleIds: prior.cleanup.vehicleIds,
      adminEmail: prior.cleanup.adminEmail,
    });
    await cleanupPrisma.$disconnect();
  } catch {
    // no prior fixture
  }

  const { buildApp } = await import("src/app");
  const app = await buildApp();
  const prisma = app.prisma;
  const fakePayments = createFakePaymentProvider(run);
  setPaymentProviderForTests(fakePayments.provider);
  resetStripeAccountKeyCache();
  const { env } = await import("src/config/env");
  const Stripe = (await import("stripe")).default;
  const stripeAccountKey = await resolveStripeProviderAccountKey(new Stripe(env.STRIPE_SECRET_KEY!));

  const { hashPassword } = await import("src/lib/security/password");
  const { normalizeEmail } = await import("src/lib/security/normalize");
  const role = await prisma.role.upsert({
    where: { key: `smc_admin_${run}` },
    update: {},
    create: { key: `smc_admin_${run}`, name: `smc_admin_${run}` },
  });
  for (const key of [PERMISSIONS.VIOLATIONS_CHARGE, PERMISSIONS.INVOICES_READ, "vehicles.manage"]) {
    const perm = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, category: key.split(".")[0], description: key },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      update: {},
      create: { roleId: role.id, permissionId: perm.id },
    });
  }
  const passwordHash = await hashPassword(adminPassword);
  await prisma.user.upsert({
    where: { email: normalizeEmail(adminEmail) },
    update: { status: "ACTIVE", passwordHash },
    create: { email: normalizeEmail(adminEmail), name: `smc_admin_${run}`, status: "ACTIVE", passwordHash },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email: normalizeEmail(adminEmail) } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  const loginRes = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: adminEmail, password: adminPassword },
  });
  assert.equal(loginRes.statusCode, 200);
  const token = loginRes.json().data.accessToken as string;

  const maxInvoice = await prisma.invoice.aggregate({
    _max: { invoiceNumber: true },
    where: { companyId: await companyId(prisma, "ELITE") },
  });
  const sequenceStart = Math.max(
    APPROVED_INVOICE_SEQUENCE_START,
    (maxInvoice._max.invoiceNumber ?? 0) + 1,
  );
  await configureTestInvoiceSequences(prisma, sequenceStart);
  const eliteCompanyId = await companyId(prisma, "ELITE");
  const vehicleRes = await app.inject({
    method: "POST",
    url: "/vehicles",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      companyId: eliteCompanyId,
      vehicleName: `SMC PW ${run}`,
      plateNumber: `PW${run.slice(-6)}`,
      modelYear: 2024,
    },
  });
  assert.equal(vehicleRes.statusCode, 201);
  const vehicleId = vehicleRes.json().data.id as number;

  const customer = await prisma.customer.create({
    data: { name: `SMC Customer ${run}`, mobile: "+971500088877" },
  });
  const carInAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const contract = await prisma.contract.create({
    data: {
      companyId: eliteCompanyId,
      contractNumber: `SMC-${run}`,
      status: "REVIEW",
      vehicleId,
      customerId: customer.id,
      createdByUserId: user.id,
      priceType: "DAILY",
      rentalDays: 3,
      durationValue: 3,
      durationUnit: "DAY",
      agreedAmount: 1200,
      collectionMode: "ELECTRONIC",
      carOut: {
        create: {
          performedByUserId: user.id,
          occurredAt: new Date(carInAt.getTime() - 3 * 24 * 60 * 60 * 1000),
          mileageOut: 100,
          fuelOut: "F",
        },
      },
      carIn: { create: { occurredAt: carInAt, mileageIn: 200, fuelIn: "1/2" } },
    },
  });

  const profile = await prisma.customerPaymentProfile.create({
    data: {
      customerId: customer.id,
      provider: "STRIPE",
      providerAccountKey: stripeAccountKey,
      livemode: false,
      providerCustomerId: `cus_pw_${run}`,
    },
  });
  const method = await prisma.customerPaymentMethod.create({
    data: {
      profileId: profile.id,
      providerPaymentMethodId: `pm_pw_${contract.id}`,
      cardBrand: "visa",
      cardLast4: "4242",
      status: "ACTIVE",
    },
  });
  const rentalPayment = await prisma.contractPayment.create({
    data: {
      contractId: contract.id,
      purpose: "RENTAL",
      targetId: contract.id,
      amount: 1000,
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
      sourcePaymentId: rentalPayment.id,
      consentVersion: "payment_method_authorization_v2",
      consentLocale: "en",
      consentTextHash: "hash",
      scope: PAYMENT_CONSENT_SCOPE_V2,
      authorizedAt: new Date(),
    },
  });

  const idem = `pw-inv-${run}`;
  const chargeRes = await app.inject({
    method: "POST",
    url: `/road-liabilities/returned-contracts/${contract.id}/manual-charge`,
    headers: { authorization: `Bearer ${token}`, "idempotency-key": idem },
    payload: { chargeCategory: "TRAFFIC_VIOLATION", amountAed: 350 },
  });
  assert.equal(chargeRes.statusCode, 200, chargeRes.body);
  const roadLiabilityId = chargeRes.json().data.roadLiabilityId as string;
  const charge = await prisma.roadLiabilityCustomerCharge.findUniqueOrThrow({
    where: { roadLiabilityId },
  });
  await drainInvoiceOutbox(app);
  const invoice = await prisma.invoice.findFirstOrThrow({
    where: { originEventKey: roadLiabilityInvoiceOriginKey(charge.id) },
    include: { company: true },
  });

  const fixture = {
    run,
    adminEmail,
    adminPassword,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    contractId: contract.id,
    contractNumber: contract.contractNumber,
    totalAmount: invoice.totalAmount,
    companyCode: invoice.company.code,
    companyDisplayName: invoice.company.displayName,
    invoiceType: invoice.invoiceType,
    cleanup: {
      contractIds: [contract.id],
      customerId: customer.id,
      vehicleIds: [vehicleId],
      adminEmail,
    },
  };

  await mkdir(path.dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  console.log(`Wrote fixture: ${fixturePath}`);
  console.log(JSON.stringify({ invoiceNumber: invoice.invoiceNumber, contractNumber: contract.contractNumber }));

  if (process.env.SEED_CLEANUP_AFTER === "1") {
    await cleanupStaffManualChargeRunArtifacts(prisma, {
      run,
      contractIds: fixture.cleanup.contractIds,
      customerId: fixture.cleanup.customerId,
      vehicleIds: fixture.cleanup.vehicleIds,
      adminEmail: fixture.cleanup.adminEmail,
    });
  }
  setPaymentProviderForTests(undefined);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
