import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "src/constants/permissions";
import { PUSHOVER_BUSINESS_IDEMPOTENCY_SCOPE } from "src/modules/notification-delivery/business-notification.constants";
import { setNotificationProviderForTests } from "src/modules/notification-delivery/notification.provider";
import { createRoadLiabilityOutboxConsumer } from "src/modules/road-liabilities/road-liability-outbox-consumer";
import { ROAD_LIABILITY_OUTBOX_EVENT } from "src/modules/road-liabilities/road-liability.constants";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("business notification integration skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.PUSHOVER_ENABLED = "true";
  process.env.PUSHOVER_APP_TOKEN = "test-app-token";
  process.env.PUSHOVER_USER_KEY = "test-user-key";

  describe("business notification delivery", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    let adminUserId = 0;
    let vehicleId = 0;
    let contractId = "";
    const pushSends: string[] = [];

    before(async () => {
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;

      setNotificationProviderForTests({
        name: "pushover-test",
        configured: true,
        send: async (payload) => {
          pushSends.push(payload.message);
          return { success: true, provider: "pushover", requestId: `req-${pushSends.length}` };
        },
      });

      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      const email = normalizeEmail(`bn-${run}@test.local`);
      const role = await prisma.role.upsert({
        where: { key: `bn_role_${run}` },
        update: {},
        create: { key: `bn_role_${run}`, name: `bn_role_${run}` },
      });
      for (const key of [PERMISSIONS.VIOLATIONS_CHARGE, "vehicles.manage"]) {
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
      const passwordHash = await hashPassword("pass-12345");
      const user = await prisma.user.upsert({
        where: { email },
        update: { status: "ACTIVE", passwordHash },
        create: { email, name: "BN Admin", status: "ACTIVE", passwordHash },
      });
      adminUserId = user.id;
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });

      const cid = await testCompanyId(prisma);
      const customer = await prisma.customer.create({
        data: { name: `BN Customer ${run}`, mobile: `+9715${run.slice(-8)}` },
      });
      const vehicle = await prisma.vehicle.create({
        data: {
          companyId: cid,
          vehicleName: `BN ${run}`,
          plateNumber: `BN ${run}`,
          modelYear: 2024,
          color: "White",
          dailyRate: 400,
          operationalStatus: "AVAILABLE",
        },
      });
      vehicleId = vehicle.id;

      const contract = await prisma.contract.create({
        data: {
          companyId: cid,
          contractNumber: `BN-${run}`,
          status: "CLOSED",
          vehicleId,
          customerId: customer.id,
          createdByUserId: adminUserId,
          priceType: "DAILY",
          rentalDays: 1,
          agreedAmount: 500,
          collectionMode: "CASH",
        },
      });
      contractId = contract.id;
    });

    after(async () => {
      setNotificationProviderForTests(undefined);
      await app.close();
    });

    test("road_liability.chargeable fans out to IN_APP and Pushover once", async () => {
      pushSends.length = 0;
      await prisma.domainOutboxEvent.deleteMany({
        where: {
          eventType: ROAD_LIABILITY_OUTBOX_EVENT,
          status: { in: ["PENDING", "PROCESSING"] },
        },
      });
      await prisma.notification.deleteMany({
        where: { userId: adminUserId, eventKey: "road_liability.chargeable" },
      });

      const liability = await prisma.roadLiability.create({
        data: {
          type: "RTA_VIOLATION",
          vehicleId,
          occurredAt: new Date("2026-09-10T12:00:00.000Z"),
          amount: 600,
          currency: "AED",
          authoritativeSourceKey: "RTA",
          authoritativeExternalReference: `BN-RTA-${run}`,
          confirmationStatus: "CONFIRMED",
          attributionStatus: "MATCHED",
          collectionStatus: "OPEN",
          attributedContractId: contractId,
          confirmedAt: new Date(),
        },
      });

      await prisma.domainOutboxEvent.create({
        data: {
          eventType: ROAD_LIABILITY_OUTBOX_EVENT,
          aggregateType: "road_liability",
          aggregateId: liability.id,
          dedupeKey: `${ROAD_LIABILITY_OUTBOX_EVENT}:${liability.id}`,
          payload: {
            liabilityId: liability.id,
            contractId,
            vehicleId,
            type: "RTA_VIOLATION",
            amount: 600,
          },
        },
      });

      const consumer = createRoadLiabilityOutboxConsumer(app);
      const first = await consumer.runRoadLiabilityOutboxCycle();
      assert.equal(first.created, 1);

      const inAppCount = await prisma.notification.count({
        where: { userId: adminUserId, eventKey: "road_liability.chargeable" },
      });
      assert.equal(inAppCount, 1);
      assert.equal(pushSends.length, 1);
      assert.match(pushSends[0] ?? "", /Road Liability Received/);

      const outbox = await prisma.domainOutboxEvent.findFirst({
        where: { dedupeKey: `${ROAD_LIABILITY_OUTBOX_EVENT}:${liability.id}` },
      });
      assert.equal(outbox?.status, "PROCESSED");

      const pushIdem = await prisma.idempotencyKey.findUnique({
        where: {
          scope_key: {
            scope: PUSHOVER_BUSINESS_IDEMPOTENCY_SCOPE,
            key: `road-liability.received:${liability.id}`,
          },
        },
      });
      assert.ok(pushIdem);

      pushSends.length = 0;
      const second = await consumer.runRoadLiabilityOutboxCycle();
      assert.equal(second.created, 0);
      assert.equal(pushSends.length, 0);
      assert.equal(
        await prisma.notification.count({
          where: { userId: adminUserId, eventKey: "road_liability.chargeable" },
        }),
        1,
      );
    });

    test("business notification outbox consumer does not compete for road_liability.chargeable", async () => {
      const { createBusinessNotificationOutboxConsumer } = await import(
        "src/modules/notification-delivery/business-notification-outbox.consumer"
      );
      const { BUSINESS_NOTIFICATION_OUTBOX_TYPES } = await import(
        "src/modules/notification-delivery/business-notification.constants"
      );
      assert.equal(
        (BUSINESS_NOTIFICATION_OUTBOX_TYPES as readonly string[]).includes("road_liability.chargeable"),
        false,
      );

      const liabilityId = `orphan-${run}`;
      await prisma.domainOutboxEvent.create({
        data: {
          eventType: ROAD_LIABILITY_OUTBOX_EVENT,
          aggregateType: "road_liability",
          aggregateId: liabilityId,
          dedupeKey: `${ROAD_LIABILITY_OUTBOX_EVENT}:${liabilityId}:orphan`,
          payload: { liabilityId, contractId, type: "RTA_VIOLATION", amount: 100 },
        },
      });

      pushSends.length = 0;
      const businessConsumer = createBusinessNotificationOutboxConsumer(app);
      const processed = await businessConsumer.consumeOutbox();
      assert.equal(processed, 0);
      assert.equal(pushSends.length, 0);
    });

    test("payment.confirmed ROAD_LIABILITY CASH sends road liability collected once", async () => {
      pushSends.length = 0;
      const charge = await prisma.roadLiabilityCustomerCharge.create({
        data: {
          roadLiabilityId: (
            await prisma.roadLiability.create({
              data: {
                type: "RTA_VIOLATION",
                vehicleId,
                occurredAt: new Date("2026-09-11T12:00:00.000Z"),
                amount: 320,
                currency: "AED",
                authoritativeSourceKey: "RTA",
                authoritativeExternalReference: `BN-CASH-${run}`,
                confirmationStatus: "CONFIRMED",
                attributionStatus: "MATCHED",
                collectionStatus: "SETTLED",
                attributedContractId: contractId,
                confirmedAt: new Date(),
              },
            })
          ).id,
          contractId,
          destinationType: "DIRECT_COLLECTION",
          officialAmountSnapshot: 300,
          adjustmentAmount: 20,
          customerChargeAmount: 320,
          confirmedAt: new Date(),
          operationalState: "PAID",
          settlementChannel: "CASH",
        },
      });

      const payment = await prisma.contractPayment.create({
        data: {
          contractId,
          purpose: "ROAD_LIABILITY",
          targetId: charge.id,
          amount: 320,
          currency: "AED",
          method: "CASH",
          status: "CONFIRMED",
          provider: null,
          confirmedAt: new Date(),
        },
      });

      await prisma.domainOutboxEvent.create({
        data: {
          eventType: "payment.confirmed",
          aggregateType: "contract_payment",
          aggregateId: payment.id,
          dedupeKey: `payment.confirmed:${contractId}:${payment.id}`,
          payload: {
            paymentId: payment.id,
            purpose: "ROAD_LIABILITY",
            contractId,
          },
        },
      });

      const { createBusinessNotificationOutboxConsumer } = await import(
        "src/modules/notification-delivery/business-notification-outbox.consumer"
      );
      const businessConsumer = createBusinessNotificationOutboxConsumer(app);
      assert.equal(await businessConsumer.consumeOutbox(), 1);
      assert.equal(pushSends.length, 1);
      assert.match(pushSends[0] ?? "", /Road Liability Collected/);
      assert.match(pushSends[0] ?? "", /Collection Channel: Cash/);

      pushSends.length = 0;
      assert.equal(await businessConsumer.consumeOutbox(), 0);
      assert.equal(pushSends.length, 0);
    });
  });
}
