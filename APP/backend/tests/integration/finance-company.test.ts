/**
 * Finance company classification (Phase C1).
 *
 * Diamond Finance understands UNIQUE, ELITE and GENERAL. GENERAL is NOT an
 * operating company: it is `companyId IS NULL`, produced by a Manual Expense with
 * no Vehicle (office rent, marketing). These tests pin the three rules that are
 * easy to break later:
 *
 *   1. a Manual Expense NEVER takes a company from the client — it derives one
 *      from the optional Vehicle, or stays GENERAL;
 *   2. every ledger entry persists its company at WRITE TIME from its own
 *      authoritative source;
 *   3. nothing falls back to UNIQUE.
 */
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
  settlePayment,
} from "../helpers/payment-integration-helpers";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

const RUN = process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("finance company integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();
  let adminUserId = 0;
  let token = "";
  let uniqueCompanyId = 0;
  let eliteCompanyId = 0;
  let uniqueVehicleId = 0;
  let eliteVehicleId = 0;
  let customerId = 0;
  let payments: ReturnType<typeof installPaymentProvider>;

  const PERMS = [...PAYMENT_PERMS, "finance.read", "finance.manage_expenses", "maintenance.read", "maintenance.manage"];

  // Wide enough to contain every fixture date used below.
  const period = {
    from: new Date("2026-01-01T00:00:00.000Z"),
    to: new Date("2027-01-01T00:00:00.000Z"),
  };
  const periodQuery = `from=${period.from.toISOString()}&to=${period.to.toISOString()}`;

  interface ExpenseDetail {
    id: string;
    amount: number;
    company: { id: number; code: string; displayName: string; accentColor: string } | null;
    vehicle: { id: number } | null;
  }

  interface LedgerRow {
    id: string;
    kind: string;
    manualExpenseId: string | null;
    contractPaymentId: string | null;
    maintenanceOrderId: number | null;
    amount: number;
    company: { id: number; code: string } | null;
  }

  async function createExpense(payload: Record<string, unknown>): Promise<ExpenseDetail> {
    const res = await app.inject({
      method: "POST",
      url: "/finance/expenses",
      headers: auth(token),
      payload,
    });
    assert.equal(res.statusCode, 200, res.body);
    return res.json().data as ExpenseDetail;
  }

  async function correctExpense(
    id: string,
    payload: Record<string, unknown>,
  ): Promise<ExpenseDetail> {
    const res = await app.inject({
      method: "POST",
      url: `/finance/expenses/${id}/correct`,
      headers: auth(token),
      payload,
    });
    assert.equal(res.statusCode, 200, res.body);
    return res.json().data as ExpenseDetail;
  }

  async function ledgerRows(query: string): Promise<LedgerRow[]> {
    const res = await app.inject({
      method: "GET",
      url: `/finance/ledger?pageSize=100&${query}`,
      headers: auth(token),
    });
    assert.equal(res.statusCode, 200, res.body);
    return res.json().data as LedgerRow[];
  }

  async function ledgerEntryFor(manualExpenseId: string) {
    return prisma.financialLedgerEntry.findFirstOrThrow({
      where: { manualExpenseId, kind: "MANUAL_EXPENSE" },
      select: { companyId: true, amount: true },
    });
  }

  function expenseBody(overrides: Record<string, unknown> = {}) {
    return {
      amount: 100,
      category: "OPERATIONS",
      recognizedAt: "2026-06-10T10:00:00.000Z",
      description: `Company classification ${run}`,
      ...overrides,
    };
  }

  before(async () => {
    const { env } = await import("src/config/env");
    if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
      throw new Error("finance company integration refuses to run unless DATABASE_URL is haidara_test");
    }
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    payments = installPaymentProvider(`fc${run}`);

    adminUserId = await seedPaymentUser(
      prisma,
      `finance-company-${run}@example.test`,
      "finance-pass-123",
      `finance_company_${run}`,
      PERMS,
    );
    token = await login(app, {
      email: `finance-company-${run}@example.test`,
      password: "finance-pass-123",
    });

    uniqueCompanyId = await testCompanyId(prisma, "UNIQUE");
    eliteCompanyId = await testCompanyId(prisma, "ELITE");

    const uniqueVehicle = await prisma.vehicle.create({
      data: {
        companyId: uniqueCompanyId,
        vehicleName: `FC Unique ${run}`,
        plateNumber: `FCU ${run}`,
        operationalStatus: "AVAILABLE",
        dailyRate: 500,
      },
    });
    uniqueVehicleId = uniqueVehicle.id;

    const eliteVehicle = await prisma.vehicle.create({
      data: {
        companyId: eliteCompanyId,
        vehicleName: `FC Elite ${run}`,
        plateNumber: `FCE ${run}`,
        operationalStatus: "AVAILABLE",
        dailyRate: 600,
      },
    });
    eliteVehicleId = eliteVehicle.id;

    const customer = await prisma.customer.create({ data: { name: `FC Customer ${run}` } });
    customerId = customer.id;
  });

  after(async () => {
    await app.close();
  });

  // ---- Manual Expense create ---------------------------------------------

  test("a UNIQUE Vehicle makes the expense UNIQUE, and its ledger entry too", async () => {
    const expense = await createExpense(expenseBody({ vehicleId: uniqueVehicleId, amount: 111 }));
    assert.equal(expense.company?.id, uniqueCompanyId);
    assert.equal(expense.company?.code, "UNIQUE");

    const stored = await prisma.manualExpense.findUniqueOrThrow({
      where: { id: expense.id },
      select: { companyId: true },
    });
    assert.equal(stored.companyId, uniqueCompanyId);
    assert.equal((await ledgerEntryFor(expense.id)).companyId, uniqueCompanyId);
  });

  test("an ELITE Vehicle makes the expense ELITE, and its ledger entry too", async () => {
    const expense = await createExpense(expenseBody({ vehicleId: eliteVehicleId, amount: 222 }));
    assert.equal(expense.company?.id, eliteCompanyId);
    assert.equal(expense.company?.code, "ELITE");
    assert.equal((await ledgerEntryFor(expense.id)).companyId, eliteCompanyId);
  });

  test("no Vehicle means GENERAL: company is null, and never UNIQUE or ELITE", async () => {
    const expense = await createExpense(
      expenseBody({ amount: 333, category: "OFFICE_ADMIN", description: `Office rent ${run}` }),
    );
    assert.equal(expense.company, null);
    assert.equal(expense.vehicle, null);

    const stored = await prisma.manualExpense.findUniqueOrThrow({
      where: { id: expense.id },
      select: { companyId: true },
    });
    assert.equal(stored.companyId, null);
    assert.notEqual(stored.companyId, uniqueCompanyId);
    assert.notEqual(stored.companyId, eliteCompanyId);

    const entry = await ledgerEntryFor(expense.id);
    assert.equal(entry.companyId, null);
  });

  test("a client cannot force a company that contradicts the Vehicle", async () => {
    // The request carries an ELITE companyId alongside a UNIQUE vehicle. The
    // Backend owns the classification, so the Vehicle wins and the input is dropped.
    const expense = await createExpense(
      expenseBody({ vehicleId: uniqueVehicleId, amount: 444, companyId: eliteCompanyId }),
    );
    assert.equal(expense.company?.id, uniqueCompanyId);
    assert.equal((await ledgerEntryFor(expense.id)).companyId, uniqueCompanyId);
  });

  test("a client cannot give a GENERAL expense a company", async () => {
    const expense = await createExpense(
      expenseBody({ amount: 555, companyId: uniqueCompanyId, companyScope: "UNIQUE" }),
    );
    assert.equal(expense.company, null);
    assert.equal((await ledgerEntryFor(expense.id)).companyId, null);
  });

  // ---- Manual Expense update ---------------------------------------------

  test("changing the Vehicle from UNIQUE to ELITE recalculates the company", async () => {
    const expense = await createExpense(expenseBody({ vehicleId: uniqueVehicleId, amount: 666 }));
    assert.equal(expense.company?.id, uniqueCompanyId);

    const corrected = await correctExpense(
      expense.id,
      expenseBody({ vehicleId: eliteVehicleId, amount: 666 }),
    );
    assert.equal(corrected.company?.id, eliteCompanyId);
    assert.equal((await ledgerEntryFor(expense.id)).companyId, eliteCompanyId);
  });

  test("removing the Vehicle makes the expense GENERAL", async () => {
    const expense = await createExpense(expenseBody({ vehicleId: eliteVehicleId, amount: 777 }));
    assert.equal(expense.company?.id, eliteCompanyId);

    const corrected = await correctExpense(expense.id, expenseBody({ vehicleId: null, amount: 777 }));
    assert.equal(corrected.company, null);
    assert.equal((await ledgerEntryFor(expense.id)).companyId, null);
  });

  test("adding a Vehicle to a GENERAL expense classifies it", async () => {
    const expense = await createExpense(expenseBody({ amount: 888 }));
    assert.equal(expense.company, null);

    const corrected = await correctExpense(
      expense.id,
      expenseBody({ vehicleId: uniqueVehicleId, amount: 888 }),
    );
    assert.equal(corrected.company?.id, uniqueCompanyId);
    assert.equal((await ledgerEntryFor(expense.id)).companyId, uniqueCompanyId);
  });

  test("correcting only the amount preserves the company", async () => {
    const expense = await createExpense(expenseBody({ vehicleId: eliteVehicleId, amount: 999 }));
    const corrected = await correctExpense(
      expense.id,
      expenseBody({ vehicleId: eliteVehicleId, amount: 1009 }),
    );
    assert.equal(corrected.company?.id, eliteCompanyId);

    const entry = await ledgerEntryFor(expense.id);
    assert.equal(entry.companyId, eliteCompanyId);
    assert.equal(entry.amount, 1009);
  });

  test("voiding an expense writes a reversal under the same company", async () => {
    const expense = await createExpense(expenseBody({ vehicleId: eliteVehicleId, amount: 1200 }));
    const res = await app.inject({
      method: "POST",
      url: `/finance/expenses/${expense.id}/void`,
      headers: auth(token),
      payload: { voidReason: "duplicate" },
    });
    assert.equal(res.statusCode, 200, res.body);

    const reversal = await prisma.financialLedgerEntry.findFirstOrThrow({
      where: { manualExpenseId: expense.id, kind: "MANUAL_EXPENSE_REVERSAL" },
      select: { companyId: true },
    });
    assert.equal(reversal.companyId, eliteCompanyId);
  });

  // ---- Ledger: contract and maintenance ----------------------------------

  async function stripeRentalLedger(vehicleId: number, suffix: string) {
    const contract = await prisma.contract.create({
      data: {
        // The Contract's company is frozen history: the ledger must use THIS,
        // not the Vehicle's current company.
        companyId: vehicleId === uniqueVehicleId ? uniqueCompanyId : eliteCompanyId,
        contractNumber: `FC-${suffix}-${run}`,
        status: "SIGNED",
        vehicleId,
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

    const { createContractPaymentService } = await import(
      "src/modules/contracts/payment/contract-payment.service"
    );
    const started = await createContractPaymentService(prisma).startPayment({
      purpose: "RENTAL",
      targetId: contract.id,
      createdByUserId: adminUserId,
    });
    payments.confirm();
    await settlePayment(app, payments, started.payment.id);

    return prisma.financialLedgerEntry.findFirstOrThrow({
      where: { contractPaymentId: started.payment.id, kind: "RENTAL_PAYMENT" },
      select: { companyId: true, amount: true },
    });
  }

  test("a UNIQUE contract payment lands on a UNIQUE ledger entry", async () => {
    const entry = await stripeRentalLedger(uniqueVehicleId, "UQ");
    assert.equal(entry.companyId, uniqueCompanyId);
  });

  test("an ELITE contract payment lands on an ELITE ledger entry", async () => {
    const entry = await stripeRentalLedger(eliteVehicleId, "EL");
    assert.equal(entry.companyId, eliteCompanyId);
  });

  async function maintenanceLedger(vehicleId: number, cost: number) {
    const order = await prisma.maintenanceOrder.create({
      data: {
        vehicleId,
        status: "COMPLETED",
        maintenanceType: "MECHANICAL",
        issueDescription: `FC maintenance ${run}`,
        completedAt: new Date("2026-06-15T10:00:00.000Z"),
        cost,
        createdByUserId: adminUserId,
      },
    });

    const { withTransaction } = await import("src/lib/db/transaction");
    const { recordMaintenanceExpenseLedger } = await import(
      "src/modules/finance/finance-ledger.service"
    );
    await withTransaction(prisma, (tx) => recordMaintenanceExpenseLedger(tx, order.id));

    return prisma.financialLedgerEntry.findFirstOrThrow({
      where: { maintenanceOrderId: order.id },
      select: { companyId: true },
    });
  }

  test("a UNIQUE vehicle's maintenance cost is a UNIQUE expense", async () => {
    assert.equal((await maintenanceLedger(uniqueVehicleId, 300)).companyId, uniqueCompanyId);
  });

  test("an ELITE vehicle's maintenance cost is an ELITE expense", async () => {
    assert.equal((await maintenanceLedger(eliteVehicleId, 400)).companyId, eliteCompanyId);
  });

  test("no ledger writer leaves an entry without the company of its own source", async () => {
    const mismatchedContracts = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM "financial_ledger_entries" fle
      JOIN "contracts" c ON c."id" = fle."contractId"
      WHERE fle."companyId" IS DISTINCT FROM c."companyId"
    `;
    assert.equal(Number(mismatchedContracts[0]?.count ?? 0), 0);

    const mismatchedExpenses = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM "financial_ledger_entries" fle
      JOIN "manual_expenses" me ON me."id" = fle."manualExpenseId"
      WHERE fle."companyId" IS DISTINCT FROM me."companyId"
    `;
    assert.equal(Number(mismatchedExpenses[0]?.count ?? 0), 0);
  });

  test("GENERAL is never an OperatingCompany row", async () => {
    const codes = (
      await prisma.operatingCompany.findMany({ select: { code: true } })
    ).map((company) => company.code);
    assert.deepEqual([...codes].sort(), ["ELITE", "UNIQUE"]);
  });

  // ---- Filters ------------------------------------------------------------

  test("the UNIQUE filter returns UNIQUE rows only", async () => {
    const rows = await ledgerRows(`${periodQuery}&companyId=${uniqueCompanyId}`);
    assert.ok(rows.length > 0);
    for (const row of rows) assert.equal(row.company?.id, uniqueCompanyId);
  });

  test("the ELITE filter returns ELITE rows only", async () => {
    const rows = await ledgerRows(`${periodQuery}&companyId=${eliteCompanyId}`);
    assert.ok(rows.length > 0);
    for (const row of rows) assert.equal(row.company?.id, eliteCompanyId);
  });

  test("the GENERAL filter returns company-less rows only", async () => {
    const rows = await ledgerRows(`${periodQuery}&companyScope=GENERAL`);
    assert.ok(rows.length > 0);
    for (const row of rows) assert.equal(row.company, null);
  });

  test("ALL includes UNIQUE, ELITE and GENERAL together", async () => {
    const totalFor = async (query: string) => {
      const res = await app.inject({
        method: "GET",
        url: `/finance/ledger?pageSize=1&${query}`,
        headers: auth(token),
      });
      assert.equal(res.statusCode, 200, res.body);
      return res.json().meta.total as number;
    };

    const [all, unique, elite, general] = await Promise.all([
      totalFor(periodQuery),
      totalFor(`${periodQuery}&companyId=${uniqueCompanyId}`),
      totalFor(`${periodQuery}&companyId=${eliteCompanyId}`),
      totalFor(`${periodQuery}&companyScope=GENERAL`),
    ]);

    assert.ok(unique > 0);
    assert.ok(elite > 0);
    assert.ok(general > 0);
    // ALL is the ABSENCE of a company predicate, so it must equal the three parts.
    // Expressed as `companyId IS NOT NULL` it would silently drop GENERAL.
    assert.equal(all, unique + elite + general);
  });

  test("the company filter composes with the date window and the direction filter", async () => {
    const outside = await ledgerRows(
      `from=2020-01-01T00:00:00.000Z&to=2020-02-01T00:00:00.000Z&companyId=${eliteCompanyId}`,
    );
    assert.equal(outside.length, 0);

    const expenses = await ledgerRows(`${periodQuery}&companyId=${eliteCompanyId}&direction=EXPENSE`);
    for (const row of expenses) {
      assert.equal(row.company?.id, eliteCompanyId);
      assert.ok(["MANUAL_EXPENSE", "MAINTENANCE_EXPENSE"].includes(row.kind), row.kind);
    }
  });

  test("companyScope=GENERAL cannot be combined with a companyId", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/finance/ledger?${periodQuery}&companyScope=GENERAL&companyId=${uniqueCompanyId}`,
      headers: auth(token),
    });
    assert.equal(res.statusCode, 422, res.body);
    assert.equal(res.json().error.context.reason, "FINANCE_COMPANY_SCOPE_CONFLICT");
  });

  // ---- Aggregates ---------------------------------------------------------

  async function summary(query: string) {
    const res = await app.inject({
      method: "GET",
      url: `/finance/summary?${periodQuery}&${query}`,
      headers: auth(token),
    });
    assert.equal(res.statusCode, 200, res.body);
    return res.json().data as { collected: number; expenses: number; outstanding: number };
  }

  test("scoped totals match the scoped rows and add up to ALL", async () => {
    const [all, unique, elite, general] = await Promise.all([
      summary(""),
      summary(`companyId=${uniqueCompanyId}`),
      summary(`companyId=${eliteCompanyId}`),
      summary("companyScope=GENERAL"),
    ]);

    assert.equal(all.collected, unique.collected + elite.collected + general.collected);
    assert.equal(all.expenses, unique.expenses + elite.expenses + general.expenses);

    // GENERAL is Manual Expense only: no contract money is ever company-less.
    assert.equal(general.collected, 0);
    assert.ok(general.expenses > 0);

    const generalRows = await ledgerRows(`${periodQuery}&companyScope=GENERAL&direction=EXPENSE`);
    const generalRowTotal = generalRows.reduce((sum, row) => sum + row.amount, 0);
    assert.equal(general.expenses, generalRowTotal);
  });

  test("open receivables scope through the Contract company, and GENERAL has none", async () => {
    const fetchReceivables = async (query: string) => {
      const res = await app.inject({
        method: "GET",
        url: `/finance/open-receivables?pageSize=100&${query}`,
        headers: auth(token),
      });
      assert.equal(res.statusCode, 200, res.body);
      return res.json().data as { company: { id: number } | null }[];
    };

    const unique = await fetchReceivables(`companyId=${uniqueCompanyId}`);
    for (const row of unique) assert.equal(row.company?.id, uniqueCompanyId);

    const elite = await fetchReceivables(`companyId=${eliteCompanyId}`);
    for (const row of elite) assert.equal(row.company?.id, eliteCompanyId);

    assert.deepEqual(await fetchReceivables("companyScope=GENERAL"), []);
  });
}
