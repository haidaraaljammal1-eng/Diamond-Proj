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
import { companyId as testCompanyId } from "tests/helpers/operating-company";

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
        companyId: await testCompanyId(prisma),
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
        companyId: await testCompanyId(prisma),
        contractNumber: `FIN-MAN-${run}`,
        status: "PAID",
        vehicleId,
        customerId,
        createdByUserId: adminUserId,
        priceType: "DAILY",
        rentalDays: 3,
        agreedAmount: 500,
          collectionMode: "ELECTRONIC",
      },
    });
    const bankContract = await prisma.contract.create({
      data: {
        companyId: await testCompanyId(prisma),
        contractNumber: `FIN-BNK-${run}`,
        status: "PAID",
        vehicleId,
        customerId,
        createdByUserId: adminUserId,
        priceType: "DAILY",
        rentalDays: 3,
        agreedAmount: 500,
          collectionMode: "ELECTRONIC",
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
        companyId: await testCompanyId(prisma),
        vehicleName: `Rent Fin ${run}`,
        plateNumber: `RF ${run}`,
        operationalStatus: "AVAILABLE",
        dailyRate: 500,
      },
    });
    const signed = await prisma.contract.create({
      data: {
        companyId: await testCompanyId(prisma),
        contractNumber: `FIN-RENT-${run}`,
        status: "SIGNED",
        vehicleId: rentalVehicle.id,
        customerId,
        createdByUserId: adminUserId,
        priceType: "DAILY",
        rentalDays: 3,
        agreedAmount: 1500,
          collectionMode: "ELECTRONIC",
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

  test("confirmed CASH rental increases Collected, ledger, analytics, net movement and company scope", async () => {
    const eliteCompanyId = await testCompanyId(prisma, "ELITE");
    const cashVehicle = await prisma.vehicle.create({
      data: {
        companyId: eliteCompanyId,
        vehicleName: `Cash Fin ${run}`,
        plateNumber: `CF ${run}`,
        operationalStatus: "AVAILABLE",
        dailyRate: 440,
      },
    });
    const cashContract = await prisma.contract.create({
      data: {
        companyId: eliteCompanyId,
        contractNumber: `FIN-CASH-${run}`,
        status: "SIGNED",
        vehicleId: cashVehicle.id,
        customerId,
        createdByUserId: adminUserId,
        priceType: "DAILY",
        rentalDays: 2,
        agreedAmount: 880,
        collectionMode: "CASH",
      },
    });

    const beforeAll = await financeSummary();
    const beforeElite = await app.inject({
      method: "GET",
      url: `/finance/summary?from=${period.from.toISOString()}&to=${period.to.toISOString()}&companyId=${eliteCompanyId}`,
      headers: auth(token),
    });
    assert.equal(beforeElite.statusCode, 200, beforeElite.body);

    const { createContractPaymentService } = await import(
      "src/modules/contracts/payment/contract-payment.service"
    );
    const paymentService = createContractPaymentService(prisma);
    const payment = await paymentService.settleCashRental(cashContract.id, adminUserId);
    assert.equal(payment.purpose, "RENTAL");
    assert.equal(payment.method, "CASH");
    assert.equal(payment.status, "CONFIRMED");
    assert.equal(payment.provider, null);
    assert.equal(payment.amount, 880);

    const ledgerCount = await prisma.financialLedgerEntry.count({
      where: { contractPaymentId: payment.id, kind: "RENTAL_PAYMENT" },
    });
    assert.equal(ledgerCount, 1);
    const ledger = await prisma.financialLedgerEntry.findFirst({
      where: { contractPaymentId: payment.id },
    });
    assert.equal(ledger?.companyId, eliteCompanyId);
    assert.notEqual(ledger?.companyId, null, "cash rental must not classify as GENERAL");

    const afterAll = await financeSummary();
    assert.equal(afterAll.collected - beforeAll.collected, 880);
    assert.equal(afterAll.netMovement - beforeAll.netMovement, 880);

    const analytics = await app.inject({
      method: "GET",
      url: `/finance/analytics?from=${period.from.toISOString()}&to=${period.to.toISOString()}`,
      headers: auth(token),
    });
    assert.equal(analytics.statusCode, 200, analytics.body);
    const trend = analytics.json().data.trend as Array<{ collected: number; netMovement: number }>;
    const totalCollected = trend.reduce((sum, row) => sum + row.collected, 0);
    assert.ok(totalCollected >= 880);

    const afterElite = await app.inject({
      method: "GET",
      url: `/finance/summary?from=${period.from.toISOString()}&to=${period.to.toISOString()}&companyId=${eliteCompanyId}`,
      headers: auth(token),
    });
    const uniqueCompanyId = await testCompanyId(prisma, "UNIQUE");
    const beforeUnique = await app.inject({
      method: "GET",
      url: `/finance/summary?from=${period.from.toISOString()}&to=${period.to.toISOString()}&companyId=${uniqueCompanyId}`,
      headers: auth(token),
    });
    const afterUnique = await app.inject({
      method: "GET",
      url: `/finance/summary?from=${period.from.toISOString()}&to=${period.to.toISOString()}&companyId=${uniqueCompanyId}`,
      headers: auth(token),
    });
    assert.equal(
      afterElite.json().data.collected - beforeElite.json().data.collected,
      880,
      afterElite.body,
    );
    assert.equal(
      afterUnique.json().data.collected,
      beforeUnique.json().data.collected,
      "UNIQUE scope must not include ELITE cash rental",
    );
  });

  test("maintenance expense is recognized only on completion with cost", async () => {
    const vehicle = await prisma.vehicle.create({
      data: {
        companyId: await testCompanyId(prisma),
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

  test("manual expense correction updates the same record in place", async () => {
    const expensesBefore = (await financeSummary()).expenses;
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
      },
    });
    assert.equal(corrected.statusCode, 200, corrected.body);
    const body = corrected.json().data;
    assert.equal(body.id, expenseId);
    assert.equal(body.amount, 80);
    assert.equal(body.status, "ACTIVE");
    assert.equal(body.correctionOfExpenseId, null);
    assert.equal(body.correctionHistory.length, 1);
    assert.deepEqual(
      body.correctionHistory[0].changes.map((change: { field: string }) => change.field).sort(),
      ["amount", "description"],
    );
    assert.equal(body.correctionHistory[0].changedBy.id, adminUserId);

    const row = await prisma.manualExpense.findUniqueOrThrow({ where: { id: expenseId } });
    assert.equal(row.status, "ACTIVE");
    assert.equal(row.amount, 80);
    const replacements = await prisma.manualExpense.count({
      where: { correctionOfExpenseId: expenseId },
    });
    assert.equal(replacements, 0);
    const ledger = await prisma.financialLedgerEntry.findMany({
      where: { manualExpenseId: expenseId },
    });
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0]?.kind, "MANUAL_EXPENSE");
    assert.equal(ledger[0]?.amount, 80);
    assert.equal((await financeSummary()).expenses - expensesBefore, 80);
  });

  test("description-only correction preserves other fields", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/finance/expenses",
      headers: auth(token),
      payload: {
        amount: 65,
        category: "FUEL",
        recognizedAt: "2026-08-02T10:00:00.000Z",
        description: "Fuel",
        vehicleId,
        vendorName: "ADNOC",
        receiptNumber: "R-65",
        note: "Keep note",
      },
    });
    const expenseId = createRes.json().data.id as string;
    const corrected = await app.inject({
      method: "POST",
      url: `/finance/expenses/${expenseId}/correct`,
      headers: auth(token),
      payload: {
        amount: 65,
        category: "FUEL",
        recognizedAt: "2026-08-02T10:00:00.000Z",
        description: "Fuel top-up",
        vehicleId,
        vendorName: "ADNOC",
        receiptNumber: "R-65",
        note: "Keep note",
      },
    });
    assert.equal(corrected.statusCode, 200, corrected.body);
    const body = corrected.json().data;
    assert.equal(body.id, expenseId);
    assert.equal(body.amount, 65);
    assert.equal(body.category, "FUEL");
    assert.equal(body.vendorName, "ADNOC");
    assert.equal(body.receiptNumber, "R-65");
    assert.equal(body.note, "Keep note");
    assert.equal(body.vehicle.id, vehicleId);
    assert.deepEqual(
      body.correctionHistory[0].changes.map((change: { field: string }) => change.field),
      ["description"],
    );
  });

  test("multiple corrections stay immutable on the same expense", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/finance/expenses",
      headers: auth(token),
      payload: {
        amount: 100,
        category: "PARKING",
        recognizedAt: "2026-08-03T10:00:00.000Z",
        description: "Parking",
      },
    });
    const expenseId = createRes.json().data.id as string;
    const first = await app.inject({
      method: "POST",
      url: `/finance/expenses/${expenseId}/correct`,
      headers: auth(token),
      payload: {
        amount: 90,
        category: "PARKING",
        recognizedAt: "2026-08-03T10:00:00.000Z",
        description: "Parking",
      },
    });
    const second = await app.inject({
      method: "POST",
      url: `/finance/expenses/${expenseId}/correct`,
      headers: auth(token),
      payload: {
        amount: 80,
        category: "PARKING",
        recognizedAt: "2026-08-03T10:00:00.000Z",
        description: "Parking",
      },
    });
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(second.statusCode, 200, second.body);
    const history = second.json().data.correctionHistory as Array<{
      changes: Array<{ field: string; before: number; after: number }>;
    }>;
    assert.equal(second.json().data.id, expenseId);
    assert.equal(second.json().data.amount, 80);
    assert.equal(history.length, 2);
    assert.equal(history[0]?.changes[0]?.before, 90);
    assert.equal(history[0]?.changes[0]?.after, 80);
    assert.equal(history[1]?.changes[0]?.before, 100);
    assert.equal(history[1]?.changes[0]?.after, 90);
  });

  test("category correction moves expense breakdown to the new category only", async () => {
    const day = String(14 + (parseInt(run.slice(-2), 36) % 10)).padStart(2, "0");
    const recognizedAt = `2027-04-${day}T10:00:00.000Z`;
    const periodFrom = `2027-04-${day}T00:00:00.000Z`;
    const periodTo = `2027-04-${day}T23:59:59.999Z`;
    const beforeAnalytics = await app.inject({
      method: "GET",
      url: `/finance/analytics?from=${periodFrom}&to=${periodTo}`,
      headers: auth(token),
    });
    assert.equal(beforeAnalytics.statusCode, 200, beforeAnalytics.body);
    const beforeBreakdown = beforeAnalytics.json().data.expenseBreakdown as Array<{
      category: string;
      amount: number;
    }>;
    const beforeCleaning =
      beforeBreakdown.find((row) => row.category === "VEHICLE_CLEANING")?.amount ?? 0;
    const beforeOperations =
      beforeBreakdown.find((row) => row.category === "OPERATIONS")?.amount ?? 0;
    const createRes = await app.inject({
      method: "POST",
      url: "/finance/expenses",
      headers: auth(token),
      payload: {
        amount: 40,
        category: "VEHICLE_CLEANING",
        recognizedAt,
        description: `Ops recode ${run}`,
      },
    });
    const expenseId = createRes.json().data.id as string;
    const corrected = await app.inject({
      method: "POST",
      url: `/finance/expenses/${expenseId}/correct`,
      headers: auth(token),
      payload: {
        amount: 40,
        category: "OPERATIONS",
        recognizedAt,
        description: `Ops recode ${run}`,
      },
    });
    assert.equal(corrected.statusCode, 200, corrected.body);
    const analytics = await app.inject({
      method: "GET",
      url: `/finance/analytics?from=${periodFrom}&to=${periodTo}`,
      headers: auth(token),
    });
    assert.equal(analytics.statusCode, 200, analytics.body);
    const breakdown = analytics.json().data.expenseBreakdown as Array<{
      category: string;
      amount: number;
    }>;
    const cleaning = breakdown.find((row) => row.category === "VEHICLE_CLEANING");
    const operations = breakdown.find((row) => row.category === "OPERATIONS");
    assert.equal(cleaning?.amount ?? 0, beforeCleaning);
    assert.equal(operations?.amount ?? 0, beforeOperations + 40);
  });

  test("date correction follows the corrected recognizedAt period", async () => {
    const dayOffset = parseInt(run.slice(-2), 36) % 12;
    const originalDay = String(12 + dayOffset).padStart(2, "0");
    const correctedDay = String(10 + dayOffset).padStart(2, "0");
    const originalAt = `2027-03-${originalDay}T10:00:00.000Z`;
    const correctedAt = `2027-03-${correctedDay}T10:00:00.000Z`;
    const oldPeriodUrl = `/finance/summary?from=2027-03-${originalDay}T00:00:00.000Z&to=2027-03-${originalDay}T23:59:59.999Z`;
    const newPeriodUrl = `/finance/summary?from=2027-03-${correctedDay}T00:00:00.000Z&to=2027-03-${correctedDay}T23:59:59.999Z`;
    const beforeOld = await app.inject({ method: "GET", url: oldPeriodUrl, headers: auth(token) });
    const beforeNew = await app.inject({ method: "GET", url: newPeriodUrl, headers: auth(token) });
    assert.equal(beforeOld.statusCode, 200, beforeOld.body);
    assert.equal(beforeNew.statusCode, 200, beforeNew.body);
    const createRes = await app.inject({
      method: "POST",
      url: "/finance/expenses",
      headers: auth(token),
      payload: {
        amount: 25,
        category: "OTHER",
        recognizedAt: originalAt,
        description: `Date move ${run}`,
      },
    });
    const expenseId = createRes.json().data.id as string;
    const corrected = await app.inject({
      method: "POST",
      url: `/finance/expenses/${expenseId}/correct`,
      headers: auth(token),
      payload: {
        amount: 25,
        category: "OTHER",
        recognizedAt: correctedAt,
        description: `Date move ${run}`,
      },
    });
    assert.equal(corrected.statusCode, 200, corrected.body);
    const afterOld = await app.inject({ method: "GET", url: oldPeriodUrl, headers: auth(token) });
    const afterNew = await app.inject({ method: "GET", url: newPeriodUrl, headers: auth(token) });
    assert.equal(afterOld.json().data.expenses, beforeOld.json().data.expenses, afterOld.body);
    assert.equal(
      afterNew.json().data.expenses - beforeNew.json().data.expenses,
      25,
      afterNew.body,
    );
    const ledger = await prisma.financialLedgerEntry.findMany({
      where: { manualExpenseId: expenseId, kind: "MANUAL_EXPENSE" },
    });
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0]?.occurredAt.toISOString(), correctedAt);
  });

  test("voided expenses cannot be corrected and no-change submissions are rejected", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/finance/expenses",
      headers: auth(token),
      payload: {
        amount: 15,
        category: "OFFICE_ADMIN",
        recognizedAt: "2026-08-11T10:00:00.000Z",
        description: "Stationery",
      },
    });
    const expenseId = createRes.json().data.id as string;
    const unchanged = await app.inject({
      method: "POST",
      url: `/finance/expenses/${expenseId}/correct`,
      headers: auth(token),
      payload: {
        amount: 15,
        category: "OFFICE_ADMIN",
        recognizedAt: "2026-08-11T10:00:00.000Z",
        description: "Stationery",
      },
    });
    assert.equal(unchanged.statusCode, 422);
    assert.equal(unchanged.json().error.context.reason, "FINANCE_EXPENSE_NO_CHANGES");
    const revisions = await prisma.manualExpenseRevision.count({
      where: { manualExpenseId: expenseId },
    });
    assert.equal(revisions, 0);

    const voidRes = await app.inject({
      method: "POST",
      url: `/finance/expenses/${expenseId}/void`,
      headers: auth(token),
      payload: { voidReason: "Entered twice" },
    });
    assert.equal(voidRes.statusCode, 200, voidRes.body);
    assert.equal(voidRes.json().data.status, "VOID");
    assert.equal(voidRes.json().data.voidReason, "Entered twice");

    const voidedCorrect = await app.inject({
      method: "POST",
      url: `/finance/expenses/${expenseId}/correct`,
      headers: auth(token),
      payload: {
        amount: 10,
        category: "OFFICE_ADMIN",
        recognizedAt: "2026-08-11T10:00:00.000Z",
        description: "Stationery",
      },
    });
    assert.equal(voidedCorrect.statusCode, 409);
    assert.equal(voidedCorrect.json().error.context.reason, "FINANCE_EXPENSE_NOT_ACTIVE");
  });

  test("later void preserves correction history and reverses the current amount", async () => {
    const expensesBefore = (await financeSummary()).expenses;
    const createRes = await app.inject({
      method: "POST",
      url: "/finance/expenses",
      headers: auth(token),
      payload: {
        amount: 100,
        category: "MARKETING",
        recognizedAt: "2026-08-12T10:00:00.000Z",
        description: "Ads",
      },
    });
    const expenseId = createRes.json().data.id as string;
    await app.inject({
      method: "POST",
      url: `/finance/expenses/${expenseId}/correct`,
      headers: auth(token),
      payload: {
        amount: 80,
        category: "MARKETING",
        recognizedAt: "2026-08-12T10:00:00.000Z",
        description: "Ads",
      },
    });
    const voidRes = await app.inject({
      method: "POST",
      url: `/finance/expenses/${expenseId}/void`,
      headers: auth(token),
      payload: { voidReason: "Duplicate ads" },
    });
    assert.equal(voidRes.statusCode, 200, voidRes.body);
    assert.equal(voidRes.json().data.status, "VOID");
    assert.equal(voidRes.json().data.correctionHistory.length, 1);
    assert.equal(voidRes.json().data.voidReason, "Duplicate ads");
    const ledger = await prisma.financialLedgerEntry.findMany({
      where: { manualExpenseId: expenseId },
    });
    assert.equal(ledger.length, 2);
    assert.ok(ledger.some((row) => row.kind === "MANUAL_EXPENSE" && row.amount === 80));
    assert.ok(ledger.some((row) => row.kind === "MANUAL_EXPENSE_REVERSAL" && row.amount === 80));
    assert.equal((await financeSummary()).expenses - expensesBefore, 0);
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
    const [summaryRes, analyticsRes] = await Promise.all([
      app.inject({
        method: "GET",
        url: `/finance/summary?from=${period.from.toISOString()}&to=${period.to.toISOString()}`,
        headers: auth(token),
      }),
      app.inject({
        method: "GET",
        url: `/finance/analytics?from=${period.from.toISOString()}&to=${period.to.toISOString()}`,
        headers: auth(token),
      }),
    ]);
    assert.equal(summaryRes.statusCode, 200, summaryRes.body);
    assert.equal(analyticsRes.statusCode, 200, analyticsRes.body);
    const summary = summaryRes.json().data as { outstanding: number };
    const breakdownTotal = analyticsRes.json().data.outstandingBreakdown.reduce(
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
