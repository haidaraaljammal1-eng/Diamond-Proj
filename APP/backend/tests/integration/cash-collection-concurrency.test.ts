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
  test("cash collection concurrency skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("cash rental settlement concurrency", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    let adminUserId = 0;

    before(async () => {
      const { buildApp } = await import("src/app");
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      app = await buildApp();
      prisma = app.prisma;
      setPaymentProviderForTests(createFakePaymentProvider(run).provider);
      const email = normalizeEmail(`cash-conc-${run}@example.test`);
      const role = await prisma.role.create({ data: { key: `cash_conc_${run}`, name: "cash conc" } });
      const user = await prisma.user.create({
        data: {
          email,
          name: "cash conc",
          status: "ACTIVE",
          passwordHash: await hashPassword("cash-pass-123"),
        },
      });
      adminUserId = user.id;
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    });

    after(async () => {
      setPaymentProviderForTests(undefined);
      await app.close();
    });

    test("parallel settleCashRental creates one payment and one ledger row", async () => {
      const vehicle = await prisma.vehicle.create({
        data: {
          companyId: await testCompanyId(prisma),
          vehicleName: `CC-${run}`,
          plateNumber: `CC${run}`.slice(0, 12),
          dailyRate: 300,
          color: "White",
          modelYear: 2024,
          operationalStatus: "AVAILABLE",
        },
      });
      const contract = await prisma.contract.create({
        data: {
          companyId: await testCompanyId(prisma),
          contractNumber: `CC-${run}`,
          status: "SIGNED",
          vehicleId: vehicle.id,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 2,
          agreedAmount: 600,
          collectionMode: "CASH",
        },
      });

      const payments = createContractPaymentService(prisma);
      const [first, second] = await Promise.all([
        payments.settleCashRental(contract.id, adminUserId),
        payments.settleCashRental(contract.id, adminUserId),
      ]);
      assert.equal(first.id, second.id);

      const paid = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } });
      assert.equal(paid.status, "PAID");

      const paymentCount = await prisma.contractPayment.count({
        where: { contractId: contract.id, purpose: "RENTAL", status: "CONFIRMED", method: "CASH" },
      });
      assert.equal(paymentCount, 1);

      const ledgerCount = await prisma.financialLedgerEntry.count({
        where: { contractId: contract.id, kind: "RENTAL_PAYMENT" },
      });
      assert.equal(ledgerCount, 1);
    });
  });
}
