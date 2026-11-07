import type { PrismaClient } from "@prisma/client";
import { env } from "src/config/env";
import { createFinanceReceivablesService } from "src/modules/finance/finance-receivables.service";
import { resolveFinanceCompanyScope } from "src/modules/finance/finance-company-scope";
import {
  MAINTENANCE_DELAY_IDEMPOTENCY_SCOPE,
  MAINTENANCE_SCHEDULE_MISSED_IDEMPOTENCY_SCOPE,
  OPEN_RECEIVABLES_REMINDER_IDEMPOTENCY_SCOPE,
  OVERDUE_RENTAL_REMINDER_IDEMPOTENCY_SCOPE,
} from "src/modules/notification-delivery/business-notification.constants";
import {
  buildAttentionMonitorRunKey,
  formatLocalDateParts,
  parseAttentionMonitorTimes,
  resolveDueAttentionSlot,
} from "src/modules/notification-delivery/attention-monitor.service";
import {
  buildMaintenanceDelayedMessage,
  buildMaintenanceScheduleMissedMessage,
  buildOpenReceivablesReminderMessage,
  buildOverdueRentalReminderMessage,
} from "src/modules/notification-delivery/business-notification.messages";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import { notificationService } from "src/modules/notification-delivery/notification.service";
import { runIdempotent } from "src/lib/db/idempotency";
import type { NotificationSendResult } from "src/modules/notification-delivery/notification.types";

function notificationVehicleName(vehicle: {
  vehicleName: string | null;
  modelYear: number | null;
  plateNumber: string | null;
  model: { name: string } | null;
}): string {
  return vehicleDisplayName({
    vehicleName: vehicle.vehicleName,
    modelName: vehicle.model?.name ?? null,
    modelYear: vehicle.modelYear,
    plateNumber: vehicle.plateNumber,
  });
}

type SendPayload = (payload: { title: string; message: string }) => Promise<NotificationSendResult>;

/**
 * ACTIVE contracts past endAt (vehicle still on rental). Runs up to 3×/day per configured slots.
 */
export async function runOverdueRentalReminderCycle(
  prisma: PrismaClient,
  now = new Date(),
  send: SendPayload = notificationService.send.bind(notificationService),
): Promise<number> {
  // Superseded by Daily Operations & Receivables digest — never send in parallel.
  if (env.DAILY_OPERATIONS_DIGEST_ENABLED) return 0;
  if (!env.OVERDUE_RENTAL_MONITOR_ENABLED) return 0;

  const timeZone = env.ATTENTION_MONITOR_TIMEZONE;
  const slots = parseAttentionMonitorTimes(env.OVERDUE_RENTAL_MONITOR_TIMES);
  const dueSlot = resolveDueAttentionSlot(now, timeZone, slots);
  if (!dueSlot) return 0;

  const { dateKey } = formatLocalDateParts(now, timeZone);

  const overdue = await prisma.contract.findMany({
    where: {
      status: "ACTIVE",
      endAt: { lt: now },
    },
    select: {
      id: true,
      contractNumber: true,
      endAt: true,
      vehicle: { include: { model: { select: { name: true } } } },
    },
  });

  let sent = 0;
  for (const row of overdue) {
    const runKey = `${row.id}:${dateKey}:${dueSlot}:${timeZone}`;
    const vehicleName = notificationVehicleName(row.vehicle);
    const message = buildOverdueRentalReminderMessage({
      contractNumber: row.contractNumber,
      vehicleName,
    });
    const outcome = await runIdempotent(
      prisma,
      { scope: OVERDUE_RENTAL_REMINDER_IDEMPOTENCY_SCOPE, key: runKey },
      () => send(message),
    );
    if (!outcome.deduped && outcome.result?.success) sent += 1;
  }
  return sent;
}

/**
 * At each configured slot: if Finance open receivables grid is non-empty, send a breakdown digest
 * (same row sources as the page projection). Idempotent per calendar day + slot.
 */
export async function runOpenReceivablesReminderCycle(
  prisma: PrismaClient,
  now = new Date(),
  send: SendPayload = notificationService.send.bind(notificationService),
): Promise<boolean> {
  if (env.DAILY_OPERATIONS_DIGEST_ENABLED) return false;
  if (!env.OPEN_RECEIVABLES_REMINDER_ENABLED) return false;

  const timeZone = env.ATTENTION_MONITOR_TIMEZONE;
  const slots = parseAttentionMonitorTimes(env.OPEN_RECEIVABLES_REMINDER_TIMES);
  if (slots.length === 0) return false;

  const dueSlot = resolveDueAttentionSlot(now, timeZone, slots);
  if (!dueSlot) return false;

  const { dateKey } = formatLocalDateParts(now, timeZone);
  const runKey = buildAttentionMonitorRunKey(dateKey, dueSlot, timeZone);

  const existing = await prisma.idempotencyKey.findUnique({
    where: { scope_key: { scope: OPEN_RECEIVABLES_REMINDER_IDEMPOTENCY_SCOPE, key: runKey } },
  });
  if (existing) return false;

  const financeScope = resolveFinanceCompanyScope({});
  const receivables = createFinanceReceivablesService(prisma);
  const list = await receivables.listOpenReceivables({
    page: 1,
    pageSize: 1,
    scope: financeScope,
  });
  if (list.total === 0) return false;

  const message = buildOpenReceivablesReminderMessage();
  const result = await send(message);
  if (!result.success) return false;

  await prisma.idempotencyKey.create({
    data: { scope: OPEN_RECEIVABLES_REMINDER_IDEMPOTENCY_SCOPE, key: runKey },
  });
  return true;
}

/**
 * SCHEDULED orders past scheduledAt without start (1 reminder per order per calendar day).
 */
export async function runMaintenanceScheduleMissedCycle(
  prisma: PrismaClient,
  now = new Date(),
  send: SendPayload = notificationService.send.bind(notificationService),
): Promise<number> {
  if (env.DAILY_OPERATIONS_DIGEST_ENABLED) return 0;
  if (!env.MAINTENANCE_SCHEDULE_MISSED_MONITOR_ENABLED) return 0;

  const timeZone = env.ATTENTION_MONITOR_TIMEZONE;
  const slots = parseAttentionMonitorTimes(env.MAINTENANCE_SCHEDULE_MISSED_MONITOR_TIMES);
  const dueSlot = resolveDueAttentionSlot(now, timeZone, slots);
  if (!dueSlot) return 0;

  const { dateKey } = formatLocalDateParts(now, timeZone);

  const orders = await prisma.maintenanceOrder.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { not: null, lt: now },
    },
    include: {
      vehicle: { include: { model: { select: { name: true } } } },
    },
  });

  let sent = 0;
  for (const order of orders) {
    if (!order.scheduledAt) continue;
    const runKey = `${order.id}:${dateKey}`;
    const vehicleName = notificationVehicleName(order.vehicle);
    const message = buildMaintenanceScheduleMissedMessage({
      vehicleName,
    });
    const outcome = await runIdempotent(
      prisma,
      { scope: MAINTENANCE_SCHEDULE_MISSED_IDEMPOTENCY_SCOPE, key: runKey },
      () => send(message),
    );
    if (!outcome.deduped && outcome.result?.success) sent += 1;
  }
  return sent;
}

/**
 * IN_SERVICE orders past expectedCompletionAt (1 reminder per order per calendar day).
 */
export async function runMaintenanceDelayCycle(
  prisma: PrismaClient,
  now = new Date(),
  send: SendPayload = notificationService.send.bind(notificationService),
): Promise<number> {
  if (env.DAILY_OPERATIONS_DIGEST_ENABLED) return 0;
  if (!env.MAINTENANCE_DELAY_MONITOR_ENABLED) return 0;

  const timeZone = env.ATTENTION_MONITOR_TIMEZONE;
  const slots = parseAttentionMonitorTimes(env.MAINTENANCE_DELAY_MONITOR_TIMES);
  const dueSlot = resolveDueAttentionSlot(now, timeZone, slots);
  if (!dueSlot) return 0;

  const { dateKey } = formatLocalDateParts(now, timeZone);

  const orders = await prisma.maintenanceOrder.findMany({
    where: {
      status: "IN_SERVICE",
      expectedCompletionAt: { not: null, lt: now },
    },
    include: {
      vehicle: { include: { model: { select: { name: true } } } },
    },
  });

  let sent = 0;
  for (const order of orders) {
    if (!order.expectedCompletionAt) continue;
    const runKey = `${order.id}:${dateKey}`;
    const vehicleName = notificationVehicleName(order.vehicle);
    const message = buildMaintenanceDelayedMessage({
      vehicleName,
    });
    const outcome = await runIdempotent(
      prisma,
      { scope: MAINTENANCE_DELAY_IDEMPOTENCY_SCOPE, key: runKey },
      () => send(message),
    );
    if (!outcome.deduped && outcome.result?.success) sent += 1;
  }
  return sent;
}
