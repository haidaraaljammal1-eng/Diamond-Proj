import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "src/constants/permissions";
import {
  PAYMENT_CONSENT_SCOPE_V1,
  PAYMENT_CONSENT_SCOPE_V2,
} from "src/modules/contracts/payment/payment-consent.catalog";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import {
  resetStripeAccountKeyCache,
  resolveStripeProviderAccountKey,
} from "src/modules/contracts/payment/stripe-account-identity";
import { createFakePaymentProvider } from "tests/helpers/fake-payment-provider";
import {
  bindIntegrationDatabase,
  extractPostgresDatabaseName,
  INTEGRATION_ENABLED,
} from "tests/helpers/integration-harness";
import { companyId, type CompanyCode } from "tests/helpers/operating-company";
import { configureTestInvoiceSequences, drainInvoiceOutbox } from "tests/helpers/invoice-integration";
import { cleanupStaffManualChargeRunArtifacts } from "tests/helpers/staff-manual-charge-cleanup";

if (!INTEGRATION_ENABLED) {
  test("staff manual charge financial integration skipped", { skip: true });
} else {
  bindIntegrationDatabase();
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_integration_fake";
  process.env.PAYMENT_PROVIDER = "stripe";

  describe("staff manual charge — financial integration (haidara_test only)", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = `SMC-${Date.now().toString(36).toUpperCase()}`;
    const createdContractIds: string[] = [];
    const createdVehicleIds: number[] = [];
    let adminToken = "";
    let readOnlyToken = "";
    let adminUserId = 0;
    const adminEmail = () => `smc-admin-${run}@test.local`;
    const readOnlyEmail = () => `smc-read-${run}@test.local`;
    let vehicleByCompany = new Map<CompanyCode, number>();
    let customerId = 0;
    let fakePayments: ReturnType<typeof createFakePaymentProvider>;
    let stripeAccountKey = "test";

    const auth = (token: string) => ({ authorization: `Bearer ${token}` });

    async function seedUser(
      email: string,
      password: string,
      roleKey: string,
      perms: string[],
    ): Promise<number> {
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      const canonicalEmail = normalizeEmail(email);
      const role = await prisma.role.upsert({
        where: { key: roleKey },
        update: {},
        create: { key: roleKey, name: roleKey },
      });
      for (const key of perms) {
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
      const passwordHash = await hashPassword(password);
      await prisma.user.upsert({
        where: { email: canonicalEmail },
        update: { status: "ACTIVE", passwordHash },
        create: { email: canonicalEmail, name: roleKey, status: "ACTIVE", passwordHash },
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { email: canonicalEmail } });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
      return user.id;
    }

    async function login(email: string, password: string) {
      const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
      assert.equal(res.statusCode, 200, res.body);
      return res.json().data.accessToken as string;
    }

    async function ensureAuthorization(contractId: string, v2 = true) {
      const contract = await prisma.contract.findUniqueOrThrow({
        where: { id: contractId },
        select: { customerId: true },
      });
      const profile = await prisma.customerPaymentProfile.upsert({
        where: {
          customerId_provider_providerAccountKey_livemode: {
            customerId: contract.customerId!,
            provider: "STRIPE",
            providerAccountKey: stripeAccountKey,
            livemode: false,
          },
        },
        update: { providerCustomerId: `cus_smc_${run}`, providerAccountKey: stripeAccountKey },
        create: {
          customerId: contract.customerId!,
          provider: "STRIPE",
          providerAccountKey: stripeAccountKey,
          livemode: false,
          providerCustomerId: `cus_smc_${run}`,
        },
      });
      const method = await prisma.customerPaymentMethod.create({
        data: {
          profileId: profile.id,
          providerPaymentMethodId: `pm_smc_${contractId}`,
          cardBrand: "visa",
          cardLast4: "4242",
          status: "ACTIVE",
        },
      });
      const rentalPayment =
        (await prisma.contractPayment.findFirst({
          where: { contractId, purpose: "RENTAL", status: "CONFIRMED" },
        })) ??
        (await prisma.contractPayment.create({
          data: {
            contractId,
            purpose: "RENTAL",
            targetId: contractId,
            amount: 1000,
            currency: "AED",
            method: "CARD",
            status: "CONFIRMED",
            confirmedAt: new Date(),
          },
        }));
      await prisma.contractPaymentAuthorization.create({
        data: {
          contractId,
          customerId: contract.customerId!,
          customerPaymentMethodId: method.id,
          sourcePaymentId: rentalPayment.id,
          consentVersion: v2 ? "payment_method_authorization_v2" : "payment_method_authorization_v1",
          consentLocale: "en",
          consentTextHash: "hash",
          scope: v2 ? PAYMENT_CONSENT_SCOPE_V2 : PAYMENT_CONSENT_SCOPE_V1,
          authorizedAt: new Date(),
        },
      });
    }

    async function seedReturnedContract(input: {
      companyCode: CompanyCode;
      suffix: string;
      status: "REVIEW" | "CLOSED";
      carInAt: Date;
      collectionMode: "ELECTRONIC" | "CASH";
    }) {
      const cid = await companyId(prisma, input.companyCode);
      const vehicleId = vehicleByCompany.get(input.companyCode)!;
      const contract = await prisma.contract.create({
        data: {
          companyId: cid,
          contractNumber: `SMC-${run}-${input.suffix}`,
          status: input.status,
          vehicleId,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 3,
          durationValue: 3,
          durationUnit: "DAY",
          agreedAmount: 1200,
          collectionMode: input.collectionMode,
          carOut: {
            create: {
              performedByUserId: adminUserId,
              occurredAt: new Date(input.carInAt.getTime() - 3 * 24 * 60 * 60 * 1000),
              mileageOut: 100,
              fuelOut: "F",
            },
          },
          carIn: {
            create: {
              occurredAt: input.carInAt,
              mileageIn: 250,
              fuelIn: "1/2",
            },
          },
        },
      });
      createdContractIds.push(contract.id);
      if (input.collectionMode === "ELECTRONIC") {
        await ensureAuthorization(contract.id, true);
      } else {
        await prisma.contractPayment.create({
          data: {
            contractId: contract.id,
            purpose: "RENTAL",
            targetId: contract.id,
            amount: 1200,
            currency: "AED",
            method: "CASH",
            status: "CONFIRMED",
            confirmedAt: new Date(),
          },
        });
      }
      return contract;
    }

    async function postManualCharge(
      contractId: string,
      body: { chargeCategory: "TRAFFIC_VIOLATION" | "SALIK"; amountAed: number },
      idempotencyKey: string,
      token = adminToken,
    ) {
      return app.inject({
        method: "POST",
        url: `/road-liabilities/returned-contracts/${contractId}/manual-charge`,
        headers: { ...auth(token), "idempotency-key": idempotencyKey },
        payload: body,
      });
    }

    async function assertSuccessfulChargePipeline(input: {
      contractId: string;
      roadLiabilityId: string;
      amountAed: number;
      companyCode: CompanyCode;
      category: "TRAFFIC_VIOLATION" | "SALIK";
      expectedServiceLabel: string;
    }) {
      const liability = await prisma.roadLiability.findUniqueOrThrow({
        where: { id: input.roadLiabilityId },
      });
      assert.equal(liability.authoritativeSourceKey, "STAFF_MANUAL");
      assert.equal(liability.staffChargeCategory, input.category);
      assert.equal(liability.amount, input.amountAed);

      const charge = await prisma.roadLiabilityCustomerCharge.findUniqueOrThrow({
        where: { roadLiabilityId: input.roadLiabilityId },
      });
      assert.equal(charge.destinationType, "DIRECT_COLLECTION");
      assert.equal(charge.operationalState, "PAID");
      assert.equal(charge.customerChargeAmount, input.amountAed);

      const payments = await prisma.contractPayment.findMany({
        where: { contractId: input.contractId, purpose: "ROAD_LIABILITY", status: "CONFIRMED" },
      });
      assert.equal(payments.length, 1);
      assert.equal(payments[0]!.amount, input.amountAed);
      assert.equal(payments[0]!.method, "CARD");

      const ledger = await prisma.financialLedgerEntry.findMany({
        where: { contractId: input.contractId, kind: "ROAD_LIABILITY_PAYMENT" },
      });
      assert.equal(ledger.length, 1);
      assert.equal(ledger[0]!.amount, input.amountAed);

      const outboxPending = await prisma.domainOutboxEvent.count({
        where: {
          dedupeKey: `road_liability.customer_charge.confirmed:${charge.id}`,
        },
      });
      assert.equal(outboxPending, 1);

      const drained = await drainInvoiceOutbox(app);
      let invoice = await prisma.invoice.findFirst({
        where: { contractId: input.contractId, isCurrent: true },
        include: { lines: true, company: true },
      });
      if (!invoice?.lines.some((line) => line.sourceId === charge.id)) {
        assert.ok(drained >= 1, "invoice outbox should issue consolidated invoice");
        invoice = await prisma.invoice.findFirst({
          where: { contractId: input.contractId, isCurrent: true },
          include: { lines: true, company: true },
        });
      }
      assert.ok(invoice, "current consolidated invoice expected");
      assert.equal(invoice!.isCurrent, true);
      assert.equal(invoice!.contractId, input.contractId);
      const expectedCompanyId = await companyId(prisma, input.companyCode);
      assert.equal(invoice!.companyId, expectedCompanyId);
      const rlLine = invoice!.lines.find((line) => line.sourceId === charge.id);
      assert.ok(rlLine, "road liability line on consolidated invoice");
      assert.equal(rlLine!.amount, input.amountAed);
      assert.match(rlLine!.serviceLabel ?? "", new RegExp(input.expectedServiceLabel, "i"));
      assert.ok(invoice!.totalAmount >= input.amountAed);

      const secondDrain = await drainInvoiceOutbox(app);
      const currentCount = await prisma.invoice.count({
        where: { contractId: input.contractId, isCurrent: true },
      });
      assert.equal(currentCount, 1);

      const listRes = await app.inject({
        method: "GET",
        url: `/invoices?contractId=${input.contractId}`,
        headers: auth(adminToken),
      });
      assert.equal(listRes.statusCode, 200, listRes.body);
      const items = listRes.json().data as { id: string; totalAmount: number; isCurrent: boolean }[];
      assert.ok(items.some((row) => row.id === invoice!.id && row.isCurrent));

      return { charge, payment: payments[0]!, invoice, secondDrain };
    }

    before(async () => {
      const dbName = extractPostgresDatabaseName(process.env.DATABASE_URL ?? "");
      assert.equal(dbName, "haidara_test");

      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      fakePayments = createFakePaymentProvider(run);
      setPaymentProviderForTests(fakePayments.provider);
      resetStripeAccountKeyCache();
      const { env } = await import("src/config/env");
      const Stripe = (await import("stripe")).default;
      stripeAccountKey = await resolveStripeProviderAccountKey(new Stripe(env.STRIPE_SECRET_KEY!));

      adminUserId = await seedUser(`smc-admin-${run}@test.local`, "pass-12345", `smc_admin_${run}`, [
        PERMISSIONS.VIOLATIONS_READ,
        PERMISSIONS.VIOLATIONS_CHARGE,
        PERMISSIONS.INVOICES_READ,
        "vehicles.manage",
      ]);
      await seedUser(`smc-read-${run}@test.local`, "pass-12345", `smc_read_${run}`, [
        PERMISSIONS.VIOLATIONS_READ,
      ]);
      adminToken = await login(`smc-admin-${run}@test.local`, "pass-12345");
      readOnlyToken = await login(`smc-read-${run}@test.local`, "pass-12345");

      await configureTestInvoiceSequences(prisma);

      for (const code of ["ELITE", "UNIQUE"] as const) {
        const cid = await companyId(prisma, code);
        const vehicleRes = await app.inject({
          method: "POST",
          url: "/vehicles",
          headers: auth(adminToken),
          payload: {
            companyId: cid,
            vehicleName: `SMC ${code} ${run}`,
            plateNumber: `S${code[0]}${run.slice(-8)}`,
            modelYear: 2024,
          },
        });
        assert.equal(vehicleRes.statusCode, 201, vehicleRes.body);
        const vehicleId = vehicleRes.json().data.id as number;
        vehicleByCompany.set(code, vehicleId);
        createdVehicleIds.push(vehicleId);
      }

      const customer = await prisma.customer.create({
        data: { name: `SMC Customer ${run}`, mobile: "+971500099900" },
      });
      customerId = customer.id;
    });

    after(async () => {
      await cleanupStaffManualChargeRunArtifacts(prisma, {
        run,
        contractIds: [...createdContractIds],
        customerId,
        vehicleIds: [...createdVehicleIds],
        adminEmail: adminEmail(),
        readOnlyEmail: readOnlyEmail(),
      });
      setPaymentProviderForTests(undefined);
      await app.close();
    });

    test("TRAFFIC_VIOLATION 350 AED — ELITE payment, ledger, invoice, API list", async () => {
      const carInAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const contract = await seedReturnedContract({
        companyCode: "ELITE",
        suffix: "TV-ELITE",
        status: "REVIEW",
        carInAt,
        collectionMode: "ELECTRONIC",
      });
      const idem = `smc-tv-${run}`;
      const res = await postManualCharge(
        contract.id,
        { chargeCategory: "TRAFFIC_VIOLATION", amountAed: 350 },
        idem,
      );
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.json().data.status, "succeeded");
      const roadLiabilityId = res.json().data.roadLiabilityId as string;
      const { invoice } = await assertSuccessfulChargePipeline({
        contractId: contract.id,
        roadLiabilityId,
        amountAed: 350,
        companyCode: "ELITE",
        category: "TRAFFIC_VIOLATION",
        expectedServiceLabel: "Traffic Violation",
      });
      await drainInvoiceOutbox(app);
      const currentAfter = await prisma.invoice.findFirstOrThrow({
        where: { contractId: contract.id, isCurrent: true },
      });
      assert.equal(currentAfter.id, invoice!.id);
      const stillReview = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
      assert.equal(stillReview.status, "REVIEW");
    });

    test("SALIK 350 AED — UNIQUE separate invoice numbering", async () => {
      const carInAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const contract = await seedReturnedContract({
        companyCode: "UNIQUE",
        suffix: "SL-UNQ",
        status: "CLOSED",
        carInAt,
        collectionMode: "ELECTRONIC",
      });
      const res = await postManualCharge(
        contract.id,
        { chargeCategory: "SALIK", amountAed: 350 },
        `smc-salik-${run}`,
      );
      assert.equal(res.statusCode, 200, res.body);
      const roadLiabilityId = res.json().data.roadLiabilityId as string;
      const { invoice } = await assertSuccessfulChargePipeline({
        contractId: contract.id,
        roadLiabilityId,
        amountAed: 350,
        companyCode: "UNIQUE",
        category: "SALIK",
        expectedServiceLabel: "Salik",
      });
      assert.ok(invoice!.invoiceNumber);
      const closed = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
      assert.equal(closed.status, "CLOSED");
    });

    test("idempotency-key replay and concurrent duplicate do not double charge", async () => {
      fakePayments.resetOffSessionCallCount();
      const contract = await seedReturnedContract({
        companyCode: "ELITE",
        suffix: "IDEM",
        status: "REVIEW",
        carInAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        collectionMode: "ELECTRONIC",
      });
      const key = `smc-idem-${run}`;
      const body = { chargeCategory: "TRAFFIC_VIOLATION" as const, amountAed: 350 };
      const [a, b] = await Promise.all([
        postManualCharge(contract.id, body, key),
        postManualCharge(contract.id, body, key),
      ]);
      assert.ok(a.statusCode === 200 && b.statusCode === 200);
      const replay = await postManualCharge(contract.id, body, key);
      assert.equal(replay.statusCode, 200, replay.body);
      const confirmed = await prisma.contractPayment.count({
        where: { contractId: contract.id, purpose: "ROAD_LIABILITY", status: "CONFIRMED" },
      });
      assert.equal(confirmed, 1);
      assert.equal(fakePayments.getOffSessionCallCount(), 1);
    });

    test("guards: read-only, cash, stale window, v1 consent", async () => {
      const recent = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const electronic = await seedReturnedContract({
        companyCode: "ELITE",
        suffix: "GUARD-E",
        status: "REVIEW",
        carInAt: recent,
        collectionMode: "ELECTRONIC",
      });
      const readOnlyRes = await postManualCharge(
        electronic.id,
        { chargeCategory: "TRAFFIC_VIOLATION", amountAed: 100 },
        `smc-ro-${run}`,
        readOnlyToken,
      );
      assert.equal(readOnlyRes.statusCode, 403, readOnlyRes.body);

      const cash = await seedReturnedContract({
        companyCode: "ELITE",
        suffix: "GUARD-CASH",
        status: "REVIEW",
        carInAt: recent,
        collectionMode: "CASH",
      });
      const cashRes = await postManualCharge(
        cash.id,
        { chargeCategory: "SALIK", amountAed: 100 },
        `smc-cash-${run}`,
      );
      assert.notEqual(cashRes.statusCode, 200);

      const staleCarIn = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      const stale = await seedReturnedContract({
        companyCode: "UNIQUE",
        suffix: "GUARD-STALE",
        status: "REVIEW",
        carInAt: staleCarIn,
        collectionMode: "ELECTRONIC",
      });
      const staleRes = await postManualCharge(
        stale.id,
        { chargeCategory: "TRAFFIC_VIOLATION", amountAed: 100 },
        `smc-stale-${run}`,
      );
      assert.equal(staleRes.statusCode, 422, staleRes.body);
      assert.equal(
        staleRes.json().error.context.reason,
        "RETURNED_CONTRACT_NOT_ELIGIBLE",
      );

      const v1Contract = await seedReturnedContract({
        companyCode: "UNIQUE",
        suffix: "GUARD-V1",
        status: "REVIEW",
        carInAt: recent,
        collectionMode: "ELECTRONIC",
      });
      await prisma.contractPaymentAuthorization.deleteMany({ where: { contractId: v1Contract.id } });
      await prisma.customerPaymentMethod.deleteMany({
        where: { providerPaymentMethodId: `pm_smc_${v1Contract.id}` },
      });
      await ensureAuthorization(v1Contract.id, false);
      const v1Res = await postManualCharge(
        v1Contract.id,
        { chargeCategory: "TRAFFIC_VIOLATION", amountAed: 100 },
        `smc-v1-${run}`,
      );
      assert.notEqual(v1Res.statusCode, 200);
    });

    test("critical A: contract B without its own authorization never hits Stripe", async () => {
      fakePayments.resetOffSessionCallCount();
      const recent = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await seedReturnedContract({
        companyCode: "ELITE",
        suffix: "AUTH-A",
        status: "REVIEW",
        carInAt: recent,
        collectionMode: "ELECTRONIC",
      });
      const cid = await companyId(prisma, "ELITE");
      const vehicleId = vehicleByCompany.get("ELITE")!;
      const contractB = await prisma.contract.create({
        data: {
          companyId: cid,
          contractNumber: `SMC-${run}-AUTH-B`,
          status: "REVIEW",
          vehicleId,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 3,
          durationValue: 3,
          durationUnit: "DAY",
          agreedAmount: 1200,
          collectionMode: "ELECTRONIC",
          carOut: {
            create: {
              performedByUserId: adminUserId,
              occurredAt: new Date(recent.getTime() - 3 * 24 * 60 * 60 * 1000),
              mileageOut: 100,
              fuelOut: "F",
            },
          },
          carIn: { create: { occurredAt: recent, mileageIn: 250, fuelIn: "1/2" } },
        },
      });
      createdContractIds.push(contractB.id);

      const res = await postManualCharge(
        contractB.id,
        { chargeCategory: "SALIK", amountAed: 120 },
        `smc-auth-b-${run}`,
      );
      assert.notEqual(res.statusCode, 200, res.body);
      assert.equal(fakePayments.getOffSessionCallCount(), 0);
      const payments = await prisma.contractPayment.count({
        where: { contractId: contractB.id, purpose: "ROAD_LIABILITY" },
      });
      assert.equal(payments, 0);
    });

    test("critical C: reconciliation-linked liability blocks direct off-session; independent staff charges allowed", async () => {
      fakePayments.resetOffSessionCallCount();
      const recent = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const contract = await seedReturnedContract({
        companyCode: "UNIQUE",
        suffix: "RECON",
        status: "REVIEW",
        carInAt: recent,
        collectionMode: "ELECTRONIC",
      });
      const now = new Date();
      const ingested = await prisma.roadLiability.create({
        data: {
          type: "RTA_VIOLATION",
          vehicleId: vehicleByCompany.get("UNIQUE")!,
          occurredAt: now,
          amount: 150,
          currency: "AED",
          authoritativeSourceKey: "RTA_INGEST",
          confirmationStatus: "CONFIRMED",
          attributionStatus: "MATCHED",
          attributedContractId: contract.id,
          collectionStatus: "OPEN",
          confirmedAt: now,
        },
      });
      await prisma.roadLiabilityCustomerCharge.create({
        data: {
          roadLiabilityId: ingested.id,
          contractId: contract.id,
          destinationType: "RECONCILIATION",
          officialAmountSnapshot: 150,
          customerChargeAmount: 150,
          adjustmentAmount: 0,
          confirmedByUserId: adminUserId,
          confirmedAt: now,
          operationalState: "COLLECTIBLE",
        },
      });

      const blocked = await app.inject({
        method: "POST",
        url: `/road-liabilities/${ingested.id}/collection/off-session`,
        headers: { ...auth(adminToken), "idempotency-key": `smc-recon-block-${run}` },
        payload: { customerChargeAmount: 150 },
      });
      assert.notEqual(blocked.statusCode, 200, blocked.body);
      assert.equal(fakePayments.getOffSessionCallCount(), 0);

      const staffA = await postManualCharge(
        contract.id,
        { chargeCategory: "TRAFFIC_VIOLATION", amountAed: 150 },
        `smc-recon-staff-a-${run}`,
      );
      const staffB = await postManualCharge(
        contract.id,
        { chargeCategory: "TRAFFIC_VIOLATION", amountAed: 150 },
        `smc-recon-staff-b-${run}`,
      );
      assert.equal(staffA.statusCode, 200, staffA.body);
      assert.equal(staffB.statusCode, 200, staffB.body);
      assert.notEqual(staffA.json().data.roadLiabilityId, staffB.json().data.roadLiabilityId);
      assert.equal(
        await prisma.contractPayment.count({
          where: { contractId: contract.id, purpose: "ROAD_LIABILITY", status: "CONFIRMED" },
        }),
        2,
      );
      await drainInvoiceOutbox(app);
      assert.equal(await prisma.invoice.count({ where: { contractId: contract.id, isCurrent: true } }), 1);
      const current = await prisma.invoice.findFirstOrThrow({
        where: { contractId: contract.id, isCurrent: true },
        include: { lines: true },
      });
      assert.ok(
        current.lines.filter((line) => line.sourceType === "ROAD_LIABILITY_CUSTOMER_CHARGE").length >= 2,
      );
    });

    test("critical D: concurrent idempotency and processing state do not double-charge", async () => {
      fakePayments.resetOffSessionCallCount();
      fakePayments.setOffSessionBehavior({ mode: "processing" });
      const contract = await seedReturnedContract({
        companyCode: "ELITE",
        suffix: "PROC",
        status: "REVIEW",
        carInAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        collectionMode: "ELECTRONIC",
      });
      const key = `smc-proc-${run}`;
      const body = { chargeCategory: "SALIK" as const, amountAed: 200 };
      const first = await postManualCharge(contract.id, body, key);
      assert.equal(first.statusCode, 200, first.body);
      assert.equal(first.json().data.status, "processing");
      assert.equal(fakePayments.getOffSessionCallCount(), 1);

      const [c1, c2] = await Promise.all([
        postManualCharge(contract.id, body, key),
        postManualCharge(contract.id, body, key),
      ]);
      assert.ok(c1.statusCode === 200 && c2.statusCode === 200);
      assert.equal(fakePayments.getOffSessionCallCount(), 1);
      assert.equal(
        await prisma.contractPayment.count({
          where: { contractId: contract.id, purpose: "ROAD_LIABILITY" },
        }),
        1,
      );
      fakePayments.resetOffSessionBehavior();
    });
  });
}
