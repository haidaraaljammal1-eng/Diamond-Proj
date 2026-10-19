import { createHash } from "node:crypto";
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { fingerprintIdempotentPayload } from "src/lib/db/idempotency";
import {
  staffManualChargeIdempotencyScope,
  staffManualCollectIdempotencyKey,
  staffManualCollectIdempotencyScope,
} from "src/modules/road-liabilities/staff-manual-idempotency-recovery";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "src/constants/permissions";
import { FN } from "src/lib/rbac/functional-permissions/keys";
import {
  PAYMENT_CONSENT_SCOPE_V1,
  PAYMENT_CONSENT_SCOPE_V2,
} from "src/modules/contracts/payment/payment-consent.catalog";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import {
  resetStripeAccountKeyCache,
  resolveStripeProviderAccountKey,
} from "src/modules/contracts/payment/stripe-account-identity";
import {
  createFakePaymentProvider,
  flushStripeWebhookInbox,
  reconcileFailedFakeProviderPayment,
  reconcileFakeProviderPayment,
  sendTestStripeWebhook,
} from "tests/helpers/fake-payment-provider";
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
  process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_integration_fake";
  process.env.PAYMENT_PROVIDER = "stripe";

  const SMC_ADMIN_PERMISSION_KEYS = [
    PERMISSIONS.VIOLATIONS_READ,
    PERMISSIONS.VIOLATIONS_CHARGE,
    PERMISSIONS.INVOICES_READ,
    "vehicles.manage",
    FN.vehicles.viewPage,
    FN.vehicles.addDelete,
    FN.violations.viewPage,
    FN.violations.manualCollection,
    FN.invoices.viewPage,
  ];

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
          create: {
            key,
            category: key.startsWith("diamond.fn.") ? "functional" : key.split(".")[0],
            description: key,
          },
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

    async function seedActiveContract(input: {
      companyCode: CompanyCode;
      suffix: string;
      collectionMode: "ELECTRONIC" | "CASH";
      withAuthorization?: boolean;
    }) {
      const cid = await companyId(prisma, input.companyCode);
      const vehicleId = vehicleByCompany.get(input.companyCode)!;
      const carOutAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const contract = await prisma.contract.create({
        data: {
          companyId: cid,
          contractNumber: `SMC-${run}-${input.suffix}`,
          status: "ACTIVE",
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
              occurredAt: carOutAt,
              mileageOut: 100,
              fuelOut: "F",
            },
          },
        },
      });
      createdContractIds.push(contract.id);
      if (input.collectionMode === "ELECTRONIC" && input.withAuthorization !== false) {
        await ensureAuthorization(contract.id, true);
      } else if (input.collectionMode === "CASH") {
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

    async function getReturnedContractsList(query: Record<string, string> = {}) {
      const params = new URLSearchParams({ page: "1", pageSize: "20", ...query });
      return app.inject({
        method: "GET",
        url: `/road-liabilities/returned-contracts?${params.toString()}`,
        headers: auth(adminToken),
      });
    }

    async function seedReturnedContract(input: {
      companyCode: CompanyCode;
      suffix: string;
      status: "RETOUT" | "REVIEW" | "CLOSED";
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

    let manualRefSeq = 0;
    function staffManualChargeBody(
      chargeCategory: "TRAFFIC_VIOLATION" | "SALIK",
      amountAed: number,
      referenceNumber?: string,
    ) {
      manualRefSeq += 1;
      return {
        chargeCategory,
        amountAed,
        referenceNumber: referenceNumber ?? `000-${run}-${manualRefSeq}`,
      };
    }

    async function postManualCharge(
      contractId: string,
      body: {
        chargeCategory: "TRAFFIC_VIOLATION" | "SALIK";
        amountAed: number;
        referenceNumber: string;
      },
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
      referenceNumber: string;
    }) {
      const liability = await prisma.roadLiability.findUniqueOrThrow({
        where: { id: input.roadLiabilityId },
      });
      assert.equal(liability.authoritativeSourceKey, "STAFF_MANUAL");
      assert.equal(liability.staffChargeCategory, input.category);
      assert.equal(liability.staffChargeDescription, input.referenceNumber);
      assert.equal(liability.authoritativeExternalReference, null);
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

      adminUserId = await seedUser(
        `smc-admin-${run}@test.local`,
        "pass-12345",
        `smc_admin_${run}`,
        SMC_ADMIN_PERMISSION_KEYS,
      );
      await seedUser(`smc-read-${run}@test.local`, "pass-12345", `smc_read_${run}`, [
        PERMISSIONS.VIOLATIONS_READ,
        FN.violations.viewPage,
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

    test("staff reference: required; failure releases registry and hides staffEntered; success persists", async () => {
      const contract = await seedReturnedContract({
        companyCode: "ELITE",
        suffix: "REF-REQ",
        status: "REVIEW",
        carInAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        collectionMode: "ELECTRONIC",
      });

      for (const chargeCategory of ["TRAFFIC_VIOLATION", "SALIK"] as const) {
        const rejected = await app.inject({
          method: "POST",
          url: `/road-liabilities/returned-contracts/${contract.id}/manual-charge`,
          headers: { ...auth(adminToken), "idempotency-key": `smc-ref-empty-${chargeCategory}-${run}` },
          payload: { chargeCategory, amountAed: 40, referenceNumber: "   " },
        });
        assert.equal(rejected.statusCode, 422, rejected.body);
      }

      fakePayments.resetOffSessionBehavior();
      fakePayments.setOffSessionBehavior({ mode: "failed" });
      const salikRef = "00008877";
      const failed = await postManualCharge(
        contract.id,
        staffManualChargeBody("SALIK", 80, salikRef),
        `smc-ref-fail-${run}`,
      );
      assert.equal(failed.statusCode, 200, failed.body);
      assert.equal(failed.json().data.status, "failed");
      const roadLiabilityId = failed.json().data.roadLiabilityId as string;
      const liability = await prisma.roadLiability.findUniqueOrThrow({ where: { id: roadLiabilityId } });
      assert.equal(liability.staffChargeDescription, null);
      assert.equal(liability.collectionStatus, "VOID");
      const failedPayment = await prisma.contractPayment.findFirst({
        where: { purpose: "ROAD_LIABILITY", status: "FAILED" },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(failedPayment);
      const released = await prisma.roadChargeReferenceRegistry.findFirst({
        where: { referenceNormalized: salikRef, chargeCategory: "SALIK", status: "RELEASED" },
      });
      assert.ok(released);

      const detailRes = await app.inject({
        method: "GET",
        url: `/road-liabilities/${roadLiabilityId}`,
        headers: auth(adminToken),
      });
      assert.equal(detailRes.statusCode, 200, detailRes.body);
      const detail = detailRes.json().data as {
        staffEntered: { referenceNumber: string } | null;
      };
      assert.equal(detail.staffEntered, null);

      fakePayments.resetOffSessionBehavior();
      const retry = await postManualCharge(
        contract.id,
        staffManualChargeBody("SALIK", 90, salikRef),
        `smc-ref-retry-${run}`,
      );
      assert.equal(retry.statusCode, 200, retry.body);
      assert.equal(retry.json().data.status, "succeeded");
      const retryId = retry.json().data.roadLiabilityId as string;
      const settled = await prisma.roadLiability.findUniqueOrThrow({ where: { id: retryId } });
      assert.equal(settled.staffChargeDescription, salikRef);
      assert.equal(settled.collectionStatus, "SETTLED");
    });

    test("registry: duplicate paid reference blocked; cross-category allowed; concurrent keys no double charge", async () => {
      fakePayments.resetOffSessionCallCount();
      const contractA = await seedReturnedContract({
        companyCode: "ELITE",
        suffix: "REG-A",
        status: "REVIEW",
        carInAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        collectionMode: "ELECTRONIC",
      });
      const contractB = await seedReturnedContract({
        companyCode: "UNIQUE",
        suffix: "REG-B",
        status: "REVIEW",
        carInAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        collectionMode: "ELECTRONIC",
      });
      const sharedRef = "00006611";
      const trafficBody = staffManualChargeBody("TRAFFIC_VIOLATION", 120, sharedRef);
      const salikBody = staffManualChargeBody("SALIK", 50, sharedRef);
      const paidA = await postManualCharge(contractA.id, trafficBody, `smc-reg-a-${run}`);
      assert.equal(paidA.statusCode, 200, paidA.body);
      assert.equal(paidA.json().data.status, "succeeded");

      const dupTraffic = await postManualCharge(contractB.id, trafficBody, `smc-reg-dup-t-${run}`);
      assert.equal(dupTraffic.statusCode, 409, dupTraffic.body);
      assert.equal(dupTraffic.json().error.context.reason, "REFERENCE_ALREADY_USED");

      const salikOk = await postManualCharge(contractA.id, salikBody, `smc-reg-salik-${run}`);
      assert.equal(salikOk.statusCode, 200, salikOk.body);
      assert.equal(salikOk.json().data.status, "succeeded");

      const key = `smc-reg-idem-${run}`;
      const [c1, c2] = await Promise.all([
        postManualCharge(contractB.id, staffManualChargeBody("TRAFFIC_VIOLATION", 80, `00007722`), key),
        postManualCharge(contractB.id, staffManualChargeBody("TRAFFIC_VIOLATION", 80, `00007722`), key),
      ]);
      assert.ok(c1.statusCode === 200 && c2.statusCode === 200);
      assert.equal(fakePayments.getOffSessionCallCount(), 3);
      assert.equal(
        await prisma.contractPayment.count({
          where: { contractId: contractB.id, purpose: "ROAD_LIABILITY", status: "CONFIRMED" },
        }),
        1,
      );
    });

    test("eligibility: ACTIVE without Car-In lists and charges; pre-ACTIVE excluded; RETOUT in window", async () => {
      const active = await seedActiveContract({
        companyCode: "ELITE",
        suffix: "ACTIVE-OK",
        collectionMode: "ELECTRONIC",
      });
      const activeNoAuth = await seedActiveContract({
        companyCode: "UNIQUE",
        suffix: "ACTIVE-NOAUTH",
        collectionMode: "ELECTRONIC",
        withAuthorization: false,
      });
      const cid = await companyId(prisma, "ELITE");
      const vehicleId = vehicleByCompany.get("ELITE")!;
      const paid = await prisma.contract.create({
        data: {
          companyId: cid,
          contractNumber: `SMC-${run}-PAID-EXCL`,
          status: "PAID",
          vehicleId,
          customerId,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 3,
          durationValue: 3,
          durationUnit: "DAY",
          agreedAmount: 1200,
          collectionMode: "ELECTRONIC",
        },
      });
      createdContractIds.push(paid.id);

      const retout = await seedReturnedContract({
        companyCode: "ELITE",
        suffix: "RETOUT-OK",
        status: "RETOUT",
        carInAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        collectionMode: "ELECTRONIC",
      });

      const listRes = await getReturnedContractsList();
      assert.equal(listRes.statusCode, 200, listRes.body);
      const ids = (listRes.json().data as { contractId: string }[]).map((row) => row.contractId);
      assert.ok(ids.includes(active.id));
      assert.ok(ids.includes(activeNoAuth.id));
      assert.ok(ids.includes(retout.id));
      assert.ok(!ids.includes(paid.id));

      const activeRow = (listRes.json().data as { contractId: string; carInOccurredAt: string | null }[]).find(
        (row) => row.contractId === active.id,
      );
      assert.equal(activeRow?.carInOccurredAt, null);

      const chargeOk = await postManualCharge(
        active.id,
        staffManualChargeBody("SALIK", 50, "00001234"),
        `smc-active-${run}`,
      );
      assert.equal(chargeOk.statusCode, 200, chargeOk.body);

      const chargeNoAuth = await postManualCharge(
        activeNoAuth.id,
        staffManualChargeBody("SALIK", 50),
        `smc-active-noauth-${run}`,
      );
      assert.notEqual(chargeNoAuth.statusCode, 200, chargeNoAuth.body);

      const eliteOnly = await getReturnedContractsList({
        companyId: String(await companyId(prisma, "ELITE")),
      });
      assert.equal(eliteOnly.statusCode, 200, eliteOnly.body);
      const eliteIds = (eliteOnly.json().data as { contractId: string }[]).map((row) => row.contractId);
      assert.ok(eliteIds.includes(active.id));
      assert.ok(!eliteIds.includes(activeNoAuth.id));
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
        staffManualChargeBody("TRAFFIC_VIOLATION", 350, "TV-350-REF"),
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
        referenceNumber: "TV-350-REF",
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
        staffManualChargeBody("SALIK", 350, "SL-350-REF"),
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
        referenceNumber: "SL-350-REF",
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
      const body = staffManualChargeBody("TRAFFIC_VIOLATION", 350);
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
        staffManualChargeBody("TRAFFIC_VIOLATION", 100),
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
        staffManualChargeBody("SALIK", 100),
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
        staffManualChargeBody("TRAFFIC_VIOLATION", 100),
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
        staffManualChargeBody("TRAFFIC_VIOLATION", 100),
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
        staffManualChargeBody("SALIK", 120),
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
        staffManualChargeBody("TRAFFIC_VIOLATION", 150, `RECON-A-${run}`),
        `smc-recon-staff-a-${run}`,
      );
      const staffB = await postManualCharge(
        contract.id,
        staffManualChargeBody("TRAFFIC_VIOLATION", 150, "RECON-B-REF"),
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
      const body = staffManualChargeBody("SALIK", 200);
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

    describe("staff manual outcome recovery (async Stripe)", () => {
      async function processingManualCharge(
        suffix: string,
        ref: string,
        behavior: "processing" | "requires_action" = "processing",
      ) {
        fakePayments.resetOffSessionCallCount();
        fakePayments.setOffSessionBehavior({ mode: behavior });
        const contract = await seedReturnedContract({
          companyCode: "ELITE",
          suffix,
          status: "REVIEW",
          carInAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          collectionMode: "ELECTRONIC",
        });
        const key = `smc-rec-${suffix}-${run}`;
        const body = staffManualChargeBody("SALIK", 180, ref);
        const first = await postManualCharge(contract.id, body, key);
        assert.equal(first.statusCode, 200, first.body);
        assert.equal(first.json().data.status, behavior === "requires_action" ? "requires_action" : "processing");
        const roadLiabilityId = first.json().data.roadLiabilityId as string;
        const payment = await prisma.contractPayment.findFirstOrThrow({
          where: { contractId: contract.id, purpose: "ROAD_LIABILITY" },
        });
        return { contract, roadLiabilityId, payment, key, body, ref };
      }

      test("processing → delayed success finalizes registry and staff fields once", async () => {
        const ref = `PROC-OK-${run}`;
        const { contract, roadLiabilityId, payment, key, body } = await processingManualCharge(
          "REC-PROC-OK",
          ref,
        );
        const ledgerBefore = await prisma.financialLedgerEntry.count({
          where: { contractId: contract.id },
        });
        await reconcileFakeProviderPayment(app, fakePayments, payment.id);
        const liability = await prisma.roadLiability.findUniqueOrThrow({ where: { id: roadLiabilityId } });
        assert.equal(liability.collectionStatus, "SETTLED");
        assert.equal(liability.staffChargeDescription, ref);
        assert.ok(liability.staffEnteredAt);
        const registry = await prisma.roadChargeReferenceRegistry.findFirstOrThrow({
          where: { roadLiabilityId, chargeCategory: "SALIK" },
        });
        assert.equal(registry.status, "CONFIRMED");
        const ledgerAfter = await prisma.financialLedgerEntry.count({
          where: { contractId: contract.id },
        });
        assert.equal(ledgerAfter, ledgerBefore + 1);
        await drainInvoiceOutbox(app);
        const replay = await postManualCharge(contract.id, body, key);
        assert.equal(replay.statusCode, 200, replay.body);
        assert.equal(replay.json().data.status, "succeeded");
        assert.equal(
          await prisma.contractPayment.count({
            where: { contractId: contract.id, purpose: "ROAD_LIABILITY", status: "CONFIRMED" },
          }),
          1,
        );
        fakePayments.resetOffSessionBehavior();
      });

      test("processing → delayed definitive failure releases reference for reuse", async () => {
        const ref = `PROC-FAIL-${run}`;
        const { contract, roadLiabilityId, payment } = await processingManualCharge("REC-PROC-FAIL", ref);
        await reconcileFailedFakeProviderPayment(app, fakePayments, payment.id);
        const liability = await prisma.roadLiability.findUniqueOrThrow({ where: { id: roadLiabilityId } });
        assert.equal(liability.collectionStatus, "VOID");
        assert.equal(liability.staffChargeDescription, null);
        const released = await prisma.roadChargeReferenceRegistry.findFirst({
          where: { referenceNormalized: ref, chargeCategory: "SALIK", status: "RELEASED" },
        });
        assert.ok(released);
        assert.ok(
          await prisma.contractPayment.findFirst({
            where: { id: payment.id, status: "FAILED" },
          }),
        );
        fakePayments.resetOffSessionBehavior();
        const retry = await postManualCharge(
          contract.id,
          staffManualChargeBody("SALIK", 190, ref),
          `smc-rec-retry-${run}`,
        );
        assert.equal(retry.statusCode, 200, retry.body);
        assert.equal(retry.json().data.status, "succeeded");
      });

      test("requires_action → confirmed outcome without duplicate charge", async () => {
        const ref = `RA-OK-${run}`;
        const { contract, roadLiabilityId, payment } = await processingManualCharge(
          "REC-RA",
          ref,
          "requires_action",
        );
        const reserved = await prisma.roadChargeReferenceRegistry.findFirstOrThrow({
          where: { roadLiabilityId },
        });
        assert.equal(reserved.status, "RESERVED");
        await reconcileFakeProviderPayment(app, fakePayments, payment.id);
        const after = await prisma.roadChargeReferenceRegistry.findFirstOrThrow({
          where: { roadLiabilityId },
        });
        assert.equal(after.status, "CONFIRMED");
        assert.equal(fakePayments.getOffSessionCallCount(), 1);
        assert.equal(
          await prisma.contractPayment.count({
            where: { contractId: contract.id, purpose: "ROAD_LIABILITY", status: "CONFIRMED" },
          }),
          1,
        );
        fakePayments.resetOffSessionBehavior();
      });

      test("unknown provider status does not release reference or create duplicate charge", async () => {
        const ref = `UNK-${run}`;
        const { contract, roadLiabilityId, payment } = await processingManualCharge("REC-UNK", ref);
        await prisma.contractPayment.update({
          where: { id: payment.id },
          data: { providerReference: `pi_unknown_${run}` },
        });
        const service = (await import("src/modules/contracts/payment/contract-payment.service")).createContractPaymentService(
          prisma,
        );
        const unchanged = await service.reconcilePaymentWithProvider(payment.id);
        assert.ok(unchanged);
        assert.equal(unchanged?.status, "PROCESSING");
        const registry = await prisma.roadChargeReferenceRegistry.findFirstOrThrow({
          where: { roadLiabilityId },
        });
        assert.equal(registry.status, "RESERVED");
        assert.equal(fakePayments.getOffSessionCallCount(), 1);
        assert.equal(
          await prisma.contractPayment.count({
            where: { contractId: contract.id, purpose: "ROAD_LIABILITY" },
          }),
          1,
        );
        fakePayments.resetOffSessionBehavior();
      });

      test("webhook confirmation and provider reconcile converge without duplicate settlement", async () => {
        const ref = `WH-${run}`;
        const { contract, roadLiabilityId, payment } = await processingManualCharge("REC-WH", ref);
        fakePayments.confirm(fakePayments.refForPayment(payment.id) ?? undefined);
        const event = fakePayments.buildWebhookEvent({
          paymentId: payment.id,
          status: "CONFIRMED",
          eventType: "payment_intent.succeeded",
        });
        const wh = await sendTestStripeWebhook(app, event);
        assert.equal(wh.statusCode, 200, wh.body);
        await flushStripeWebhookInbox(app);
        await reconcileFakeProviderPayment(app, fakePayments, payment.id);
        const registry = await prisma.roadChargeReferenceRegistry.findFirstOrThrow({
          where: { roadLiabilityId },
        });
        assert.equal(registry.status, "CONFIRMED");
        assert.equal(
          await prisma.contractPayment.count({
            where: { contractId: contract.id, purpose: "ROAD_LIABILITY", status: "CONFIRMED" },
          }),
          1,
        );
        fakePayments.resetOffSessionBehavior();
      });
    });

    describe("staff manual idempotency exception recovery", () => {
      function staffObservationFingerprint(contractId: string, idempotencyKey: string): string {
        return createHash("sha256")
          .update(`staff-manual:${contractId}:${idempotencyKey}`)
          .digest("hex");
      }

      async function seedProvisionalStaffManualLiability(
        contractId: string,
        input: { chargeCategory: "TRAFFIC_VIOLATION" | "SALIK"; amountAed: number; referenceNumber: string },
        idempotencyKey: string,
      ) {
        const contract = await prisma.contract.findUniqueOrThrow({
          where: { id: contractId },
          select: { vehicleId: true },
        });
        const now = new Date();
        const fingerprint = staffObservationFingerprint(contractId, idempotencyKey);
        const liability = await prisma.roadLiability.create({
          data: {
            type: input.chargeCategory === "SALIK" ? "SALIK_TOLL" : "RTA_VIOLATION",
            vehicleId: contract.vehicleId,
            occurredAt: now,
            amount: input.amountAed,
            currency: "AED",
            authoritativeSourceKey: "STAFF_MANUAL",
            confirmationStatus: "CONFIRMED",
            attributionStatus: "MATCHED",
            attributedContractId: contractId,
            collectionStatus: "OPEN",
            confirmedAt: now,
            staffChargeCategory: input.chargeCategory,
            staffEnteredByUserId: adminUserId,
          },
        });
        await prisma.roadLiabilityObservation.create({
          data: {
            sourceKey: "STAFF_MANUAL",
            authoritative: false,
            externalEventId: `staff:${idempotencyKey}`,
            ingestionFingerprint: fingerprint,
            eventType: input.chargeCategory === "SALIK" ? "SALIK_TOLL" : "RTA_VIOLATION",
            vehicleId: contract.vehicleId,
            occurredAt: now,
            amount: input.amountAed,
            currency: "AED",
            externalReference: input.referenceNumber,
            liabilityId: liability.id,
            receivedAt: now,
          },
        });
        await prisma.roadChargeReferenceRegistry.create({
          data: {
            chargeCategory: input.chargeCategory,
            referenceNumber: input.referenceNumber,
            referenceNormalized: input.referenceNumber.trim(),
            status: "RESERVED",
            provenance: "STAFF_MANUAL",
            roadLiabilityId: liability.id,
            staffManualIdempotencyKey: idempotencyKey,
            reservedByUserId: adminUserId,
          },
        });
        return liability.id;
      }

      test("orphan staff idempotency key (no liability) is cleared and charge succeeds", async () => {
        fakePayments.resetOffSessionCallCount();
        const contract = await seedReturnedContract({
          companyCode: "ELITE",
          suffix: "IDEM-ORPHAN",
          status: "REVIEW",
          carInAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          collectionMode: "ELECTRONIC",
        });
        const key = `smc-idem-orphan-${run}`;
        const body = staffManualChargeBody("SALIK", 120, `ORPH-${run}`);
        const fp = fingerprintIdempotentPayload({ contractId: contract.id, ...body });
        await prisma.idempotencyKey.create({
          data: {
            scope: staffManualChargeIdempotencyScope(contract.id),
            key,
            resultRef: fp,
            createdAt: new Date(Date.now() - 10_000),
          },
        });
        const res = await postManualCharge(contract.id, body, key);
        assert.equal(res.statusCode, 200, res.body);
        assert.equal(res.json().data.status, "succeeded");
        assert.equal(res.json().data.recoveryState, "orphan_idempotency_cleared");
        assert.ok(res.json().data.roadLiabilityId);
        assert.equal(fakePayments.getOffSessionCallCount(), 1);
      });

      test("provisional liability without collection resumes on same staff key", async () => {
        fakePayments.resetOffSessionCallCount();
        const contract = await seedReturnedContract({
          companyCode: "ELITE",
          suffix: "IDEM-RESUME",
          status: "REVIEW",
          carInAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          collectionMode: "ELECTRONIC",
        });
        const key = `smc-idem-resume-${run}`;
        const body = staffManualChargeBody("TRAFFIC_VIOLATION", 140, `RESUME-${run}`);
        const roadLiabilityId = await seedProvisionalStaffManualLiability(contract.id, body, key);
        const fp = fingerprintIdempotentPayload({ contractId: contract.id, ...body });
        await prisma.idempotencyKey.createMany({
          data: [
            {
              scope: staffManualChargeIdempotencyScope(contract.id),
              key,
              resultRef: fp,
            },
            {
              scope: staffManualCollectIdempotencyScope(roadLiabilityId),
              key: staffManualCollectIdempotencyKey(key),
              resultRef: fingerprintIdempotentPayload({ customerChargeAmount: body.amountAed }),
            },
          ],
        });
        const res = await postManualCharge(contract.id, body, key);
        assert.equal(res.statusCode, 200, res.body);
        assert.equal(res.json().data.status, "succeeded");
        assert.equal(res.json().data.recoveryState, "collection_resumed");
        assert.equal(res.json().data.roadLiabilityId, roadLiabilityId);
        assert.equal(fakePayments.getOffSessionCallCount(), 1);
        assert.equal(
          await prisma.contractPayment.count({
            where: { contractId: contract.id, purpose: "ROAD_LIABILITY", status: "CONFIRMED" },
          }),
          1,
        );
      });

      test("possibly-sent state does not resume Stripe; same key awaits provider", async () => {
        fakePayments.resetOffSessionCallCount();
        fakePayments.setOffSessionBehavior({ mode: "processing" });
        const contract = await seedReturnedContract({
          companyCode: "ELITE",
          suffix: "IDEM-POSS",
          status: "REVIEW",
          carInAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          collectionMode: "ELECTRONIC",
        });
        const key = `smc-idem-poss-${run}`;
        const body = staffManualChargeBody("SALIK", 160, `POSS-${run}`);
        const first = await postManualCharge(contract.id, body, key);
        assert.equal(first.statusCode, 200, first.body);
        assert.equal(fakePayments.getOffSessionCallCount(), 1);
        const replay = await postManualCharge(contract.id, body, key);
        assert.equal(replay.statusCode, 200, replay.body);
        assert.equal(replay.json().data.status, "processing");
        assert.ok(replay.json().data.roadLiabilityId);
        assert.equal(replay.json().data.recoveryState, "awaiting_provider");
        assert.equal(fakePayments.getOffSessionCallCount(), 1);
        fakePayments.resetOffSessionBehavior();
      });

      test("different staff key with same reference stays blocked while RESERVED", async () => {
        const contract = await seedReturnedContract({
          companyCode: "UNIQUE",
          suffix: "IDEM-REF",
          status: "REVIEW",
          carInAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          collectionMode: "ELECTRONIC",
        });
        const ref = `REF-LOCK-${run}`;
        const keyA = `smc-idem-ref-a-${run}`;
        const body = staffManualChargeBody("SALIK", 90, ref);
        await seedProvisionalStaffManualLiability(contract.id, body, keyA);
        await prisma.idempotencyKey.create({
          data: {
            scope: staffManualChargeIdempotencyScope(contract.id),
            key: keyA,
            resultRef: fingerprintIdempotentPayload({ contractId: contract.id, ...body }),
          },
        });
        const blocked = await postManualCharge(contract.id, body, `smc-idem-ref-b-${run}`);
        assert.equal(blocked.statusCode, 409, blocked.body);
        assert.equal(blocked.json().error.context.reason, "REFERENCE_IN_PROGRESS");
      });
    });
  });
}
