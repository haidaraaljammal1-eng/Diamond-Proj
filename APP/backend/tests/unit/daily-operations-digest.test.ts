import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import {
  buildAttentionMonitorRunKey,
  formatLocalDateParts,
  parseAttentionMonitorTimes,
} from "src/modules/notification-delivery/attention-monitor.service";
import { buildDailyOperationsDigestMessage } from "src/modules/notification-delivery/business-notification.messages";
import { DAILY_OPERATIONS_DIGEST_IDEMPOTENCY_SCOPE } from "src/modules/notification-delivery/business-notification.constants";
import {
  claimDailyOperationsDigestSlot,
  runDailyOperationsDigestCycle,
} from "src/modules/notification-delivery/daily-operations-digest.service";
import {
  DIGEST_FAILED_PREFIX,
  DIGEST_INFLIGHT_PREFIX,
  DIGEST_SENT_REF,
  DIGEST_SKIPPED_EMPTY_REF,
  digestFailedRef,
  digestInflightRef,
  isDigestInflightStale,
  listReachedDigestSlots,
} from "src/modules/notification-delivery/daily-operations-digest.delivery-state";
import {
  isSalikLiabilityForDigest,
  loadDailyOperationsDigestSnapshot,
} from "src/modules/notification-delivery/daily-operations-digest.queries";
import type { OpenReceivableRow } from "src/modules/finance/finance.mapper";
import {
  dailyOperationsDigestHasOutstanding,
  dailyOperationsDigestTotal,
  type DailyOperationsDigestSnapshot,
} from "src/modules/notification-delivery/daily-operations-digest.types";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function emptySnapshot(
  overrides: Partial<DailyOperationsDigestSnapshot> = {},
): DailyOperationsDigestSnapshot {
  return {
    unpaidRentalsCount: 0,
    unpaidRenewalsCount: 0,
    trafficViolationsCount: 0,
    salikCount: 0,
    reconciliationCount: 0,
    postCloseReceivablesCount: 0,
    overdueVehicleReturnsCount: 0,
    scheduledMaintenanceNotStartedCount: 0,
    maintenanceCompletionDelayedCount: 0,
    ...overrides,
  };
}

function createMemoryIdempotencyPrisma() {
  const rows = new Map<string, { scope: string; key: string; resultRef: string | null }>();
  const storageKey = (scope: string, key: string) => `${scope}::${key}`;

  const prisma = {
    idempotencyKey: {
      findUnique: async ({
        where,
      }: {
        where: { scope_key: { scope: string; key: string } };
      }) => {
        const row = rows.get(storageKey(where.scope_key.scope, where.scope_key.key));
        return row ? { ...row } : null;
      },
      create: async ({
        data,
      }: {
        data: { scope: string; key: string; resultRef?: string | null };
      }) => {
        const sk = storageKey(data.scope, data.key);
        if (rows.has(sk)) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "test",
          });
        }
        const row = {
          scope: data.scope,
          key: data.key,
          resultRef: data.resultRef ?? null,
        };
        rows.set(sk, row);
        return { ...row };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          scope: string;
          key: string;
          resultRef?: string | { startsWith?: string };
        };
        data: { resultRef: string };
      }) => {
        const sk = storageKey(where.scope, where.key);
        const row = rows.get(sk);
        if (!row) return { count: 0 };
        if (typeof where.resultRef === "string") {
          if (row.resultRef !== where.resultRef) return { count: 0 };
        } else if (where.resultRef?.startsWith) {
          if (!row.resultRef?.startsWith(where.resultRef.startsWith)) return { count: 0 };
        }
        row.resultRef = data.resultRef;
        return { count: 1 };
      },
    },
    _rows: rows,
  };

  return prisma;
}

test("daily digest reached slots include all appointments at or before local time", () => {
  const slots = parseAttentionMonitorTimes("09:00,14:00,19:00");
  assert.deepEqual(listReachedDigestSlots("08:59", slots), []);
  assert.deepEqual(listReachedDigestSlots("09:00", slots), ["09:00"]);
  assert.deepEqual(listReachedDigestSlots("09:45", slots), ["09:00"]);
  assert.deepEqual(listReachedDigestSlots("14:00", slots), ["09:00", "14:00"]);
  assert.deepEqual(listReachedDigestSlots("19:30", slots), ["09:00", "14:00", "19:00"]);
});

test("digest message lists all nine categories and total without PII", () => {
  const snapshot = emptySnapshot({
    unpaidRentalsCount: 1,
    unpaidRenewalsCount: 2,
    trafficViolationsCount: 3,
    salikCount: 4,
    reconciliationCount: 5,
    postCloseReceivablesCount: 6,
    overdueVehicleReturnsCount: 7,
    scheduledMaintenanceNotStartedCount: 8,
    maintenanceCompletionDelayedCount: 9,
  });
  const message = buildDailyOperationsDigestMessage(snapshot);
  assert.equal(message.title, "Diamond Rent Car");
  assert.match(message.message, /Daily Operations & Receivables/);
  assert.match(message.message, /Total Outstanding Items: 45/);
  assert.doesNotMatch(message.message, /Contract:/);
  assert.equal(dailyOperationsDigestTotal(snapshot), 45);
});

test("empty digest marks skipped-empty without sending", async () => {
  const prisma = createMemoryIdempotencyPrisma();
  const sends: unknown[] = [];
  const now = new Date("2026-09-24T05:00:00.000Z"); // 09:00 Dubai

  const sent = await runDailyOperationsDigestCycle(
    prisma as never,
    {
      enabled: true,
      timeZone: "Asia/Dubai",
      monitorTimes: "09:00,14:00,19:00",
      now,
    },
    async (payload) => {
      sends.push(payload);
      return { success: true, provider: "mock" };
    },
    async () => emptySnapshot(),
  );

  assert.equal(sent, false);
  assert.equal(sends.length, 0);
  const { dateKey } = formatLocalDateParts(now, "Asia/Dubai");
  const runKey = buildAttentionMonitorRunKey(dateKey, "09:00", "Asia/Dubai");
  const row = await prisma.idempotencyKey.findUnique({
    where: { scope_key: { scope: DAILY_OPERATIONS_DIGEST_IDEMPOTENCY_SCOPE, key: runKey } },
  });
  assert.equal(row?.resultRef, DIGEST_SKIPPED_EMPTY_REF);
});

test("successful send marks sent and blocks duplicate for the same slot", async () => {
  const prisma = createMemoryIdempotencyPrisma();
  const sends: unknown[] = [];
  const snapshot = emptySnapshot({ unpaidRentalsCount: 1 });
  const options = {
    enabled: true,
    timeZone: "Asia/Dubai",
    monitorTimes: "09:00,14:00,19:00",
    now: new Date("2026-09-24T05:00:00.000Z"),
  };

  const first = await runDailyOperationsDigestCycle(
    prisma as never,
    options,
    async (payload) => {
      sends.push(payload);
      return { success: true, provider: "mock" };
    },
    async () => snapshot,
  );
  const second = await runDailyOperationsDigestCycle(
    prisma as never,
    options,
    async (payload) => {
      sends.push(payload);
      return { success: true, provider: "mock" };
    },
    async () => snapshot,
  );

  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(sends.length, 1);
  const { dateKey } = formatLocalDateParts(options.now, "Asia/Dubai");
  const runKey = buildAttentionMonitorRunKey(dateKey, "09:00", "Asia/Dubai");
  const row = await prisma.idempotencyKey.findUnique({
    where: { scope_key: { scope: DAILY_OPERATIONS_DIGEST_IDEMPOTENCY_SCOPE, key: runKey } },
  });
  assert.equal(row?.resultRef, DIGEST_SENT_REF);
});

test("failed send stores failed ref and retries after the scheduled minute ends", async () => {
  const prisma = createMemoryIdempotencyPrisma();
  const sends: unknown[] = [];
  const snapshot = emptySnapshot({ overdueVehicleReturnsCount: 2 });

  const atSlotMinute = new Date("2026-09-24T05:00:00.000Z"); // 09:00 Dubai
  const afterMinute = new Date("2026-09-24T05:17:00.000Z"); // 09:17 Dubai — same slot key

  const failed = await runDailyOperationsDigestCycle(
    prisma as never,
    {
      enabled: true,
      timeZone: "Asia/Dubai",
      monitorTimes: "09:00,14:00,19:00",
      now: atSlotMinute,
    },
    async () => {
      sends.push("fail");
      return { success: false, provider: "mock", errorCode: "PROVIDER_REJECTED" };
    },
    async () => snapshot,
  );

  const { dateKey } = formatLocalDateParts(atSlotMinute, "Asia/Dubai");
  const runKey = buildAttentionMonitorRunKey(dateKey, "09:00", "Asia/Dubai");
  const afterFail = await prisma.idempotencyKey.findUnique({
    where: { scope_key: { scope: DAILY_OPERATIONS_DIGEST_IDEMPOTENCY_SCOPE, key: runKey } },
  });
  assert.equal(failed, false);
  assert.ok(afterFail?.resultRef?.startsWith(DIGEST_FAILED_PREFIX));

  const recovered = await runDailyOperationsDigestCycle(
    prisma as never,
    {
      enabled: true,
      timeZone: "Asia/Dubai",
      monitorTimes: "09:00,14:00,19:00",
      now: afterMinute,
    },
    async (payload) => {
      sends.push(payload);
      return { success: true, provider: "mock" };
    },
    async () => snapshot,
  );

  assert.equal(recovered, true);
  assert.equal(sends.length, 2);
  const finalRow = await prisma.idempotencyKey.findUnique({
    where: { scope_key: { scope: DAILY_OPERATIONS_DIGEST_IDEMPOTENCY_SCOPE, key: runKey } },
  });
  assert.equal(finalRow?.resultRef, DIGEST_SENT_REF);
});

test("concurrent claims allow only one winner to send", async () => {
  const prisma = createMemoryIdempotencyPrisma();
  const { dateKey } = formatLocalDateParts(new Date("2026-09-24T05:00:00.000Z"), "Asia/Dubai");
  const runKey = buildAttentionMonitorRunKey(dateKey, "09:00", "Asia/Dubai");
  const nowMs = Date.parse("2026-09-24T05:00:00.000Z");

  const [a, b] = await Promise.all([
    claimDailyOperationsDigestSlot(prisma as never, runKey, nowMs),
    claimDailyOperationsDigestSlot(prisma as never, runKey, nowMs + 1),
  ]);

  const winners = [a, b].filter((row) => row.claimed);
  assert.equal(winners.length, 1);
  assert.equal([a, b].filter((row) => !row.claimed).length, 1);

  const snapshot = emptySnapshot({ unpaidRentalsCount: 1 });
  const sends: unknown[] = [];
  const options = {
    enabled: true,
    timeZone: "Asia/Dubai",
    monitorTimes: "09:00,14:00,19:00",
    now: new Date("2026-09-24T05:00:00.000Z"),
  };

  // Pre-claim as sent terminal to prove cycle respects terminal state after a win.
  await prisma.idempotencyKey.updateMany({
    where: { scope: DAILY_OPERATIONS_DIGEST_IDEMPOTENCY_SCOPE, key: runKey, resultRef: winners[0]!.inflightRef! },
    data: { resultRef: DIGEST_SENT_REF },
  });

  const again = await runDailyOperationsDigestCycle(
    prisma as never,
    options,
    async (payload) => {
      sends.push(payload);
      return { success: true, provider: "mock" };
    },
    async () => snapshot,
  );
  assert.equal(again, false);
  assert.equal(sends.length, 0);
});

test("stale inflight claim is recoverable by another worker", async () => {
  const prisma = createMemoryIdempotencyPrisma();
  const now = new Date("2026-09-24T05:30:00.000Z"); // 09:30 Dubai
  const { dateKey } = formatLocalDateParts(now, "Asia/Dubai");
  const runKey = buildAttentionMonitorRunKey(dateKey, "09:00", "Asia/Dubai");
  const staleMs = 60_000;
  const staleInflight = digestInflightRef(now.getTime() - staleMs - 1);

  await prisma.idempotencyKey.create({
    data: {
      scope: DAILY_OPERATIONS_DIGEST_IDEMPOTENCY_SCOPE,
      key: runKey,
      resultRef: staleInflight,
    },
  });

  assert.equal(isDigestInflightStale(staleInflight, now.getTime(), staleMs), true);

  const sends: unknown[] = [];
  const sent = await runDailyOperationsDigestCycle(
    prisma as never,
    {
      enabled: true,
      timeZone: "Asia/Dubai",
      monitorTimes: "09:00,14:00,19:00",
      now,
      inflightStaleMs: staleMs,
    },
    async (payload) => {
      sends.push(payload);
      return { success: true, provider: "mock" };
    },
    async () => emptySnapshot({ salikCount: 1 }),
  );

  assert.equal(sent, true);
  assert.equal(sends.length, 1);
  const row = await prisma.idempotencyKey.findUnique({
    where: { scope_key: { scope: DAILY_OPERATIONS_DIGEST_IDEMPOTENCY_SCOPE, key: runKey } },
  });
  assert.equal(row?.resultRef, DIGEST_SENT_REF);
});

test("fresh inflight is not stolen by a concurrent worker", async () => {
  const prisma = createMemoryIdempotencyPrisma();
  const nowMs = Date.parse("2026-09-24T05:00:10.000Z");
  const { dateKey } = formatLocalDateParts(new Date(nowMs), "Asia/Dubai");
  const runKey = buildAttentionMonitorRunKey(dateKey, "09:00", "Asia/Dubai");
  const fresh = digestInflightRef(nowMs - 5_000);

  await prisma.idempotencyKey.create({
    data: {
      scope: DAILY_OPERATIONS_DIGEST_IDEMPOTENCY_SCOPE,
      key: runKey,
      resultRef: fresh,
    },
  });

  const claim = await claimDailyOperationsDigestSlot(prisma as never, runKey, nowMs, 60_000);
  assert.equal(claim.claimed, false);
});

test("failed ref string helper uses durable prefix", () => {
  const ref = digestFailedRef(1_700_000_000_000);
  assert.ok(ref.startsWith(DIGEST_FAILED_PREFIX));
  assert.ok(digestInflightRef(1).startsWith(DIGEST_INFLIGHT_PREFIX));
});

test("digest total equals sum of nine independent category counts", () => {
  const snapshot = emptySnapshot({
    unpaidRentalsCount: 1,
    unpaidRenewalsCount: 1,
    trafficViolationsCount: 1,
    salikCount: 1,
    reconciliationCount: 1,
    postCloseReceivablesCount: 1,
    overdueVehicleReturnsCount: 1,
    scheduledMaintenanceNotStartedCount: 1,
    maintenanceCompletionDelayedCount: 1,
  });
  assert.equal(dailyOperationsDigestTotal(snapshot), 9);
  assert.equal(dailyOperationsDigestHasOutstanding(snapshot), true);
});

test("road liability Salik vs traffic classification for digest counts", () => {
  assert.equal(
    isSalikLiabilityForDigest({ type: "SALIK_TOLL", staffChargeCategory: null }),
    true,
  );
  assert.equal(
    isSalikLiabilityForDigest({ type: "RTA_VIOLATION", staffChargeCategory: null }),
    false,
  );
});

test("background runner wires only the unified digest for scheduled Pushover", () => {
  const runnerPath = resolve("src/worker/background-runner.ts");
  const source = readFileSync(runnerPath, "utf8");
  assert.match(source, /createDailyOperationsDigestService/);
  assert.doesNotMatch(source, /runOverdueRentalReminderCycle/);
});

function stubReceivable(
  sourceType: OpenReceivableRow["sourceType"],
  sourceId: string,
): OpenReceivableRow {
  return {
    sourceType,
    sourceId,
    contractId: "c1",
    contractNumber: "CTR-1",
    customer: null,
    vehicle: null,
    company: null,
    amountDue: 100,
    amountPaid: 0,
    outstandingAmount: 100,
    currency: "AED",
    obligationCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
    paymentState: "UNPAID",
    paymentPurpose: sourceType,
    latestPaymentId: null,
  };
}

test("snapshot maps all six financial sources plus overdue and maintenance counts", async () => {
  const prisma = {
    roadLiability: {
      findMany: async () => [
        { id: "rl-traffic", type: "RTA_VIOLATION", staffChargeCategory: "TRAFFIC_VIOLATION" },
        { id: "rl-salik", type: "SALIK_TOLL", staffChargeCategory: "SALIK" },
      ],
    },
    contract: { count: async () => 4 },
    maintenanceOrder: {
      count: async ({ where }: { where: { status?: string } }) =>
        where.status === "SCHEDULED" ? 5 : 6,
    },
  } as never;

  const snapshot = await loadDailyOperationsDigestSnapshot(
    prisma,
    new Date("2026-09-24T12:00:00.000Z"),
    {
      listOpenReceivables: async () => ({
        data: [
          stubReceivable("RENTAL", "r1"),
          stubReceivable("RENEWAL", "rn-await"),
          stubReceivable("RENEWAL", "rn-office"),
          stubReceivable("ROAD_LIABILITY", "rl-traffic"),
          stubReceivable("ROAD_LIABILITY", "rl-salik"),
          stubReceivable("RECONCILIATION", "rec1"),
          stubReceivable("POST_CLOSE_RECEIVABLE", "pcr1"),
        ],
      }),
    },
  );

  assert.equal(snapshot.unpaidRentalsCount, 1);
  assert.equal(snapshot.unpaidRenewalsCount, 2);
  assert.equal(snapshot.trafficViolationsCount, 1);
  assert.equal(snapshot.salikCount, 1);
  assert.equal(dailyOperationsDigestTotal(snapshot), 22);
});

test("snapshot counts more than 10_000 open receivable rows without silent truncation", async () => {
  const rows: OpenReceivableRow[] = [];
  for (let i = 0; i < 10_050; i += 1) {
    rows.push(stubReceivable("RENTAL", `r-${i}`));
  }
  const prisma = {
    roadLiability: { findMany: async () => [] },
    contract: { count: async () => 0 },
    maintenanceOrder: { count: async () => 0 },
  } as never;

  const snapshot = await loadDailyOperationsDigestSnapshot(prisma, new Date(), {
    listOpenReceivables: async () => ({ data: rows }),
  });

  assert.equal(snapshot.unpaidRentalsCount, 10_050);
  assert.equal(dailyOperationsDigestTotal(snapshot), 10_050);
});

test("finance service exposes unpaginated listAllOpenReceivableRows", () => {
  const financePath = resolve("src/modules/finance/finance-receivables.service.ts");
  const source = readFileSync(financePath, "utf8");
  assert.match(source, /listAllOpenReceivableRows/);
  const queryPath = resolve("src/modules/notification-delivery/daily-operations-digest.queries.ts");
  const querySource = readFileSync(queryPath, "utf8");
  assert.match(querySource, /listAllOpenReceivableRows/);
  assert.doesNotMatch(querySource, /pageSize:\s*10_000/);
});

test("instant outbox consumer path remains separate from digest module", () => {
  const outboxPath = resolve(
    "src/modules/notification-delivery/business-notification-outbox.consumer.ts",
  );
  const source = readFileSync(outboxPath, "utf8");
  assert.doesNotMatch(source, /daily-operations-digest/);
});

test("earliest incomplete slot is preferred when multiple slots are reached", async () => {
  const prisma = createMemoryIdempotencyPrisma();
  const now = new Date("2026-09-24T10:05:00.000Z"); // 14:05 Dubai — 09:00 and 14:00 reached
  const { dateKey } = formatLocalDateParts(now, "Asia/Dubai");
  const morningKey = buildAttentionMonitorRunKey(dateKey, "09:00", "Asia/Dubai");

  await prisma.idempotencyKey.create({
    data: {
      scope: DAILY_OPERATIONS_DIGEST_IDEMPOTENCY_SCOPE,
      key: morningKey,
      resultRef: digestFailedRef(now.getTime() - 60_000),
    },
  });

  const sends: Array<{ message: string }> = [];
  const sent = await runDailyOperationsDigestCycle(
    prisma as never,
    {
      enabled: true,
      timeZone: "Asia/Dubai",
      monitorTimes: "09:00,14:00,19:00",
      now,
    },
    async (payload) => {
      sends.push(payload);
      return { success: true, provider: "mock" };
    },
    async () => emptySnapshot({ unpaidRentalsCount: 1 }),
  );

  assert.equal(sent, true);
  assert.equal(sends.length, 1);
  const morning = await prisma.idempotencyKey.findUnique({
    where: { scope_key: { scope: DAILY_OPERATIONS_DIGEST_IDEMPOTENCY_SCOPE, key: morningKey } },
  });
  assert.equal(morning?.resultRef, DIGEST_SENT_REF);
});
