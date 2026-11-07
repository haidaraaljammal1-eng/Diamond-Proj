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
  buildRoadLiabilityReceivedMessage,
} from "src/modules/notification-delivery/business-notification.messages";
import {
  loadActorUsername,
  loadCarInContext,
  resolveRoadLiabilityCollectionChannel,
} from "src/modules/notification-delivery/business-notification.context";
import { createBusinessNotificationService } from "src/modules/notification-delivery/business-notification.service";
import { PUSHOVER_BUSINESS_IDEMPOTENCY_SCOPE, ATTENTION_MONITOR_IDEMPOTENCY_SCOPE } from "src/modules/notification-delivery/business-notification.constants";

test("attention monitor fires independently for each configured Dubai slot", () => {
  const slots = "09:00,14:00,19:00";
  const cases: Array<{ utc: string; expected: string }> = [
    { utc: "2026-09-24T05:00:00.000Z", expected: "09:00" },
    { utc: "2026-09-24T10:00:00.000Z", expected: "14:00" },
    { utc: "2026-09-24T15:00:00.000Z", expected: "19:00" },
  ];
  for (const row of cases) {
    assert.equal(
      resolveDueAttentionSlot(new Date(row.utc), "Asia/Dubai", parseAttentionMonitorTimes(slots)),
      row.expected,
    );
  }
});

test("attention summary is a fixed staff headline when outstanding cases exist", () => {
  const message = buildAttentionSummaryMessage();
  assert.match(message.message, /Outstanding items require attention/);
});

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
      unpaidDeferredViolationsCount: 0,
      unpaidDeferredViolationsTotal: 0,
      unpaidPostCloseViolationsCount: 0,
      unpaidPostCloseViolationsTotal: 0,
      awaitingRenewalsCount: 0,
      awaitingRenewalsTotal: 0,
      outstandingFinancialTotal: 0,
      currency: "AED",
    }),
    false,
  );
});

test("attention summary message shape is stable", () => {
  const message = buildAttentionSummaryMessage({
    unpaidContractsCount: 3,
    unpaidContractsTotal: 8400,
    unpaidDeferredViolationsCount: 2,
    unpaidDeferredViolationsTotal: 1250,
    unpaidPostCloseViolationsCount: 0,
    unpaidPostCloseViolationsTotal: 0,
    awaitingRenewalsCount: 0,
    awaitingRenewalsTotal: 0,
    outstandingFinancialTotal: 9650,
    currency: "AED",
  });
  assert.match(message.message, /Outstanding items require attention/);
});

test("road_liability.received Salik uses Salik title and body; traffic keeps existing copy", () => {
  const salikToll = buildRoadLiabilityReceivedMessage({
    liabilityType: "SALIK_TOLL",
    contractNumber: "DE-2026-000900",
    vehicleName: "Chevrolet Tahoe",
    staffActor: { staffUsername: "Haidara Admin" },
  });
  assert.equal(salikToll.title, "New Salik Recorded");
  assert.match(salikToll.message, /^New Salik recorded\./);
  assert.match(salikToll.message, /Contract: DE-2026-000900/);
  assert.match(salikToll.message, /Vehicle: Chevrolet Tahoe/);
  assert.match(salikToll.message, /By: Haidara Admin/);
  assert.doesNotMatch(salikToll.message, /New road liability recorded/);

  const salikViolation = buildRoadLiabilityReceivedMessage({
    liabilityType: "SALIK_VIOLATION",
    contractNumber: "DE-2026-000901",
    vehicleName: null,
    staffActor: null,
  });
  assert.equal(salikViolation.title, "New Salik Recorded");
  assert.match(salikViolation.message, /^New Salik recorded\./);

  const traffic = buildRoadLiabilityReceivedMessage({
    liabilityType: "RTA_VIOLATION",
    contractNumber: "DE-2026-000902",
    vehicleName: "Rented Sedan 05",
    staffActor: { staffUsername: "Fleet Staff" },
  });
  assert.equal(traffic.title, "Diamond Rent Car");
  assert.match(traffic.message, /^New road liability recorded\./);
  assert.match(traffic.message, /Contract: DE-2026-000902/);
  assert.match(traffic.message, /Vehicle: Rented Sedan 05/);
  assert.match(traffic.message, /By: Fleet Staff/);
  assert.doesNotMatch(traffic.message, /New Salik recorded/);
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
        createdByUserId: 5,
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
    user: {
      findUnique: async ({ where }: { where: { id: number } }) =>
        where.id === 5 ? { email: "collector@example.com", name: "Collector" } : null,
    },
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
  assert.match(sends[0] ?? "", /Payment confirmed successfully/);
  assert.match(sends[0] ?? "", /By: Collector/);
  assert.doesNotMatch(sends[0] ?? "", /By: collector@example\.com/);
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
      vehicleName: "Camry",
      actor: { staffUsername: "Collector" },
    }),
  );
  await service.deliverOnce(
    "payment.confirmed:pay_1",
    buildPaymentReceivedMessage({
      contractNumber: "DR-1",
      vehicleName: "Camry",
      actor: { staffUsername: "Collector" },
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
    await service.handleOutboxEvent("contract.closed", { contractId: "missing" });
  });
});

test("formatLocalDateParts uses configured timezone", () => {
  const parts = formatLocalDateParts(new Date("2026-09-24T05:00:00.000Z"), "Asia/Dubai");
  assert.equal(parts.timeKey, "09:00");
  assert.equal(parts.dateKey, "2026-09-24");
});

test("loadActorUsername prefers User.name over email for By line", async () => {
  const withName = await loadActorUsername(
    {
      user: {
        findUnique: async () => ({ email: "admin@diamond.test", name: "Haidara Admin" }),
      },
    } as never,
    1,
    "",
  );
  assert.equal(withName.staffUsername, "Haidara Admin");

  const nameMissing = await loadActorUsername(
    {
      user: {
        findUnique: async () => ({ email: "admin@diamond.test", name: "   " }),
      },
    } as never,
    1,
    "",
  );
  assert.equal(nameMissing.staffUsername, "admin@diamond.test");

  const unresolved = await loadActorUsername(
    { user: { findUnique: async () => null } } as never,
    99,
    "",
  );
  assert.equal(unresolved.staffUsername, "");
});

test("CAR_IN_COMPLETED message uses employee display name on By line", () => {
  const message = buildCarInMessage({
    contractNumber: "DR-1042",
    vehicleName: "Toyota Camry",
    actor: { staffUsername: "Ahmed Hassan" },
  });

  assert.match(message.message, /Vehicle return submitted for review/);
  assert.match(message.message, /By: Ahmed Hassan/);
});

test("loadCarInContext resolves performer display name and falls back for historical rows", async () => {
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
        where.id === 7 ? { email: "ahmed.hassan@example.com", name: "Ahmed Hassan" } : null,
    },
  } as never;

  const withActor = await loadCarInContext(prisma, "contract-1");
  assert.equal(withActor?.actor.staffUsername, "Ahmed Hassan");

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
  assert.equal(withoutActor?.actor.staffUsername, "");
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
      unpaidDeferredViolationsCount: 1,
      unpaidDeferredViolationsTotal: 250,
      unpaidPostCloseViolationsCount: 0,
      unpaidPostCloseViolationsTotal: 0,
      awaitingRenewalsCount: 0,
      awaitingRenewalsTotal: 0,
      outstandingFinancialTotal: 5250,
      currency: "AED",
    }),
  );

  assert.equal(sent, true);
  assert.equal(sends.length, 1);
  assert.match(sends[0] ?? "", /Outstanding items require attention/);
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
      unpaidDeferredViolationsCount: 0,
      unpaidDeferredViolationsTotal: 0,
      unpaidPostCloseViolationsCount: 0,
      unpaidPostCloseViolationsTotal: 0,
      awaitingRenewalsCount: 0,
      awaitingRenewalsTotal: 0,
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
      unpaidDeferredViolationsCount: 0,
      unpaidDeferredViolationsTotal: 0,
      unpaidPostCloseViolationsCount: 0,
      unpaidPostCloseViolationsTotal: 0,
      awaitingRenewalsCount: 0,
      awaitingRenewalsTotal: 0,
      outstandingFinancialTotal: 1000,
      currency: "AED",
    }),
  );

  assert.equal(sent, false);
  assert.equal(sends.length, 0);
});
