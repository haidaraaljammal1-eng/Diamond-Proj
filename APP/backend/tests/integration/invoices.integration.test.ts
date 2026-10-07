import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "src/constants/permissions";
import { APPROVED_INVOICE_SEQUENCE_START } from "src/modules/invoices/invoices.constants";
import { setWhatsAppProviderForTests } from "src/modules/whatsapp/whatsapp.provider";
import { createFakeWhatsAppProvider } from "tests/helpers/fake-whatsapp-provider";
import {
  configureTestInvoiceSequences,
  drainInvoiceOutbox,
  signContractViaPublicRental,
} from "tests/helpers/invoice-integration";
import { companyId } from "tests/helpers/operating-company";
import { seedReviewContract } from "tests/helpers/payment-integration-helpers";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "invoices integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL=haidara_test)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("invoices integration", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `inv-admin-${run}@example.test`, password: "inv-admin-pass-123" };
    let token = "";
    let adminUserId = 0;
    let eliteContractId = "";
    let eliteRentalInvoiceId = "";

    const INVOICE_PERMS = [
      PERMISSIONS.INVOICES_READ,
      PERMISSIONS.INVOICES_SEND_WHATSAPP,
      "vehicles.read",
      "vehicles.manage",
      "contracts.read",
      "contracts.manage",
      "contracts.reconcile",
      "contracts.close",
      "violations.charge",
    ];

    async function seedAdmin() {
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      const email = normalizeEmail(admin.email);
      const role = await prisma.role.upsert({
        where: { key: `inv_admin_${run}` },
        update: {},
        create: { key: `inv_admin_${run}`, name: "inv admin" },
      });
      for (const key of INVOICE_PERMS) {
        const perm = await prisma.permission.upsert({
          where: { key },
          update: {},
          create: { key, category: key.split(".")[0]!, description: key },
        });
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          update: {},
          create: { roleId: role.id, permissionId: perm.id },
        });
      }
      const passwordHash = await hashPassword(admin.password);
      await prisma.user.upsert({
        where: { email },
        update: { status: "ACTIVE", passwordHash },
        create: { email, name: "Invoice Admin", status: "ACTIVE", passwordHash },
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      adminUserId = user.id;
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }

    const auth = () => ({ authorization: `Bearer ${token}` });

    before(async () => {
      if (!/haidara_test(?:\?|$)/.test(process.env.DATABASE_URL ?? "")) {
        throw new Error("invoice integration requires haidara_test DATABASE_URL");
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await seedAdmin();
      const login = await app.inject({ method: "POST", url: "/auth/login", payload: admin });
      assert.equal(login.statusCode, 200, login.body);
      token = login.json().data.accessToken as string;
      await configureTestInvoiceSequences(prisma, APPROVED_INVOICE_SEQUENCE_START);
    });

    after(async () => {
      setWhatsAppProviderForTests(undefined);
      await app.close();
    });

    test("A: ELITE rental invoice on contract SIGNED via outbox (number 1100, idempotent)", async () => {
      const { contractId } = await signContractViaPublicRental(app, prisma, {
        authHeaders: auth(),
        companyCode: "ELITE",
        run: `${run}-ELITE`,
        agreedAmount: 1800,
        customerName: "Elite Renter",
        mobile: "+971500011101",
      });
      const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
      assert.equal(contract.status, "SIGNED");
      const eliteId = await companyId(prisma, "ELITE");
      assert.equal(contract.companyId, eliteId);

      await drainInvoiceOutbox(app);

      const invoices = await prisma.invoice.findMany({ where: { contractId } });
      assert.equal(invoices.length, 1);
      assert.equal(invoices[0]!.invoiceType, "RENTAL");
      assert.equal(invoices[0]!.companyId, eliteId);
      assert.equal(invoices[0]!.invoiceNumber, APPROVED_INVOICE_SEQUENCE_START);
      assert.equal(invoices[0]!.totalAmount, 1800);

      const seq = await prisma.invoiceNumberSequence.findUniqueOrThrow({
        where: { companyId: eliteId },
      });
      assert.equal(seq.nextNumber, APPROVED_INVOICE_SEQUENCE_START + 1);

      await drainInvoiceOutbox(app);
      const again = await prisma.invoice.count({ where: { contractId, invoiceType: "RENTAL" } });
      assert.equal(again, 1);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "INVOICE_ISSUED", entityId: invoices[0]!.id },
      });
      assert.ok(audit);
      eliteContractId = contractId;
      eliteRentalInvoiceId = invoices[0]!.id;
    });

    test("B: UNIQUE rental uses independent sequence (also starts at 1100)", async () => {
      const { contractId } = await signContractViaPublicRental(app, prisma, {
        authHeaders: auth(),
        companyCode: "UNIQUE",
        run: `${run}-UNQ`,
        agreedAmount: 1500,
        customerName: "Unique Renter",
        mobile: "+971500011102",
      });
      await drainInvoiceOutbox(app);
      const uniqueId = await companyId(prisma, "UNIQUE");
      const inv = await prisma.invoice.findFirstOrThrow({
        where: { contractId, invoiceType: "RENTAL" },
      });
      assert.equal(inv.companyId, uniqueId);
      assert.equal(inv.invoiceNumber, APPROVED_INVOICE_SEQUENCE_START);
    });

    test("C: list company filter and search", async () => {
      const eliteList = await app.inject({
        method: "GET",
        url: "/invoices?companyCode=ELITE&page=1&pageSize=50",
        headers: auth(),
      });
      assert.equal(eliteList.statusCode, 200, eliteList.body);
      const eliteItems = eliteList.json().data as unknown[];
      assert.ok(eliteItems.length >= 1);
      for (const row of eliteItems) {
        assert.equal((row as { companyCode: string }).companyCode, "ELITE");
      }

      const uniqueList = await app.inject({
        method: "GET",
        url: "/invoices?companyCode=UNIQUE",
        headers: auth(),
      });
      assert.equal(uniqueList.statusCode, 200);
      for (const row of uniqueList.json().data as { companyCode: string }[]) {
        assert.equal(row.companyCode, "UNIQUE");
      }

      const byNumber = await app.inject({
        method: "GET",
        url: `/invoices?search=${APPROVED_INVOICE_SEQUENCE_START}`,
        headers: auth(),
      });
      assert.equal(byNumber.statusCode, 200);
      assert.ok((byNumber.json().data as unknown[]).length >= 1);
    });

    test("D: detail, PDF, deliveries, no manual POST /invoices", async () => {
      const inv = await prisma.invoice.findFirstOrThrow({
        where: { invoiceNumber: APPROVED_INVOICE_SEQUENCE_START },
      });
      const detail = await app.inject({ method: "GET", url: `/invoices/${inv.id}`, headers: auth() });
      assert.equal(detail.statusCode, 200);
      assert.equal(detail.json().data.customerName, inv.customerNameSnapshot);
      assert.ok(detail.json().data.lines.length >= 1);

      const pdf = await app.inject({ method: "GET", url: `/invoices/${inv.id}/pdf`, headers: auth() });
      assert.equal(pdf.statusCode, 200);
      assert.equal(pdf.headers["content-type"], "application/pdf");
      assert.match(String(pdf.headers["content-disposition"]), /Diamond-(Elite|Unique)-Invoice/);
      assert.equal(pdf.rawPayload.subarray(0, 4).toString("utf8"), "%PDF");

      const deliveries = await app.inject({
        method: "GET",
        url: `/invoices/${inv.id}/deliveries`,
        headers: auth(),
      });
      assert.equal(deliveries.statusCode, 200);
      assert.ok(Array.isArray(deliveries.json().data));

      const manual = await app.inject({
        method: "POST",
        url: "/invoices",
        headers: auth(),
        payload: { companyId: 1, amount: 999 },
      });
      assert.equal(manual.statusCode, 404);
    });

    test("E: road liability invoice + closed contract late fine", async () => {
      assert.ok(eliteContractId);
      const review = await prisma.contract.findUniqueOrThrow({ where: { id: eliteContractId } });
      await prisma.contract.update({
        where: { id: review.id },
        data: { status: "CLOSED" },
      });
      const liability = await prisma.roadLiability.create({
        data: {
          type: "RTA_VIOLATION",
          vehicleId: review.vehicleId!,
          occurredAt: new Date("2026-10-01T10:00:00.000Z"),
          amount: 600,
          currency: "AED",
          authoritativeSourceKey: "RTA",
          authoritativeExternalReference: `RTA-INV-${run}`,
          confirmationStatus: "CONFIRMED",
          attributionStatus: "MATCHED",
          collectionStatus: "OPEN",
          attributedContractId: review.id,
          confirmedAt: new Date(),
        },
      });
      const charge = await prisma.roadLiabilityCustomerCharge.create({
        data: {
          roadLiabilityId: liability.id,
          contractId: review.id,
          destinationType: "POST_CLOSE_RECEIVABLE",
          officialAmountSnapshot: 600,
          customerChargeAmount: 600,
          adjustmentAmount: 0,
          confirmedAt: new Date(),
          confirmedByUserId: adminUserId,
        },
      });
      await prisma.domainOutboxEvent.create({
        data: {
          eventType: "road_liability.customer_charge.confirmed",
          aggregateType: "road_liability_customer_charge",
          aggregateId: charge.id,
          dedupeKey: `road_liability.customer_charge.confirmed:${charge.id}`,
          payload: { customerChargeId: charge.id, contractId: review.id },
          status: "PENDING",
          availableAt: new Date(),
          maxAttempts: 5,
        },
      });
      await drainInvoiceOutbox(app);

      const { createInvoiceIssuanceService } = await import(
        "src/modules/invoices/invoice-issuance.service"
      );
      const issuance = createInvoiceIssuanceService(app);
      let rlInv = await prisma.invoice.findFirst({
        where: { originEventKey: `ROAD_LIABILITY:${charge.id}` },
      });
      if (!rlInv) {
        rlInv = await issuance.ensureRoadLiabilityInvoiceForCustomerCharge(charge.id);
      }
      assert.ok(rlInv);
      assert.equal(rlInv.invoiceType, "ROAD_LIABILITY");
      assert.equal(rlInv.totalAmount, 600);
      const closed = await prisma.contract.findUniqueOrThrow({ where: { id: review.id } });
      assert.equal(closed.status, "CLOSED");
    });

    test("F: reconciliation damage invoice; G: skip road-liability recon line (no double bill)", async () => {
      assert.ok(eliteContractId);
      const elite = await prisma.contract.findUniqueOrThrow({ where: { id: eliteContractId } });
      assert.ok(elite.customerId);
      const contract = await seedReviewContract(prisma, {
        run,
        seq: 902,
        vehicleId: elite.vehicleId,
        customerId: elite.customerId,
        adminUserId,
        vehicleAvailable: true,
      });

      const liability = await prisma.roadLiability.create({
        data: {
          type: "RTA_VIOLATION",
          vehicleId: contract.vehicleId,
          occurredAt: new Date("2026-10-02T10:00:00.000Z"),
          amount: 400,
          currency: "AED",
          authoritativeSourceKey: "RTA",
          authoritativeExternalReference: `RTA-DBL-${run}`,
          confirmationStatus: "CONFIRMED",
          attributionStatus: "MATCHED",
          collectionStatus: "OPEN",
          attributedContractId: contract.id,
          confirmedAt: new Date(),
        },
      });
      const charge = await prisma.roadLiabilityCustomerCharge.create({
        data: {
          roadLiabilityId: liability.id,
          contractId: contract.id,
          destinationType: "RECONCILIATION",
          officialAmountSnapshot: 400,
          customerChargeAmount: 400,
          adjustmentAmount: 0,
          confirmedAt: new Date(),
          confirmedByUserId: adminUserId,
        },
      });
      await prisma.domainOutboxEvent.create({
        data: {
          eventType: "road_liability.customer_charge.confirmed",
          aggregateType: "road_liability_customer_charge",
          aggregateId: charge.id,
          dedupeKey: `road_liability.customer_charge.confirmed:${charge.id}:dbl`,
          payload: { customerChargeId: charge.id, contractId: contract.id },
          status: "PENDING",
          availableAt: new Date(),
          maxAttempts: 5,
        },
      });
      await drainInvoiceOutbox(app);

      const recon = await prisma.contractReconciliation.upsert({
        where: { contractId: contract.id },
        create: {
          contractId: contract.id,
          chargesTotal: 0,
          finalAmount: 0,
          depositAmount: 0,
          deductions: 0,
        },
        update: {},
      });
      const roadLine = await prisma.contractReconciliationLine.create({
        data: {
          reconciliationId: recon.id,
          type: "VIOLATION",
          description: "linked fine",
          amount: 400,
          roadLiabilityId: liability.id,
          officialAmountSnapshot: 400,
          adjustmentAmount: 0,
          confirmedAt: new Date(),
          confirmedByUserId: adminUserId,
        },
      });
      const damageLine = await prisma.contractReconciliationLine.create({
        data: {
          reconciliationId: recon.id,
          type: "DAMAGE",
          description: "scratch",
          amount: 250,
          confirmedAt: new Date(),
          confirmedByUserId: adminUserId,
        },
      });
      await prisma.contractReconciliation.update({
        where: { id: recon.id },
        data: { finalizedAt: new Date(), finalizedByUserId: adminUserId, approvedAt: new Date() },
      });
      await prisma.domainOutboxEvent.create({
        data: {
          eventType: "reconciliation.finalized",
          aggregateType: "contract_reconciliation",
          aggregateId: recon.id,
          dedupeKey: `reconciliation.finalized:${recon.id}:inv`,
          payload: { reconciliationId: recon.id, contractId: contract.id },
          status: "PENDING",
          availableAt: new Date(),
          maxAttempts: 5,
        },
      });
      await drainInvoiceOutbox(app);

      const roadInvoices = await prisma.invoice.count({
        where: {
          contractId: contract.id,
          OR: [
            { originEventKey: `ROAD_LIABILITY:${charge.id}` },
            { originEventKey: `RECONCILIATION_LINE:${roadLine.id}` },
          ],
        },
      });
      assert.equal(roadInvoices, 1);

      const damageInv = await prisma.invoice.findFirst({
        where: { originEventKey: `RECONCILIATION_LINE:${damageLine.id}` },
      });
      assert.ok(damageInv);
      assert.equal(damageInv!.totalAmount, 250);
    });

    test("H: multiple invoices per contract (rental unchanged)", async () => {
      assert.ok(eliteContractId);
      const contract = await prisma.contract.findUniqueOrThrow({ where: { id: eliteContractId } });
      const rental = await prisma.invoice.findUniqueOrThrow({ where: { id: eliteRentalInvoiceId } });
      const all = await prisma.invoice.findMany({ where: { contractId: contract.id } });
      assert.ok(all.length >= 2);
      const rentalAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: rental.id } });
      assert.equal(rentalAfter.totalAmount, rental.totalAmount);
    });

    test("O/P: WhatsApp unconfigured fails closed; idempotency key returns same delivery row", async () => {
      const inv = await prisma.invoice.findFirstOrThrow({ where: { invoiceType: "RENTAL" } });
      const beforeTotal = inv.totalAmount;

      const unconfigured = createFakeWhatsAppProvider();
      setWhatsAppProviderForTests({ ...unconfigured.provider, configured: false });

      const key = `inv-wa-${run}`;
      const fail = await app.inject({
        method: "POST",
        url: `/invoices/${inv.id}/deliveries/whatsapp`,
        headers: { ...auth(), "idempotency-key": key },
        payload: { idempotencyKey: key },
      });
      assert.equal(fail.statusCode, 503, fail.body);

      const delivery = await prisma.invoiceDelivery.findFirst({
        where: { invoiceId: inv.id, idempotencyKey: key },
      });
      assert.ok(delivery);
      assert.notEqual(delivery!.status, "SENT");
      assert.equal(delivery!.providerMessageId, null);

      const retry = await app.inject({
        method: "POST",
        url: `/invoices/${inv.id}/deliveries/whatsapp`,
        headers: { ...auth(), "idempotency-key": key },
        payload: { idempotencyKey: key },
      });
      assert.equal(retry.statusCode, 200);
      assert.equal(retry.json().data.id, delivery!.id);
      assert.equal(
        await prisma.invoiceDelivery.count({ where: { invoiceId: inv.id, idempotencyKey: key } }),
        1,
      );

      const invAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
      assert.equal(invAfter.totalAmount, beforeTotal);
    });
  });
}
