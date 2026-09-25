import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAttentionMonitorRunKey,
  formatLocalDateParts,
  parseAttentionMonitorTimes,
  resolveDueAttentionSlot,
  runAttentionMonitorCycle,
} from "src/modules/notification-delivery/attention-monitor.service";
import {
  attentionMonitorHasOutstandingCases,
} from "src/modules/notification-delivery/attention-monitor.queries";
import {
  buildAttentionSummaryMessage,
  buildCarInMessage,
  buildPaymentReceivedMessage,
} from "src/modules/notification-delivery/business-notification.messages";
import {
  loadCarInContext,
  resolveRoadLiabilityCollectionChannel,
  UNKNOWN_STAFF_ACTOR_LABEL,
} from "src/modules/notification-delivery/business-notification.context";
import { createBusinessNotificationService } from "src/modules/notification-delivery/business-notification.service";
import { PUSHOVER_BUSINESS_IDEMPOTENCY_SCOPE, ATTENTION_MONITOR_IDEMPOTENCY_SCOPE } from "src/modules/notification-delivery/business-notification.constants";

test("attention monitor slot parsing and due-slot resolution", () => {
  assert.deepEqual(parseAttentionMonitorTimes("09:00,14:00,19:00"), ["09:00", "14:00", "19:00"]);
  const now = new Date("2026-09-24T05:00:00.000Z"); // 09:00 in Asia/Dubai (UTC+4)
  assert.equal(resolveDueAttentionSlot(now, "Asia/Dubai", ["09:00", "14:00"]), "09:00");
  assert.equal(resolveDueAttentionSlot(now, "Asia/Dubai", ["14:00"]), null);
});

test("attention monitor run key deduplicates by date slot and timezone", () => {
  assert.equal(
    buildAttentionMonitorRunKey("2026-09-24", "09:00", "Asia/Dubai"),
    "2026-09-24:09:00:Asia/Dubai",
  );
});

test("attention summary sends nothing content-wise when all counts are zero", () => {
  assert.equal(
    attentionMonitorHasOutstandingCases({
      unpaidContractsCount: 0,
      unpaidContractsTotal: 0,
      unpaidRoadLiabilitiesCount: 0,
      unpaidRoadLiabilitiesTotal: 0,
      overdueRentalsCount: 0,
      outstandingFinancialTotal: 0,
      currency: "AED",
    }),
    false,
  );
});

test("attention summary message consolidates outstanding categories", () => {
  const message = buildAttentionSummaryMessage({
    unpaidContractsCount: 3,
    unpaidContractsTotal: 8400,
    unpaidRoadLiabilitiesCount: 2,
    unpaidRoadLiabilitiesTotal: 1250,
    overdueRentalsCount: 1,
    outstandingFinancialTotal: 9650,
    currency: "AED",
  });

  assert.match(message.message, /Unpaid contracts:/);
  assert.match(message.message, /3 — AED 8,400/);
  assert.match(message.message, /Unpaid traffic liabilities:/);
  assert.match(message.message, /Overdue rentals:/);
  assert.match(message.message, /Outstanding financial total:/);
  assert.match(message.message, /AED 9,650/);
});

test("resolveRoadLiabilityCollectionChannel distinguishes cash, off-session, and checkout", async () => {
  const prisma = {
    contractPaymentOffSessionAttempt: {
      findFirst: async ({ where }: { where: { contractPaymentId: string } }) =>
        where.contractPaymentId === "pay-offsession" ? { id: "attempt-1" } : null,
    },
  } as never;

  assert.equal(
    await resolveRoadLiabilityCollectionChannel(prisma, {
      id: "pay-cash",
      method: "CASH",
      provider: null,
    }),
    "Cash",
  );
  assert.equal(
    await resolveRoadLiabilityCollectionChannel(prisma, {
      id: "pay-offsession",
      method: "CARD",
      provider: "stripe",
    }),
    "Stripe off-session",
  );
  assert.equal(
    await resolveRoadLiabilityCollectionChannel(prisma, {
      id: "pay-checkout",
      method: "CARD",
      provider: "stripe",
    }),
    "Stripe Checkout",
  );
});

test("payment.confirmed ROAD_LIABILITY sends road liability collected message once", async () => {
  const sends: string[] = [];
  const createdKeys: string[] = [];
  const prisma = {
    idempotencyKey: {
      create: async ({ data }: { data: { scope: string; key: string } }) => {
        const full = `${data.scope}:${data.key}`;
        if (createdKeys.includes(full)) {
          const error = new Error("unique") as Error & { code?: string };
          error.code = "P23505";
          throw error;
        }
        createdKeys.push(full);
        return data;
      },
      findUnique: async () => null,
    },
    contractPayment: {
      findUnique: async () => ({
        id: "pay-rl-1",
        purpose: "ROAD_LIABILITY",
        targetId: "charge-1",
        amount: 480,
        currency: "AED",
        method: "CASH",
        provider: null,
        confirmedAt: new Date("2026-09-24T09:00:00.000Z"),
        contract: {
          contractNumber: "DR-RL-1",
          customer: { name: "Ahmad" },
          vehicle: { vehicleName: "Camry", model: null, plateNumber: "A 1" },
        },
      }),
    },
    roadLiabilityCustomerCharge: {
      findUnique: async () => ({
        roadLiabilityId: "rl-1",
        officialAmountSnapshot: 400,
        adjustmentAmount: 80,
        customerChargeAmount: 480,
        roadLiability: { authoritativeExternalReference: "RTA-123" },
      }),
    },
    contractPaymentOffSessionAttempt: { findFirst: async () => null },
    contractReconciliationLine: { findFirst: async () => null },
    contractPostCloseReceivable: { findUnique: async () => null },
  } as never;

  const service = createBusinessNotificationService(prisma, async (payload) => {
    sends.push(payload.message);
    return { success: true, provider: "pushover" };
  });

  await service.handleOutboxEvent("payment.confirmed", {
    paymentId: "pay-rl-1",
    purpose: "ROAD_LIABILITY",
  });
  await service.handleOutboxEvent("payment.confirmed", {
    paymentId: "pay-rl-1",
    purpose: "ROAD_LIABILITY",
  });

  assert.equal(sends.length, 1);
  assert.match(sends[0] ?? "", /Road Liability Collected/);
  assert.match(sends[0] ?? "", /Collection Channel: Cash/);
});

test("business notification deliverOnce dedupes repeated immediate events", async () => {
  const createdKeys: string[] = [];
  const sends: string[] = [];
  const prisma = {
    idempotencyKey: {
      create: async ({ data }: { data: { scope: string; key: string } }) => {
        if (createdKeys.includes(`${data.scope}:${data.key}`)) {
          const error = new Error("unique") as Error & { code?: string };
          error.code = "P23505";
          throw error;
        }
        createdKeys.push(`${data.scope}:${data.key}`);
        return data;
      },
      findUnique: async () => null,
    },
  } as never;

  const service = createBusinessNotificationService(prisma, async (payload) => {
    sends.push(payload.message);
    return { success: true, provider: "pushover" };
  });

  await service.deliverOnce(
    "payment.confirmed:pay_1",
    buildPaymentReceivedMessage({
      contractNumber: "DR-1",
      customerName: "Ahmad",
      vehicleName: "Camry",
      amount: 1000,
      currency: "AED",
      paymentSource: "Stripe",
      occurredAt: new Date("2026-09-24T09:00:00.000Z"),
    }),
  );
  await service.deliverOnce(
    "payment.confirmed:pay_1",
    buildPaymentReceivedMessage({
      contractNumber: "DR-1",
      customerName: "Ahmad",
      vehicleName: "Camry",
      amount: 1000,
      currency: "AED",
      paymentSource: "Stripe",
      occurredAt: new Date("2026-09-24T09:00:00.000Z"),
    }),
  );

  assert.equal(sends.length, 1);
  assert.equal(createdKeys[0], `${PUSHOVER_BUSINESS_IDEMPOTENCY_SCOPE}:payment.confirmed:pay_1`);
});

test("business notification handler does not throw when downstream send fails", async () => {
  const prisma = {
    contract: { findUnique: async () => null },
  } as never;
  const service = createBusinessNotificationService(prisma, async () => ({
    success: false,
    provider: "pushover",
    errorCode: "NETWORK_ERROR",
  }));

  await assert.doesNotReject(async () => {
    await service.handleOutboxEvent("contract.signed", { contractId: "missing" });
  });
});

test("formatLocalDateParts uses configured timezone", () => {
  const parts = formatLocalDateParts(new Date("2026-09-24T05:00:00.000Z"), "Asia/Dubai");
  assert.equal(parts.timeKey, "09:00");
  assert.equal(parts.dateKey, "2026-09-24");
});

test("CAR_IN_COMPLETED message uses persisted employee name", () => {
  const message = buildCarInMessage({
    contractNumber: "DR-1042",
    vehicleName: "Toyota Camry",
    customerName: "Ahmad Ali",
    mileageIn: 42580,
    fuelIn: "75%",
    damageSummary: "None reported",
    actor: { label: "Ahmed Hassan" },
    occurredAt: new Date("2026-09-24T09:00:00.000Z"),
  });

  assert.match(message.message, /🚗 Vehicle Returned/);
  assert.match(message.message, /By: Ahmed Hassan/);
  assert.doesNotMatch(message.message, /By: Staff/);
});

test("loadCarInContext resolves persisted performer and falls back for historical rows", async () => {
  const prisma = {
    contract: {
      findUnique: async () => ({
        contractNumber: "DR-1042",
        customer: { name: "Ahmad Ali" },
        vehicle: { vehicleName: "Toyota Camry", model: null, plateNumber: "A 1" },
        carIn: {
          mileageIn: 42580,
          fuelIn: "75%",
          occurredAt: new Date("2026-09-24T09:00:00.000Z"),
          performedByUserId: 7,
        },
        officialReviewDraft: { damageIn: [] },
      }),
    },
    user: {
      findUnique: async ({ where }: { where: { id: number } }) =>
        where.id === 7 ? { name: "Ahmed Hassan" } : null,
    },
  } as never;

  const withActor = await loadCarInContext(prisma, "contract-1");
  assert.equal(withActor?.actor.label, "Ahmed Hassan");

  const historicalPrisma = {
    contract: {
      findUnique: async () => ({
        contractNumber: "DR-99",
        customer: { name: "Legacy Customer" },
        vehicle: { vehicleName: "Legacy Car", model: null, plateNumber: "B 2" },
        carIn: {
          mileageIn: 1000,
          fuelIn: "50%",
          occurredAt: new Date("2026-01-01T09:00:00.000Z"),
          performedByUserId: null,
        },
        officialReviewDraft: null,
      }),
    },
    user: { findUnique: async () => null },
  } as never;

  const withoutActor = await loadCarInContext(historicalPrisma, "contract-2");
  assert.equal(withoutActor?.actor.label, UNKNOWN_STAFF_ACTOR_LABEL);
});

test("attention monitor sends one consolidated summary when outstanding cases exist", async () => {
  const keys = new Map<string, true>();
  const sends: string[] = [];
  const prisma = {
    idempotencyKey: {
      findUnique: async () => null,
      create: async ({ data }: { data: { scope: string; key: string } }) => {
        keys.set(`${data.scope}:${data.key}`, true);
        return data;
      },
    },
  } as never;

  const now = new Date("2026-09-24T05:00:00.000Z");
  const sent = await runAttentionMonitorCycle(
    prisma,
    {
      enabled: true,
      timeZone: "Asia/Dubai",
      monitorTimes: "09:00,14:00,19:00",
      now,
    },
    async (payload) => {
      sends.push(payload.message);
      return { success: true, provider: "pushover" };
    },
    async () => ({
      unpaidContractsCount: 2,
      unpaidContractsTotal: 5000,
      unpaidRoadLiabilitiesCount: 1,
      unpaidRoadLiabilitiesTotal: 250,
      overdueRentalsCount: 1,
      outstandingFinancialTotal: 5250,
      currency: "AED",
    }),
  );

  assert.equal(sent, true);
  assert.equal(sends.length, 1);
  assert.match(sends[0] ?? "", /Diamond Attention Required/);
  assert.match(sends[0] ?? "", /Unpaid contracts:/);
});

test("attention monitor sends nothing when no outstanding cases exist", async () => {
  const sends: string[] = [];
  const prisma = {
    idempotencyKey: {
      findUnique: async () => null,
      create: async () => {
        throw new Error("should not persist idempotency when nothing to send");
      },
    },
  } as never;

  const sent = await runAttentionMonitorCycle(
    prisma,
    {
      enabled: true,
      timeZone: "Asia/Dubai",
      monitorTimes: "09:00",
      now: new Date("2026-09-24T05:00:00.000Z"),
    },
    async (payload) => {
      sends.push(payload.message);
      return { success: true, provider: "pushover" };
    },
    async () => ({
      unpaidContractsCount: 0,
      unpaidContractsTotal: 0,
      unpaidRoadLiabilitiesCount: 0,
      unpaidRoadLiabilitiesTotal: 0,
      overdueRentalsCount: 0,
      outstandingFinancialTotal: 0,
      currency: "AED",
    }),
  );

  assert.equal(sent, false);
  assert.equal(sends.length, 0);
});

test("attention monitor suppresses duplicate sends for the same slot", async () => {
  const sends: string[] = [];
  const runKey = buildAttentionMonitorRunKey("2026-09-24", "09:00", "Asia/Dubai");
  const prisma = {
    idempotencyKey: {
      findUnique: async ({ where }: { where: { scope_key: { key: string } } }) =>
        where.scope_key.key === runKey ? { scope: ATTENTION_MONITOR_IDEMPOTENCY_SCOPE, key: runKey } : null,
      create: async () => {
        throw new Error("should not create duplicate slot key");
      },
    },
  } as never;

  const sent = await runAttentionMonitorCycle(
    prisma,
    {
      enabled: true,
      timeZone: "Asia/Dubai",
      monitorTimes: "09:00",
      now: new Date("2026-09-24T05:00:00.000Z"),
    },
    async (payload) => {
      sends.push(payload.message);
      return { success: true, provider: "pushover" };
    },
    async () => ({
      unpaidContractsCount: 1,
      unpaidContractsTotal: 1000,
      unpaidRoadLiabilitiesCount: 0,
      unpaidRoadLiabilitiesTotal: 0,
      overdueRentalsCount: 0,
      outstandingFinancialTotal: 1000,
      currency: "AED",
    }),
  );

  assert.equal(sent, false);
  assert.equal(sends.length, 0);
});
