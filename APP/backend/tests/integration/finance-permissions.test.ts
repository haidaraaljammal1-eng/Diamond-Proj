import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { auth, login, seedPaymentUser } from "../helpers/payment-integration-helpers";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("finance permissions skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("finance permissions", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    let readerToken = "";
    let strangerToken = "";

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("finance permissions tests require haidara_test");
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;

      await seedPaymentUser(
        prisma,
        `fin-reader-${run}@example.test`,
        "fin-reader-pass",
        `fin_reader_${run}`,
        ["finance.read"],
      );
      await seedPaymentUser(
        prisma,
        `fin-stranger-${run}@example.test`,
        "fin-stranger-pass",
        `fin_stranger_${run}`,
        ["vehicles.read"],
      );

      readerToken = await login(app, {
        email: `fin-reader-${run}@example.test`,
        password: "fin-reader-pass",
      });
      strangerToken = await login(app, {
        email: `fin-stranger-${run}@example.test`,
        password: "fin-stranger-pass",
      });
    });

    after(async () => {
      await app.close();
    });

    test("finance.read can read summary but cannot create manual expense", async () => {
      const summary = await app.inject({
        method: "GET",
        url: "/finance/summary",
        headers: auth(readerToken),
      });
      assert.equal(summary.statusCode, 200, summary.body);

      const create = await app.inject({
        method: "POST",
        url: "/finance/expenses",
        headers: auth(readerToken),
        payload: {
          amount: 50,
          category: "OTHER",
          recognizedAt: "2026-09-01T10:00:00.000Z",
          description: "Should be denied",
        },
      });
      assert.equal(create.statusCode, 403, create.body);
    });

    test("user without finance.read is rejected from finance endpoints", async () => {
      const summary = await app.inject({
        method: "GET",
        url: "/finance/summary",
        headers: auth(strangerToken),
      });
      assert.equal(summary.statusCode, 403, summary.body);
    });

    test("no DELETE route for manual expenses", async () => {
      const del = await app.inject({
        method: "DELETE",
        url: "/finance/expenses/00000000-0000-0000-0000-000000000001",
        headers: auth(readerToken),
      });
      assert.equal(del.statusCode, 404);
    });
  });
}
