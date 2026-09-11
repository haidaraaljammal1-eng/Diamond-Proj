import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import {
  auth,
  installPaymentProvider,
  login,
  PAYMENT_PERMS,
  seedPaymentUser,
  seedReviewContract,
  approveReconciliation570,
  startReconciliationPayment,
  settlePayment,
} from "../helpers/payment-integration-helpers";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("finance integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();
  let adminUserId = 0;
  let token = "";
  let vehicleId = 0;
  let customerId = 0;
  let payments: ReturnType<typeof installPaymentProvider>;

  const FINANCE_PERMS = [
    ...PAYMENT_PERMS,
    "finance.read",
    "finance.manage_expenses",
    "maintenance.read",
    "maintenance.manage",
    "violations.read",
    "violations.charge",
  ];

  const period = {
    from: new Date("2026-01-01T00:00:00.000Z"),
    to: new Date("2027-01-01T00:00:00.000Z"),
  };

  before(async () => {
    const { env } = await import("src/config/env");
    if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
      throw new Error("finance integration refuses to run unless DATABASE_URL is haidara_test");
    }
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    payments = installPaymentProvider(run);
    adminUserId = await seedPaymentUser(
      prisma,
      `finance-admin-${run}@example.test`,
      "finance-pass-123",
      `finance_admin_${run}`,
      FINANCE_PERMS,
    );
    token = await login(app, {
      email: `finance-admin-${run}@example.test`,
      password: "finance-pass-123",
    });

    const vehicle = await prisma.vehicle.create({
      data: {
        vehicleName: `Finance Vehicle ${run}`,
        plateNumber: `FIN ${run}`,
        operationalStatus: "AVAILABLE",
        dailyRate: 500,
      },
    });
    vehicleId = vehicle.id;
    const customer = await prisma.customer.create({
      data: { name: `Finance Customer ${run}` },
    });
    customerId = customer.id;
  });

  after(async () => {
    await app.close();
  });

  async function financeSummary() {
    const res = await app.inject({
      method: "GET",
      url: `/finance/summary?from=${period.from.toISOString()}&to=${period.to.toISOString()}`,
      headers: auth(token),
    });
    assert.equal(res.statusCode, 200, res.body);
    return res.json().data as {
      collected: number;
      outstanding: number;
      expenses: number;
      netMovement: number;
    };
  }

  test("legacy MANUAL and BANK_TRANSFER confirmed payments do not increase Collected", async () => {
    const manualContract = await prisma.contract.create({
      data: {
        contractNumber: `FIN-MAN-${run}`,
        status: "PAID",
        vehicleId,
        customerId,
        createdByUserId: adminUserId,
        priceType: "DAILY",
        rentalDays: 3,
        agreedAmount: 500,
      },
    });
    const bankContract = await prisma.contract.create({
      data: {
        contractNumber: `FIN-BNK-${run}`,
        status: "PAID",
        vehicleId,
        customerId,
        createdByUserId: adminUserId,
        priceType: "DAILY",
        rentalDays: 3,
        agreedAmount: 500,
      },
    });
    const manualPayment = await prisma.contractPayment.create({
      data: {
        contractId: manualContract.id,
        purpose: "RENTAL",
        targetId: manualContract.id,
        amount: 500,
        method: "MANUAL",
        status: "CONFIRMED",
        confirmedAt: new Date("2026-06-01T10:00:00.000Z"),
        createdByUserId: adminUserId,
      },
    });
    const bankPayment = await prisma.contractPayment.create({
      data: {
        contractId: bankContract.id,
        purpose: "RENTAL",
        targetId: bankContract.id,
        amount: 500,
        method: "BANK_TRANSFER",
        status: "CONFIRMED",
        confirmedAt: new Date("2026-06-02T10:00:00.000Z"),
        createdByUserId: adminUserId,
      },
    });

    const before = await financeSummary();
    assert.equal(
      await prisma.financialLedgerEntry.count({ where: { contractPaymentId: manualPayment.id } }),
      0,
    );
    assert.equal(
      await prisma.financialLedgerEntry.count({ where: { contractPaymentId: bankPayment.id } }),
      0,
    );
    const after = await financeSummary();
    assert.equal(after.collected, before.collected);
  });

  test("confirmed Stripe rental creates one collected ledger movement", async () => {
    const rentalVehicle = await prisma.vehicle.create({
      data: {
        vehicleName: `Rent Fin ${run}`,
        plateNumber: `RF ${run}`,
        operationalStatus: "AVAILABLE",
        dailyRate: 500,
      },
    });
    const signed = await prisma.contract.create({
      data: {
        contractNumber: `FIN-RENT-${run}`,
        status: "SIGNED",
        vehicleId: rentalVehicle.id,
        customerId,
        createdByUserId: adminUserId,
        priceType: "DAILY",
        rentalDays: 3,
        agreedAmount: 1500,
        acceptance: {
          create: {
            acceptedAt: new Date("2026-06-01T10:00:00.000Z"),
            termsVersion: "diamond-rental-terms-v1",
          },
        },
      },
    });

    const openBefore = await app.inject({
      method: "GET",
      url: `/finance/open-receivables?sourceType=RENTAL&search=FIN-RENT-${run}`,
      headers: auth(token),
    });
    assert.equal(openBefore.statusCode, 200, openBefore.body);
    assert.ok(
      openBefore.json().data.some(
        (row: { sourceId: string }) => row.sourceId === signed.id,
      ),
      openBefore.body,
    );

    const { createContractPaymentService } = await import(
      "src/modules/contracts/payment/contract-payment.service"
    );
    const paymentService = createContractPaymentService(prisma);
    const started = await paymentService.startPayment({
      purpose: "RENTAL",
      targetId: signed.id,
      createdByUserId: adminUserId,
    });
    const paymentId = started.payment.id;
    payments.confirm();
    await settlePayment(app, payments, paymentId);

    const ledgerCount = await prisma.financialLedgerEntry.count({
      where: { contractPaymentId: paymentId, kind: "RENTAL_PAYMENT" },
    });
    assert.equal(ledgerCount, 1);

    const summary = await financeSummary();
    assert.ok(summary.collected >= 1500);

    const openAfter = await app.inject({
      method: "GET",
      url: `/finance/open-receivables?sourceType=RENTAL&search=FIN-RENT-${run}`,
      headers: auth(token),
    });
    assert.equal(
      openAfter.json().data.some((row: { sourceId: string }) => row.sourceId === signed.id),
      false,
    );
  });

  test("maintenance expense is recognized only on completion with cost", async () => {
    const vehicle = await prisma.vehicle.create({
      data: {
        vehicleName: `Maint Fin ${run}`,
        plateNumber: `MF ${run}`,
        operationalStatus: "SERVICE",
        dailyRate: 400,
      },
    });
    const order = await prisma.maintenanceOrder.create({
      data: {
        vehicleId: vehicle.id,
        status: "READY_FOR_PICKUP",
        maintenanceType: "MECHANICAL",
        issueDescription: "Brake pads",
        cost: 850,
        createdByUserId: adminUserId,
      },
    });

    const before = await financeSummary();
    const complete = await app.inject({
      method: "POST",
      url: `/maintenance/${order.id}/complete`,
      headers: auth(token),
    });
    assert.equal(complete.statusCode, 200, complete.body);

    const ledgerCount = await prisma.financialLedgerEntry.count({
      where: { maintenanceOrderId: order.id, kind: "MAINTENANCE_EXPENSE" },
    });
    assert.equal(ledgerCount, 1);

    const after = await financeSummary();
    assert.equal(after.expenses - before.expenses, 850);
    assert.equal(after.netMovement - before.netMovement, -850);
  });

  test("manual expense create and void adjust expenses without touching outstanding", async () => {
    const outstandingBefore = (await financeSummary()).outstanding;
    const expensesBefore = (await financeSummary()).expenses;
    const createRes = await app.inject({
      method: "POST",
      url: "/finance/expenses",
      headers: auth(token),
      payload: {
        amount: 100,
        category: "VEHICLE_CLEANING",
        recognizedAt: "2026-07-01T10:00:00.000Z",
        description: "Interior cleaning",
        vehicleId,
      },
    });
    assert.equal(createRes.statusCode, 200, createRes.body);
    const expenseId = createRes.json().data.id as string;
    assert.equal(createRes.json().data.createdBy.id, adminUserId);

    const afterCreate = await financeSummary();
    assert.equal(afterCreate.outstanding, outstandingBefore);
    assert.equal(afterCreate.expenses - expensesBefore, 100);

    const voidRes = await app.inject({
      method: "POST",
      url: `/finance/expenses/${expenseId}/void`,
      headers: auth(token),
      payload: { voidReason: "Wrong amount" },
    });
    assert.equal(voidRes.statusCode, 200, voidRes.body);
    assert.equal(voidRes.json().data.status, "VOID");

    const duplicateVoid = await app.inject({
      method: "POST",
      url: `/finance/expenses/${expenseId}/void`,
      headers: auth(token),
      payload: { voidReason: "Repeat" },
    });
    assert.equal(duplicateVoid.statusCode, 200);

    const afterVoid = await financeSummary();
    assert.equal(afterVoid.expenses - expensesBefore, 0);
  });

  test("manual expense correction preserves audit trail and net expense", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/finance/expenses",
      headers: auth(token),
      payload: {
        amount: 100,
        category: "VEHICLE_CLEANING",
        recognizedAt: "2026-08-01T10:00:00.000Z",
        description: "Wrong entry",
      },
    });
    const expenseId = createRes.json().data.id as string;
    const corrected = await app.inject({
      method: "POST",
      url: `/finance/expenses/${expenseId}/correct`,
      headers: auth(token),
      payload: {
        amount: 80,
        category: "VEHICLE_CLEANING",
        recognizedAt: "2026-08-01T10:00:00.000Z",
        description: "Corrected entry",
        voidReason: "Amount correction",
      },
    });
    assert.equal(corrected.statusCode, 200, corrected.body);
    assert.equal(corrected.json().data.amount, 80);
    assert.equal(corrected.json().data.correctionOfExpenseId, expenseId);

    const original = await prisma.manualExpense.findUniqueOrThrow({ where: { id: expenseId } });
    assert.equal(original.status, "VOID");
    const ledger = await prisma.financialLedgerEntry.findMany({
      where: { manualExpenseId: { in: [expenseId, corrected.json().data.id] } },
    });
    assert.equal(ledger.length, 3);
  });

  test("reconciliation outstanding and settlement avoid double counting", async () => {
    const contract = await seedReviewContract(prisma, {
      run,
      seq: 901,
      vehicleId,
      customerId,
      adminUserId,
      vehicleAvailable: true,
    });
    const liability = await prisma.roadLiability.create({
      data: {
        type: "RTA_VIOLATION",
        vehicleId,
        occurredAt: new Date("2026-09-02T12:00:00.000Z"),
        amount: 100,
        currency: "AED",
        authoritativeSourceKey: "RTA",
        authoritativeExternalReference: `RTA-FIN-${run}-901`,
        confirmationStatus: "CONFIRMED",
        attributionStatus: "MATCHED",
        collectionStatus: "OPEN",
        attributedContractId: contract.id,
        confirmedAt: new Date(),
      },
    });
    const approved = await approveReconciliation570(app, token, contract.id, liability.id);
    assert.equal(approved.reconciliation.finalAmount, 570);

    const open = await app.inject({
      method: "GET",
      url: `/finance/open-receivables?sourceType=RECONCILIATION&search=PAY-${run}-901`,
      headers: auth(token),
    });
    assert.equal(open.statusCode, 200, open.body);
    const row = open.json().data.find(
      (r: { contractNumber: string }) => r.contractNumber === contract.contractNumber,
    );
    assert.ok(row, open.body);
    assert.equal(row.outstandingAmount, 570);

    const started = await startReconciliationPayment(app, token, contract.id);
    payments.confirm();
    await settlePayment(app, payments, started.payment.id);

    const summary = await financeSummary();
    assert.ok(summary.collected >= 570);
    const openAfter = await app.inject({
      method: "GET",
      url: `/finance/open-receivables?sourceType=RECONCILIATION&search=PAY-${run}-901`,
      headers: auth(token),
    });
    assert.equal(
      openAfter.json().data.some(
        (r: { contractNumber: string }) => r.contractNumber === contract.contractNumber,
      ),
      false,
    );
    const ledgerRows = await prisma.financialLedgerEntry.count({
      where: { contractPaymentId: started.payment.id },
    });
    assert.equal(ledgerRows, 1);
  });

  test("outstanding breakdown total matches summary outstanding", async () => {
    const summary = await financeSummary();
    const analytics = await app.inject({
      method: "GET",
      url: `/finance/analytics?from=${period.from.toISOString()}&to=${period.to.toISOString()}`,
      headers: auth(token),
    });
    const breakdownTotal = analytics.json().data.outstandingBreakdown.reduce(
      (sum: number, row: { amount: number }) => sum + row.amount,
      0,
    );
    assert.equal(breakdownTotal, summary.outstanding);
  });

  test("finance permissions are enforced", async () => {
    const denied = await app.inject({
      method: "GET",
      url: "/finance/summary",
    });
    assert.equal(denied.statusCode, 401);
  });
}
