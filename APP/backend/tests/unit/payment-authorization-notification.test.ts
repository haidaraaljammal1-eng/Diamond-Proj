import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPaymentAuthorizationIncompleteMessage } from "src/modules/notification-delivery/business-notification.messages";
import { createBusinessNotificationService } from "src/modules/notification-delivery/business-notification.service";

test("authorization incomplete staff message is English and lists key fields", () => {
  const built = buildPaymentAuthorizationIncompleteMessage({
    contractNumber: "C-100",
    vehicleName: "Sedan",
    actor: { staffUsername: "Haidara Staff" },
  });
  assert.match(built.message, /Card authorization incomplete/);
  assert.match(built.message, /C-100/);
  assert.match(built.message, /Vehicle: Sedan/);
  assert.match(built.message, /By: Haidara Staff/);
});

test("payment.authorization_incomplete outbox dedupes staff alerts", async () => {
  const sends: string[] = [];
  const createdKeys: string[] = [];
  const prisma = {
    contractPayment: {
      findUnique: async () => ({
        id: "pay-1",
        amount: 1000,
        currency: "AED",
        purpose: "RENTAL",
        method: "CARD",
        provider: "stripe",
        providerReference: "cs_test_1",
        confirmedAt: new Date(),
        createdByUserId: 9,
        contract: {
          contractNumber: "C-1",
          customer: { name: "Customer" },
          company: { code: "UNIQUE" },
          vehicle: {
            vehicleName: "Car",
            modelYear: 2024,
            plateNumber: "A 1",
            model: { name: "Model" },
          },
        },
      }),
    },
    user: {
      findUnique: async ({ where }: { where: { id: number } }) =>
        where.id === 9 ? { email: "creator@example.com", name: "Creator" } : null,
    },
    idempotencyKey: {
      create: async ({ data }: { data: { scope: string; key: string } }) => {
        const composite = `${data.scope}:${data.key}`;
        if (createdKeys.includes(composite)) {
          const error = new Error("unique") as Error & { code?: string };
          error.code = "P23505";
          throw error;
        }
        createdKeys.push(composite);
        return data;
      },
      findUnique: async () => null,
    },
  } as never;

  const service = createBusinessNotificationService(prisma, async (payload) => {
    sends.push(payload.message);
    return { success: true, provider: "pushover" };
  });

  await service.handleOutboxEvent("payment.authorization_incomplete", {
    paymentId: "pay-1",
    providerReference: "cs_test_1",
  });
  await service.handleOutboxEvent("payment.authorization_incomplete", {
    paymentId: "pay-1",
    providerReference: "cs_test_1",
  });

  assert.equal(sends.length, 1);
  assert.match(sends[0] ?? "", /By: Creator/);
  assert.doesNotMatch(sends[0] ?? "", /By: creator@example\.com/);
});
