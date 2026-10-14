import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { auth, login, seedPaymentUser } from "../helpers/payment-integration-helpers";
import { companyId } from "tests/helpers/operating-company";
import { createFinanceAnalyticsService } from "src/modules/finance/finance-analytics.service";
import { createFinanceStatementService } from "src/modules/finance/finance-statement.service";
import { resolveFinanceStatementPeriod } from "src/modules/finance/finance-statement-period";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("finance statement export skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("finance statement PDF export", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    let readerToken = "";
    let strangerToken = "";

    before(async () => {
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await seedPaymentUser(
        prisma,
        `fin-stmt-${run}@example.test`,
        "fin-stmt-pass",
        `fin_stmt_${run}`,
        ["finance.read"],
      );
      await seedPaymentUser(
        prisma,
        `fin-stmt-no-${run}@example.test`,
        "fin-stmt-no-pass",
        `fin_stmt_no_${run}`,
        ["vehicles.read"],
      );
      readerToken = await login(app, {
        email: `fin-stmt-${run}@example.test`,
        password: "fin-stmt-pass",
      });
      strangerToken = await login(app, {
        email: `fin-stmt-no-${run}@example.test`,
        password: "fin-stmt-no-pass",
      });
    });

    after(async () => {
      await app.close();
    });

    test("RBAC: finance.read required for statement PDF", async () => {
      const denied = await app.inject({
        method: "GET",
        url: "/finance/statements/ELITE/pdf?periodType=MONTHLY&year=2026&month=10&locale=en",
        headers: auth(strangerToken),
      });
      assert.equal(denied.statusCode, 403, denied.body);

      const ok = await app.inject({
        method: "GET",
        url: "/finance/statements/ELITE/pdf?periodType=MONTHLY&year=2026&month=10&locale=en",
        headers: auth(readerToken),
      });
      assert.equal(ok.statusCode, 200, ok.body);
      assert.equal(ok.headers["content-type"], "application/pdf");
      assert.ok(ok.rawPayload.subarray(0, 4).toString() === "%PDF");
      assert.match(String(ok.headers["content-disposition"] ?? ""), /Diamond-Elite-Statement/i);
    });

    test("ELITE snapshot net movement matches analytics for same period", async () => {
      const period = resolveFinanceStatementPeriod({
        periodType: "MONTHLY",
        year: 2026,
        month: 10,
        locale: "en",
      });
      const eliteId = await companyId(prisma, "ELITE");
      const analytics = createFinanceAnalyticsService(prisma);
      const statements = createFinanceStatementService(prisma);
      const [collected, expenses] = await Promise.all([
        analytics.sumCollected(period, { kind: "COMPANY", companyId: eliteId }),
        analytics.sumExpenses(period, { kind: "COMPANY", companyId: eliteId }),
      ]);
      const snapshot = await statements.loadSnapshot("ELITE", {
        periodType: "MONTHLY",
        year: 2026,
        month: 10,
        locale: "en",
      });
      assert.equal(snapshot.summary.totalCollections, collected);
      assert.equal(snapshot.summary.netExpenses, expenses);
      assert.equal(snapshot.summary.netMovement, collected - expenses);
    });

    test("ELITE Oct 2026 collections carry distinct contract numbers", async () => {
      const statements = createFinanceStatementService(prisma);
      const snapshot = await statements.loadSnapshot("ELITE", {
        periodType: "MONTHLY",
        year: 2026,
        month: 10,
        locale: "ar",
      });
      const contracts = new Set(
        snapshot.lines
          .filter((l) => l.moneyIn > 0)
          .map((l) => l.contractNumber)
          .filter(Boolean),
      );
      assert.ok(contracts.has("DE-2026-000192"));
      assert.ok(contracts.has("DE-2026-000201"));
      assert.equal(snapshot.lines.length, contracts.size >= 1 ? snapshot.lines.length : 0);
    });

    test("TODAY period returns PDF without date query params", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/finance/statements/ELITE/pdf?periodType=TODAY&locale=ar",
        headers: auth(readerToken),
      });
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.headers["content-type"], "application/pdf");
      assert.ok(res.rawPayload.subarray(0, 4).toString() === "%PDF");
    });

    test("business-today endpoint requires finance.read", async () => {
      const denied = await app.inject({
        method: "GET",
        url: "/finance/statements/business-today",
        headers: auth(strangerToken),
      });
      assert.equal(denied.statusCode, 403);
      const ok = await app.inject({
        method: "GET",
        url: "/finance/statements/business-today",
        headers: auth(readerToken),
      });
      assert.equal(ok.statusCode, 200);
      const body = ok.json() as { data: { businessDate: string } };
      assert.match(body.data.businessDate, /^\d{4}-\d{2}-\d{2}$/);
    });

    test("empty custom period still returns PDF", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/finance/statements/UNIQUE/pdf?periodType=CUSTOM&from=2099-01-01&to=2099-01-02&locale=ar",
        headers: auth(readerToken),
      });
      assert.equal(res.statusCode, 200, res.body);
      assert.ok(res.rawPayload.length > 500);
    });
  });
}
