import type { PrismaClient } from "@prisma/client";
import { env } from "src/config/env";
import { ATTENTION_MONITOR_IDEMPOTENCY_SCOPE } from "src/modules/notification-delivery/business-notification.constants";
import {
  attentionMonitorHasOutstandingCases,
  loadAttentionMonitorSnapshot,
} from "src/modules/notification-delivery/attention-monitor.queries";
import { buildAttentionSummaryMessage } from "src/modules/notification-delivery/business-notification.messages";
import { notificationService } from "src/modules/notification-delivery/notification.service";
import type { NotificationSendResult } from "src/modules/notification-delivery/notification.types";

export function parseAttentionMonitorTimes(raw: string): string[] {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^\d{2}:\d{2}$/.test(value));
}

export function formatLocalDateParts(date: Date, timeZone: string): { dateKey: string; timeKey: string } {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    dateKey: `${read("year")}-${read("month")}-${read("day")}`,
    timeKey: `${read("hour")}:${read("minute")}`,
  };
}

export function resolveDueAttentionSlot(now: Date, timeZone: string, slots: string[]): string | null {
  const { timeKey } = formatLocalDateParts(now, timeZone);
  return slots.includes(timeKey) ? timeKey : null;
}

export function buildAttentionMonitorRunKey(dateKey: string, slot: string, timeZone: string): string {
  return `${dateKey}:${slot}:${timeZone}`;
}

export interface AttentionMonitorCycleOptions {
  enabled: boolean;
  timeZone: string;
  monitorTimes: string;
  now: Date;
}

type AttentionMonitorSend = (payload: {
  title: string;
  message: string;
}) => Promise<NotificationSendResult>;

export async function runAttentionMonitorCycle(
  prisma: PrismaClient,
  options: AttentionMonitorCycleOptions,
  send: AttentionMonitorSend = notificationService.send.bind(notificationService),
  loadSnapshot = loadAttentionMonitorSnapshot,
): Promise<boolean> {
  if (!options.enabled) return false;

  const slots = parseAttentionMonitorTimes(options.monitorTimes);
  const dueSlot = resolveDueAttentionSlot(options.now, options.timeZone, slots);
  if (!dueSlot) return false;

  const { dateKey } = formatLocalDateParts(options.now, options.timeZone);
  const runKey = buildAttentionMonitorRunKey(dateKey, dueSlot, options.timeZone);

  const existing = await prisma.idempotencyKey.findUnique({
    where: { scope_key: { scope: ATTENTION_MONITOR_IDEMPOTENCY_SCOPE, key: runKey } },
  });
  if (existing) return false;

  const snapshot = await loadSnapshot(prisma);
  if (!attentionMonitorHasOutstandingCases(snapshot)) return false;

  const message = buildAttentionSummaryMessage(snapshot);
  const result = await send(message);
  if (!result.success) return false;

  await prisma.idempotencyKey.create({
    data: { scope: ATTENTION_MONITOR_IDEMPOTENCY_SCOPE, key: runKey },
  });
  return true;
}

export function createAttentionMonitorService(app: { prisma: PrismaClient }) {
  return {
    runDueCycle(now = new Date()) {
      return runAttentionMonitorCycle(app.prisma, {
        enabled: env.ATTENTION_MONITOR_ENABLED,
        timeZone: env.ATTENTION_MONITOR_TIMEZONE,
        monitorTimes: env.ATTENTION_MONITOR_TIMES,
        now,
      });
    },
  };
}
