import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "src/constants/permissions";
import { FN } from "src/lib/rbac/functional-permissions/keys";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import {
  resetStripeAccountKeyCache,
  resolveStripeProviderAccountKey,
} from "src/modules/contracts/payment/stripe-account-identity";
import {
  createFakePaymentProvider,
  reconcileFakeProviderPayment,
  confirmRentalPaymentViaStatusToken,
} from "tests/helpers/fake-payment-provider";
import {
  bindIntegrationDatabase,
  extractPostgresDatabaseName,
  INTEGRATION_ENABLED,
} from "tests/helpers/integration-harness";
import { companyId } from "tests/helpers/operating-company";
import { configureTestInvoiceSequences, drainInvoiceOutbox } from "tests/helpers/invoice-integration";
import {
  assertExactlyOneCurrentInvoice,
  assertPartialUniqueCurrentInvoiceEnforced,
  createSyntheticReconciliationPayment,
  drainAndAssertCurrent,
  enqueuePaymentConfirmedOutbox,
  enqueueInvoiceOutboxEvent,
  primeInvoiceOutboxForImmediateRetry,
} from "tests/helpers/unified-invoice-closure";
import {
  completeCarInToReview,
  confirmReturnForContract,
  createActiveRentalContract,
  seedRenewalGuardUser,
} from "tests/helpers/renewal-integration-setup";
import { auth, seedReviewContract } from "tests/helpers/payment-integration-helpers";
import {
  PAYMENT_CONSENT_SCOPE_V2,
  PAYMENT_METHOD_AUTHORIZATION_VERSION_V2,
} from "src/modules/contracts/payment/payment-consent.catalog";
import { hashToken } from "src/lib/security/tokens";
import { createContractInvoiceConsolidationService } from "src/modules/invoices/contract-invoice-consolidation.service";
import { INVOICE_OUTBOX_ROAD_LIABILITY_CHARGE } from "src/modules/invoices/invoices.constants";

if (!INTEGRATION_ENABLED) {
  test("unified invoice closure skipped", { skip: true });
} else {
  bindIntegrationDatabase();
  process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
  process.env.SCHEDULER_ENABLED = "false";
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "sk_test_integration_fake";
  process.env.PAYMENT_PROVIDER = "stripe";

  describe("unified invoice — final closure (haidara_test)", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = `UIC-${Date.now().toString(36).toUpperCase()}`;
    const admin = { email: `uic-admin-${run}@test.local`, password: "uic-pass-12345" };
    let token = "";
    let adminUserId = 0;
    let fakePayments: ReturnType<typeof createFakePaymentProvider>;
    let stripeAccountKey = "test";
    const createdContractIds: string[] = [];
    let eliteVehicleId = 0;
    let customerId = 0;

    const authHeaders = () => auth(token);

    async function login() {
      const res = await app.inject({ method: "POST", url: "/auth/login", payload: admin });
      assert.equal(res.statusCode, 200, res.body);
      token = res.json().data.accessToken as string;
    }

    async function postManualCharge(
      contractId: string,
      body: {
        chargeCategory: "TRAFFIC_VIOLATION" | "SALIK";
        amountAed: number;
        referenceNumber: string;
      },
      idempotencyKey: string,
    ) {
      return app.inject({
        method: "POST",
        url: `/road-liabilities/returned-contracts/${contractId}/manual-charge`,
        headers: { ...authHeaders(), "idempotency-key": idempotencyKey },
        payload: body,
      });
    }

    async function ensurePaymentAuthorization(contractId: string) {
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
        update: { providerCustomerId: `cus_uic_${run}` },
        create: {
          customerId: contract.customerId!,
          provider: "STRIPE",
          providerAccountKey: stripeAccountKey,
          livemode: false,
          providerCustomerId: `cus_uic_${run}`,
        },
      });
      const method = await prisma.customerPaymentMethod.create({
        data: {
          profileId: profile.id,
          providerPaymentMethodId: `pm_uic_${contractId.slice(0, 8)}`,
          cardBrand: "visa",
          cardLast4: "4242",
          status: "ACTIVE",
        },
      });
      const rentalPayment = await prisma.contractPayment.findFirstOrThrow({
        where: { contractId, purpose: "RENTAL", status: "CONFIRMED" },
      });
      await prisma.contractPaymentAuthorization.upsert({
        where: { sourcePaymentId: rentalPayment.id },
        create: {
          contractId,
          customerId: contract.customerId!,
          customerPaymentMethodId: method.id,
          sourcePaymentId: rentalPayment.id,
          consentVersion: PAYMENT_METHOD_AUTHORIZATION_VERSION_V2,
          consentLocale: "en",
          consentTextHash: "hash",
          scope: PAYMENT_CONSENT_SCOPE_V2,
          authorizedAt: new Date(),
        },
        update: {},
      });
    }

    async function payReconciliation(contractId: string, reconciliationId: string) {
      const start = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/reconciliation/payment`,
        headers: authHeaders(),
      });
      assert.equal(start.statusCode, 200, start.body);
      const statusToken = start.json().data.statusToken as string;
      assert.ok(statusToken);
      const payment = await prisma.contractPayment.findUniqueOrThrow({
        where: { statusTokenHash: hashToken(statusToken) },
      });
      fakePayments.confirm();
      await reconcileFakeProviderPayment(app, fakePayments, payment.id);
      await drainInvoiceOutbox(app);
      return payment;
    }

    before(async () => {
      assert.equal(extractPostgresDatabaseName(process.env.DATABASE_URL ?? ""), "haidara_test");
      fakePayments = createFakePaymentProvider(run);
      setPaymentProviderForTests(fakePayments.provider);
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      resetStripeAccountKeyCache();
      const { env } = await import("src/config/env");
      const Stripe = (await import("stripe")).default;
      stripeAccountKey = await resolveStripeProviderAccountKey(new Stripe(env.STRIPE_SECRET_KEY!));

      adminUserId = await seedRenewalGuardUser(prisma, admin.email, admin.password, `uic_admin_${run}`);
      const extraPerms = [
        PERMISSIONS.VIOLATIONS_READ,
        PERMISSIONS.VIOLATIONS_CHARGE,
        PERMISSIONS.INVOICES_READ,
        PERMISSIONS.INVOICES_SEND_WHATSAPP,
        "vehicles.manage",
        FN.vehicles.viewPage,
        FN.vehicles.addDelete,
        FN.violations.viewPage,
        FN.violations.manualCollection,
        FN.invoices.viewPage,
        FN.invoices.sendWhatsapp,
        FN.whatsapp.full,
        FN.contracts.viewPage,
        FN.contracts.rentalLink,
        FN.contracts.operationsClosure,
        FN.contracts.renewal,
      ];
      const role = await prisma.role.findFirstOrThrow({ where: { key: `uic_admin_${run}` } });
      for (const key of extraPerms) {
        const perm = await prisma.permission.upsert({
          where: { key },
          update: {},
          create: {
            key,
            category: key.startsWith("diamond.fn.") ? "functional" : key.split(".")[0]!,
            description: key,
          },
        });
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          update: {},
          create: { roleId: role.id, permissionId: perm.id },
        });
      }
      await login();
      await configureTestInvoiceSequences(prisma);

      const eliteId = await companyId(prisma, "ELITE");
      const vehicleRes = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: authHeaders(),
        payload: {
          companyId: eliteId,
          vehicleName: `UIC ${run}`,
          plateNumber: `U${run.slice(-10)}`,
          dailyRate: 500,
        },
      });
      assert.equal(vehicleRes.statusCode, 201, vehicleRes.body);
      eliteVehicleId = vehicleRes.json().data.id as number;
      const customer = await prisma.customer.create({
        data: { name: `UIC Customer ${run}`, mobile: "+971500088877" },
      });
      customerId = customer.id;
    });

    after(async () => {
      for (const contractId of [...createdContractIds].reverse()) {
        await prisma.invoiceLine.deleteMany({ where: { invoice: { contractId } } });
        await prisma.invoiceDelivery.deleteMany({ where: { invoice: { contractId } } });
        await prisma.invoice.deleteMany({ where: { contractId } });
        await prisma.domainOutboxEvent.deleteMany({
          where: { payload: { path: ["contractId"], equals: contractId } },
        });
        await prisma.financialLedgerEntry.deleteMany({ where: { contractId } });
        await prisma.contractPaymentOffSessionAttempt.deleteMany({
          where: { contractPayment: { contractId } },
        });
        await prisma.contractPaymentAuthorization.deleteMany({ where: { contractId } });
        await prisma.contractPayment.deleteMany({ where: { contractId } });
        await prisma.contractPostCloseReceivable.deleteMany({ where: { contractId } });
        await prisma.roadLiabilityCustomerCharge.deleteMany({ where: { contractId } });
        await prisma.roadLiabilityObservation.deleteMany({
          where: { liability: { attributedContractId: contractId } },
        });
        await prisma.roadLiability.deleteMany({ where: { attributedContractId: contractId } });
        await prisma.contractReconciliationLine.deleteMany({
          where: { reconciliation: { contractId } },
        });
        await prisma.contractReconciliation.deleteMany({ where: { contractId } });
        await prisma.contract.deleteMany({ where: { id: contractId } });
      }
      if (eliteVehicleId) {
        await prisma.vehicle.deleteMany({ where: { id: eliteVehicleId } }).catch(() => undefined);
      }
      if (customerId) {
        await prisma.customer.deleteMany({ where: { id: customerId } }).catch(() => undefined);
      }
      setPaymentProviderForTests(undefined);
      await app.close();
    });

    test("A: full consolidated invoice — rental, renewal, violation, Salik, reconciliation, post-close", async () => {
      const seq = 1;
      const { contractId, payments: rentalPayments } = await createActiveRentalContract(
        app,
        prisma,
        authHeaders,
        run,
        seq,
        fakePayments,
      );
      createdContractIds.push(contractId);
      await drainInvoiceOutbox(app);

      const renewalIssue = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/renewal-link`,
        headers: authHeaders(),
        payload: { additionalDays: 2, additionalAmount: 400 },
      });
      assert.equal(renewalIssue.statusCode, 200, renewalIssue.body);
      const renewToken = renewalIssue.json().data.link.token as string;
      await app.inject({ method: "POST", url: `/contracts/renew/${renewToken}/confirm`, payload: {} });
      const renewPayStart = await app.inject({
        method: "POST",
        url: `/contracts/renew/${renewToken}/payment`,
      });
      assert.equal(renewPayStart.statusCode, 200, renewPayStart.body);
      const renewStatusToken = renewPayStart.json().data.statusToken as string;
      const renewPayment = await prisma.contractPayment.findUniqueOrThrow({
        where: { statusTokenHash: hashToken(renewStatusToken) },
      });
      rentalPayments.confirm();
      await reconcileFakeProviderPayment(app, rentalPayments, renewPayment.id);
      await drainInvoiceOutbox(app);

      await confirmReturnForContract(app, authHeaders, contractId);
      await completeCarInToReview(app, authHeaders, contractId);
      await ensurePaymentAuthorization(contractId);

      const tv = await postManualCharge(
        contractId,
        { chargeCategory: "TRAFFIC_VIOLATION", amountAed: 100, referenceNumber: `UIC-TV-${run}` },
        `uic-tv-${run}`,
      );
      assert.equal(tv.statusCode, 200, tv.body);
      const salik = await postManualCharge(
        contractId,
        { chargeCategory: "SALIK", amountAed: 50, referenceNumber: `UIC-SLK-${run}` },
        `uic-salik-${run}`,
      );
      assert.equal(salik.statusCode, 200, salik.body);
      await drainInvoiceOutbox(app);

      const reconRes = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/reconcile`,
        headers: authHeaders(),
        payload: { lines: [{ type: "FUEL", description: "fuel top-up", amount: 250 }] },
      });
      assert.equal(reconRes.statusCode, 200, reconRes.body);
      const fin = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/reconciliation/finalize`,
        headers: authHeaders(),
      });
      assert.equal(fin.statusCode, 200, fin.body);
      const reconciliationId = fin.json().data.reconciliation.id as string;
      await drainInvoiceOutbox(app);

      await payReconciliation(contractId, reconciliationId);

      const closeRes = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/close`,
        headers: authHeaders(),
      });
      assert.equal(closeRes.statusCode, 200, closeRes.body);
      assert.equal(closeRes.json().data.status, "CLOSED");

      const custody = await prisma.contract.findUniqueOrThrow({
        where: { id: contractId },
        include: { carOut: true, carIn: true },
      });
      assert.ok(custody.carOut && custody.carIn);
      const postCloseOccurredAt = new Date(
        custody.carOut.occurredAt.getTime() +
          Math.floor((custody.carIn.occurredAt.getTime() - custody.carOut.occurredAt.getTime()) / 2),
      );

      const lateLiability = await prisma.roadLiability.create({
        data: {
          type: "RTA_VIOLATION",
          vehicleId: eliteVehicleId,
          occurredAt: postCloseOccurredAt,
          amount: 80,
          currency: "AED",
          authoritativeSourceKey: "RTA",
          authoritativeExternalReference: `UIC-PC-${run}`,
          confirmationStatus: "CONFIRMED",
          attributionStatus: "MATCHED",
          collectionStatus: "OPEN",
          attributedContractId: contractId,
          confirmedAt: new Date(),
        },
      });
      const pcCharge = await app.inject({
        method: "POST",
        url: `/road-liabilities/${lateLiability.id}/customer-charge/confirm`,
        headers: authHeaders(),
        payload: { customerChargeAmount: 80, adjustmentReason: "Post-close fee" },
      });
      assert.equal(pcCharge.statusCode, 200, pcCharge.body);
      assert.ok(pcCharge.json().data.postCloseReceivableId);
      await drainInvoiceOutbox(app);

      const current = await prisma.invoice.findFirstOrThrow({
        where: { contractId, isCurrent: true },
        include: { lines: true, company: true },
      });
      const owner = await prisma.operatingCompany.findUniqueOrThrow({ where: { id: current.companyId } });
      assert.equal(owner.code, "UNIQUE");
      assert.equal(await prisma.invoice.count({ where: { contractId, isCurrent: true } }), 1);

      const renewalLine = current.lines.find((l) => l.sourceType === "CONTRACT_RENEWAL");
      const violationLines = current.lines.filter((l) => l.serviceLabel?.includes("Traffic"));
      const salikLines = current.lines.filter((l) => l.serviceLabel?.includes("Salik"));
      const reconLine = current.lines.find((l) => l.sourceType === "RECONCILIATION_LINE");
      const postCloseReceivable = await prisma.contractPostCloseReceivable.findFirst({
        where: { contractId },
      });
      assert.ok(postCloseReceivable);
      const postCloseLine = current.lines.find(
        (l) => l.sourceId === postCloseReceivable!.customerChargeId,
      );

      assert.ok(renewalLine);
      assert.equal(renewalLine!.amount, 400);
      assert.ok(violationLines.length >= 1);
      assert.ok(violationLines.some((l) => l.amount === 100));
      assert.ok(salikLines.length >= 1);
      assert.ok(salikLines.some((l) => l.amount === 50));
      assert.ok(reconLine);
      assert.equal(reconLine!.amount, 250);
      assert.ok(postCloseLine);
      assert.equal(postCloseLine!.amount, 80);

      const lineKeys = current.lines.map((l) => `${l.sourceType}:${l.sourceId}`);
      assert.equal(new Set(lineKeys).size, lineKeys.length, "no duplicate invoice lines");

      const expectedTotal = current.lines.reduce((sum, line) => sum + line.amount, 0);
      assert.equal(current.totalAmount, expectedTotal);
      assert.ok(current.totalAmount >= 400 + 100 + 50 + 250 + 80);
      assert.equal(current.balanceDueSnapshot, 80);

      const closed = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
      assert.equal(closed.status, "CLOSED");

      const ledgerCount = await prisma.financialLedgerEntry.count({ where: { contractId } });
      const paymentCount = await prisma.contractPayment.count({
        where: { contractId, status: "CONFIRMED" },
      });
      assert.ok(paymentCount >= 5);
      assert.ok(ledgerCount >= 1);
    });

    test("B: partial reconciliation payments revise balance 1000 → 600 → 300 → 0", async () => {
      const contract = await seedReviewContract(prisma, {
        run,
        seq: 8801,
        vehicleId: eliteVehicleId,
        customerId,
        adminUserId,
        vehicleAvailable: true,
      });
      createdContractIds.push(contract.id);

      const recon = await prisma.contractReconciliation.create({
        data: {
          contractId: contract.id,
          chargesTotal: 1000,
          finalAmount: 1000,
          depositAmount: 0,
          deductions: 0,
          finalizedAt: new Date(),
          finalizedByUserId: adminUserId,
          approvedAt: new Date(),
          lines: {
            create: {
              type: "DAMAGE",
              description: "closure partial damage",
              amount: 1000,
              confirmedAt: new Date(),
              confirmedByUserId: adminUserId,
            },
          },
        },
      });

      await enqueueInvoiceOutboxEvent(prisma, {
        eventType: "reconciliation.finalized",
        dedupeKey: `reconciliation.finalized:${recon.id}:uic-partial`,
        payload: { reconciliationId: recon.id, contractId: contract.id },
        aggregateType: "contract_reconciliation",
        aggregateId: recon.id,
      });
      let current = await drainAndAssertCurrent(app, prisma, contract.id);
      assert.equal(current.totalAmount, 1000);
      assert.equal(current.balanceDueSnapshot, 1000);
      assert.equal(current.revisionNumber, 1);

      const ledgerBefore = await prisma.financialLedgerEntry.count({ where: { contractId: contract.id } });

      await createSyntheticReconciliationPayment(prisma, {
        contractId: contract.id,
        reconciliationId: recon.id,
        amount: 500,
        status: "PENDING",
      });
      await drainInvoiceOutbox(app);
      const afterPending = await assertExactlyOneCurrentInvoice(prisma, contract.id);
      assert.equal(afterPending.revisionNumber, 1);
      assert.equal(afterPending.balanceDueSnapshot, 1000);

      const collectedSteps = [400, 700, 1000];
      for (const [index, collected] of collectedSteps.entries()) {
        const payment = await createSyntheticReconciliationPayment(prisma, {
          contractId: contract.id,
          reconciliationId: recon.id,
          amount: collected,
          status: "CONFIRMED",
        });
        await enqueuePaymentConfirmedOutbox(prisma, payment);
        current = await drainAndAssertCurrent(app, prisma, contract.id);
        assert.equal(current.revisionNumber, index + 2);
        assert.equal(current.balanceDueSnapshot, 1000 - collected);
      }
      assert.equal(current.balanceDueSnapshot, 0);
      assert.equal(current.totalAmount, 1000);

      const ledgerAfter = await prisma.financialLedgerEntry.count({ where: { contractId: contract.id } });
      assert.equal(ledgerAfter, ledgerBefore);

      const revisions = await prisma.invoice.count({ where: { contractId: contract.id } });
      assert.equal(revisions, 4);

      const dupDrain = await drainInvoiceOutbox(app);
      assert.ok(dupDrain >= 0);
      const afterDup = await assertExactlyOneCurrentInvoice(prisma, contract.id);
      assert.equal(afterDup.revisionNumber, 4);
    });

    test("C: renewal line stays on same contract invoice (no separate renewal invoice)", async () => {
      const { contractId } = await createActiveRentalContract(app, prisma, authHeaders, run, 77, fakePayments);
      createdContractIds.push(contractId);
      await drainInvoiceOutbox(app);
      const before = await prisma.invoice.findFirst({ where: { contractId, isCurrent: true } });
      assert.ok(before);

      const renewalIssue = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/renewal-link`,
        headers: authHeaders(),
        payload: { additionalDays: 1, additionalAmount: 200 },
      });
      assert.equal(renewalIssue.statusCode, 200, renewalIssue.body);
      const renewToken = renewalIssue.json().data.link.token as string;
      await app.inject({ method: "POST", url: `/contracts/renew/${renewToken}/confirm`, payload: {} });
      const payStart = await app.inject({ method: "POST", url: `/contracts/renew/${renewToken}/payment` });
      assert.equal(payStart.statusCode, 200, payStart.body);
      const statusToken = payStart.json().data.statusToken as string;
      const payment = await prisma.contractPayment.findUniqueOrThrow({
        where: { statusTokenHash: hashToken(statusToken) },
      });
      fakePayments.confirm();
      await reconcileFakeProviderPayment(app, fakePayments, payment.id);
      await drainInvoiceOutbox(app);

      const current = await prisma.invoice.findFirstOrThrow({
        where: { contractId, isCurrent: true },
        include: { lines: true },
      });
      assert.equal(await prisma.invoice.count({ where: { contractId, isCurrent: true } }), 1);
      assert.ok(current.lines.some((l) => l.sourceType === "CONTRACT_RENEWAL" && l.amount === 200));
      assert.equal(await prisma.invoice.count({ where: { contractId, isCurrent: true } }), 1);
      assert.ok((await prisma.invoice.count({ where: { contractId } })) >= 1);
    });

    test("D: PostgreSQL partial unique index + fingerprint idempotency + concurrent consolidation", async () => {
      const contract = await seedReviewContract(prisma, {
        run,
        seq: 8802,
        vehicleId: eliteVehicleId,
        customerId,
        adminUserId,
        vehicleAvailable: true,
      });
      createdContractIds.push(contract.id);
      await prisma.contractPayment.create({
        data: {
          contractId: contract.id,
          purpose: "RENTAL",
          targetId: contract.id,
          amount: contract.agreedAmount,
          currency: "AED",
          method: "CARD",
          status: "CONFIRMED",
          confirmedAt: new Date(),
        },
      });
      const consolidation = createContractInvoiceConsolidationService(app);
      const [a, b] = await Promise.all([
        consolidation.ensureConsolidatedContractInvoice(contract.id),
        consolidation.ensureConsolidatedContractInvoice(contract.id),
      ]);
      assert.equal(a.id, b.id);
      const current = await assertExactlyOneCurrentInvoice(prisma, contract.id);
      await assertPartialUniqueCurrentInvoiceEnforced(prisma, current.id);

      const beforeCount = await prisma.invoice.count({ where: { contractId: contract.id } });
      await consolidation.ensureConsolidatedContractInvoice(contract.id);
      await drainInvoiceOutbox(app);
      const afterCount = await prisma.invoice.count({ where: { contractId: contract.id } });
      assert.equal(afterCount, beforeCount);
    });

    test("E: invoice worker simulated failure then retry — one CURRENT, no extra revision", async () => {
      const contract = await seedReviewContract(prisma, {
        run,
        seq: 8803,
        vehicleId: eliteVehicleId,
        customerId,
        adminUserId,
        vehicleAvailable: true,
      });
      createdContractIds.push(contract.id);
      const reviewContract = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
      await prisma.contractPayment.create({
        data: {
          contractId: contract.id,
          purpose: "RENTAL",
          targetId: contract.id,
          amount: reviewContract.agreedAmount,
          currency: "AED",
          method: "CARD",
          status: "CONFIRMED",
          confirmedAt: new Date(),
        },
      });
      await createContractInvoiceConsolidationService(app).ensureConsolidatedContractInvoice(
        contract.id,
      );
      const liability = await prisma.roadLiability.create({
        data: {
          type: "RTA_VIOLATION",
          vehicleId: eliteVehicleId,
          occurredAt: new Date(),
          amount: 60,
          currency: "AED",
          authoritativeSourceKey: "STAFF_MANUAL",
          authoritativeExternalReference: `UIC-WK-${run}`,
          confirmationStatus: "CONFIRMED",
          attributionStatus: "MATCHED",
          collectionStatus: "OPEN",
          attributedContractId: contract.id,
          staffChargeCategory: "TRAFFIC_VIOLATION",
          confirmedAt: new Date(),
        },
      });
      const charge = await prisma.roadLiabilityCustomerCharge.create({
        data: {
          roadLiabilityId: liability.id,
          contractId: contract.id,
          destinationType: "DIRECT_COLLECTION",
          officialAmountSnapshot: 60,
          customerChargeAmount: 60,
          adjustmentAmount: 0,
          confirmedAt: new Date(),
          confirmedByUserId: adminUserId,
          operationalState: "COLLECTIBLE",
        },
      });
      const dedupeKey = `road_liability.customer_charge.confirmed:${charge.id}`;
      await enqueueInvoiceOutboxEvent(prisma, {
        eventType: INVOICE_OUTBOX_ROAD_LIABILITY_CHARGE,
        dedupeKey,
        payload: { customerChargeId: charge.id, contractId: contract.id },
        aggregateType: "road_liability_customer_charge",
        aggregateId: charge.id,
      });

      process.env.INVOICE_ISSUANCE_INTEGRATION_FAIL_ONCE_CHARGE_ID = charge.id;
      await drainInvoiceOutbox(app);
      const pending = await prisma.domainOutboxEvent.findFirst({
        where: { dedupeKey },
      });
      assert.ok(pending);
      assert.notEqual(pending!.status, "PROCESSED");

      const revBefore = await prisma.invoice.findFirstOrThrow({
        where: { contractId: contract.id, isCurrent: true },
      });
      await primeInvoiceOutboxForImmediateRetry(prisma, dedupeKey);
      await drainInvoiceOutbox(app);
      const revAfter = await prisma.invoice.findFirstOrThrow({
        where: { contractId: contract.id, isCurrent: true },
        include: { lines: true },
      });
      assert.ok(revAfter.revisionNumber > revBefore.revisionNumber);
      assert.ok(revAfter.lines.some((l) => l.sourceId === charge.id));
      await assertExactlyOneCurrentInvoice(prisma, contract.id);
      const fingerprint = revAfter.contentFingerprint;
      await drainInvoiceOutbox(app);
      const revFinal = await prisma.invoice.findFirstOrThrow({
        where: { contractId: contract.id, isCurrent: true },
      });
      assert.equal(revFinal.contentFingerprint, fingerprint);
    });

    test("F: legacy-style archived invoice + list current-only; superseded WhatsApp blocked", async () => {
      const contract = await seedReviewContract(prisma, {
        run,
        seq: 8804,
        vehicleId: eliteVehicleId,
        customerId,
        adminUserId,
        vehicleAvailable: true,
      });
      createdContractIds.push(contract.id);
      const legacyContract = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
      await prisma.contractPayment.create({
        data: {
          contractId: contract.id,
          purpose: "RENTAL",
          targetId: contract.id,
          amount: legacyContract.agreedAmount,
          currency: "AED",
          method: "CARD",
          status: "CONFIRMED",
          confirmedAt: new Date(),
        },
      });
      const consolidation = createContractInvoiceConsolidationService(app);
      const v1 = await consolidation.ensureConsolidatedContractInvoice(contract.id);
      const recon = await prisma.contractReconciliation.create({
        data: {
          contractId: contract.id,
          chargesTotal: 50,
          finalAmount: 50,
          depositAmount: 0,
          deductions: 0,
          finalizedAt: new Date(),
          finalizedByUserId: adminUserId,
          approvedAt: new Date(),
          lines: {
            create: {
              type: "LATE",
              description: "late fee",
              amount: 50,
              confirmedAt: new Date(),
              confirmedByUserId: adminUserId,
            },
          },
        },
      });
      await enqueueInvoiceOutboxEvent(prisma, {
        eventType: "reconciliation.finalized",
        dedupeKey: `reconciliation.finalized:${recon.id}:legacy`,
        payload: { reconciliationId: recon.id, contractId: contract.id },
        aggregateType: "contract_reconciliation",
        aggregateId: recon.id,
      });
      await drainInvoiceOutbox(app);
      const v2 = await prisma.invoice.findFirstOrThrow({
        where: { contractId: contract.id, isCurrent: true },
      });
      assert.notEqual(v1.id, v2.id);
      assert.equal(v2.revisionNumber, 2);

      const archived = await prisma.invoice.findUniqueOrThrow({ where: { id: v1.id } });
      assert.equal(archived.isCurrent, false);
      assert.equal(archived.invoiceNumber, v1.invoiceNumber);

      const list = await app.inject({
        method: "GET",
        url: `/invoices?contractId=${contract.id}`,
        headers: authHeaders(),
      });
      assert.equal(list.statusCode, 200, list.body);
      const items = list.json().data as { id: string; isCurrent: boolean }[];
      assert.ok(items.every((row) => row.isCurrent));
      assert.equal(items.length, 1);

      const history = await app.inject({
        method: "GET",
        url: `/invoices?contractId=${contract.id}&includeSuperseded=true`,
        headers: authHeaders(),
      });
      assert.equal(history.statusCode, 200, history.body);
      const histItems = history.json().data as { id: string }[];
      assert.ok(histItems.length >= 2);

      const blocked = await app.inject({
        method: "POST",
        url: `/invoices/${v1.id}/deliveries/whatsapp`,
        headers: { ...authHeaders(), "idempotency-key": `uic-wa-block-${run}` },
        payload: { idempotencyKey: `uic-wa-block-${run}` },
      });
      assert.equal(blocked.statusCode, 409, blocked.body);
    });
  });
}
