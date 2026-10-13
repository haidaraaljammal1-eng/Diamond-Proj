import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPaymentAuthorizationIncompleteMessage } from "src/modules/notification-delivery/business-notification.messages";
import { createBusinessNotificationService } from "src/modules/notification-delivery/business-notification.service";

test("authorization incomplete staff message is Arabic and actionable", () => {
  const built = buildPaymentAuthorizationIncompleteMessage({
    contractNumber: "C-100",
    customerName: "Test Customer",
    vehicleName: "Sedan",
    operatingCompanyCode: "ELITE",
    amount: 1000,
    currency: "AED",
    paymentStatus: "CONFIRMED",
    authorizationStatus: "INCOMPLETE",
    stripeReference: "cs_test_abc",
    errorCode: "CARD_AUTHORIZATION_INCOMPLETE",
    occurredAt: new Date("2026-01-15T10:00:00.000Z"),
  });
  assert.match(built.title, /حفظ البطاقة/);
  assert.match(built.message, /تم استلام قيمة الإيجار بنجاح/);
  assert.match(built.message, /يمكن متابعة إجراءات تسليم المركبة/);
  assert.match(built.message, /C-100/);
  assert.match(built.message, /cs_test_abc/);
  assert.match(built.message, /ELITE/);
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
});
