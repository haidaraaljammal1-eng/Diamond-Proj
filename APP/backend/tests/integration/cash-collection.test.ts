import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { companyId as testCompanyId } from "tests/helpers/operating-company";
import { createContractPaymentService } from "src/modules/contracts/payment/contract-payment.service";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import { createFakePaymentProvider } from "../helpers/fake-payment-provider";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("cash collection integration skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("cash customer collection", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    let token = "";
    let adminUserId = 0;

    before(async () => {
      const { buildApp } = await import("src/app");
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      app = await buildApp();
      prisma = app.prisma;
      const email = normalizeEmail(`cash-admin-${run}@example.test`);
      const role = await prisma.role.create({ data: { key: `cash_${run}`, name: "cash admin" } });
      for (const key of ["vehicles.manage", "contracts.manage", "finance.read"]) {
        const perm = await prisma.permission.upsert({
          where: { key },
          update: {},
          create: { key, category: key.split(".")[0]!, description: key },
        });
        await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
      }
      const user = await prisma.user.create({
        data: {
          email,
          name: "cash admin",
          status: "ACTIVE",
          passwordHash: await hashPassword("cash-pass-123"),
        },
      });
      adminUserId = user.id;
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      token = (
        await app.inject({
          method: "POST",
          url: "/auth/login",
          payload: { email, password: "cash-pass-123" },
        })
      ).json().data.accessToken;
      setPaymentProviderForTests(createFakePaymentProvider(run).provider);
    });

    after(async () => {
      setPaymentProviderForTests(undefined);
      if (app) await app.close();
    });

    const auth = () => ({ authorization: `Bearer ${token}` });

    let offerSeq = 0;
    async function createCashOffer() {
      offerSeq += 1;
      const vehicle = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(),
        payload: {
          companyId: await testCompanyId(prisma),
          vehicleName: `CASH-${run}-${offerSeq}`,
          plateNumber: `C${run}${offerSeq}`.slice(0, 12),
          dailyRate: 400,
          color: "White",
          modelYear: 2024,
        },
      });
      assert.equal(vehicle.statusCode, 201, vehicle.body);
      const offer = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(),
        payload: {
          vehicleId: vehicle.json().data.id,
          priceType: "DAILY",
          rentalDays: 3,
          agreedAmount: 1200,
          collectionMode: "CASH",
        },
      });
      assert.equal(offer.statusCode, 201, offer.body);
      const contractId = offer.json().data.id as string;
      assert.equal(offer.json().data.collectionMode, "CASH");
      const link = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/rental-link`,
        headers: auth(),
      });
      assert.equal(link.statusCode, 200, link.body);
      return {
        contractId,
        rentalToken: link.json().data.link.token as string,
        companyId: offer.json().data.company.id as number,
      };
    }

    test("persists collection mode and exposes it on public rental context", async () => {
      const { rentalToken } = await createCashOffer();
      const ctx = await app.inject({ method: "GET", url: `/contracts/rental/${rentalToken}` });
      assert.equal(ctx.statusCode, 200, ctx.body);
      assert.equal(ctx.json().data.collection.mode, "CASH");
      assert.notEqual(ctx.json().data.flow.step, "PAYMENT");
    });

    test("cash settlement moves SIGNED to PAID with one CASH payment and ledger row", async () => {
      const { contractId, companyId } = await createCashOffer();
      await prisma.contract.update({
        where: { id: contractId },
        data: { status: "SIGNED" },
      });
      const payments = createContractPaymentService(prisma);
      const payment = await payments.settleCashRental(contractId, adminUserId);
      assert.equal(payment.method, "CASH");
      assert.equal(payment.status, "CONFIRMED");
      assert.equal(payment.amount, 1200);
      assert.equal(payment.provider, null);

      const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
      assert.equal(contract.status, "PAID");

      const count = await prisma.contractPayment.count({
        where: { contractId, purpose: "RENTAL", status: "CONFIRMED", method: "CASH" },
      });
      assert.equal(count, 1);

      const ledger = await prisma.financialLedgerEntry.findMany({
        where: { contractPaymentId: payment.id, kind: "RENTAL_PAYMENT" },
      });
      assert.equal(ledger.length, 1);
      assert.equal(ledger[0]!.companyId, companyId);
      assert.equal(ledger[0]!.amount, 1200);
    });

    test("cash settlement is idempotent on retry", async () => {
      const { contractId } = await createCashOffer();
      await prisma.contract.update({ where: { id: contractId }, data: { status: "SIGNED" } });
      const payments = createContractPaymentService(prisma);
      const first = await payments.settleCashRental(contractId, adminUserId);
      const second = await payments.settleCashRental(contractId, adminUserId);
      assert.equal(first.id, second.id);
      const count = await prisma.contractPayment.count({
        where: { contractId, purpose: "RENTAL", status: "CONFIRMED" },
      });
      assert.equal(count, 1);
    });

    test("electronic contract rejects card payment start when still cash mode", async () => {
      const { contractId, rentalToken } = await createCashOffer();
      await prisma.contract.update({ where: { id: contractId }, data: { status: "SIGNED" } });
      const res = await app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/payment`,
        headers: { ...auth(), "idempotency-key": `cash-block-${run}` },
        payload: {},
      });
      assert.equal(res.statusCode, 409);
    });
  });
}
