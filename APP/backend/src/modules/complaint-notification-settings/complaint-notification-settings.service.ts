import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { defaultProviderRegistry } from "src/modules/communication/providers";
import {
  complaintNotificationInvalidEventError,
  complaintNotificationSettingStaleError,
} from "src/modules/complaints/complaints.errors";
import type { UpdateComplaintNotificationSettingSchema } from "src/modules/complaints/complaints.schema";

/**
 * Admin configuration layer for complaint notification preferences (BE-4).
 *
 * This is a CONFIGURATION layer only — it does NOT change audience resolution
 * (who is eligible to be notified, resolved in code) nor the delivery pipeline.
 * A row is a per-(event, channel) preference. Channel *availability* is derived
 * from provider readiness at read time: IN_APP always delivers; EMAIL depends on
 * SMTP config; WHATSAPP/SMS are NOT_CONFIGURED in this build. Enabling a channel
 * is a stored preference and is NEVER reported as "connected" on its own.
 */

// The complaint event catalog (mirrors NotificationDefinition `complaint.*` keys
// and the EVENTS map in complaints.service). Updates outside this set are rejected.
export const COMPLAINT_NOTIFICATION_EVENT_KEYS = [
  "complaint.created",
  "complaint.routed",
  "complaint.assigned",
  "complaint.sla.warning",
  "complaint.sla.breached",
  "complaint.escalated",
  "complaint.action_added",
  "complaint.resolved",
  "complaint.closed",
  "complaint.reopened",
] as const;

export const COMPLAINT_NOTIFICATION_CHANNELS = ["IN_APP", "EMAIL", "WHATSAPP", "SMS"] as const;
type Channel = (typeof COMPLAINT_NOTIFICATION_CHANNELS)[number];
type Availability = "CONFIGURED" | "NOT_CONFIGURED" | "UNAVAILABLE";

const EVENT_KEY_SET = new Set<string>(COMPLAINT_NOTIFICATION_EVENT_KEYS);

export function createComplaintNotificationSettingsService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  /** IN_APP always delivers; EMAIL/WHATSAPP/SMS follow the messaging provider registry. */
  async function availabilityFor(channel: Channel): Promise<Availability> {
    if (channel === "IN_APP") return "CONFIGURED";
    return defaultProviderRegistry(fastify)[channel as Exclude<Channel, "IN_APP">].readiness();
  }

  async function channelAvailability() {
    return Promise.all(
      COMPLAINT_NOTIFICATION_CHANNELS.map(async (channel) => ({ channel, availability: await availabilityFor(channel) })),
    );
  }

  async function toDto(row: { eventKey: string; channel: string; enabled: boolean; revision: number }) {
    const channel = row.channel as Channel;
    return { eventKey: row.eventKey, channel, enabled: row.enabled, availability: await availabilityFor(channel), revision: row.revision };
  }

  /** Full event×channel matrix. Rows are seeded, but any missing cell is
   *  synthesized as a default (IN_APP on, others off, revision 0) so the matrix
   *  is always complete without a write. */
  async function list() {
    const rows = await prisma.complaintNotificationSetting.findMany();
    const byCell = new Map(rows.map((r) => [`${r.eventKey}|${r.channel}`, r]));
    // Resolve each channel's availability once (not once per event×channel cell) —
    // readiness() is now DB-aware and does real I/O.
    const channels = await channelAvailability();
    const availabilityByChannel = new Map(channels.map((c) => [c.channel, c.availability]));
    const settings: { eventKey: string; channel: Channel; enabled: boolean; availability: Availability; revision: number }[] = [];
    for (const eventKey of COMPLAINT_NOTIFICATION_EVENT_KEYS) {
      for (const channel of COMPLAINT_NOTIFICATION_CHANNELS) {
        const row = byCell.get(`${eventKey}|${channel}`);
        settings.push({
          eventKey,
          channel,
          enabled: row ? row.enabled : channel === "IN_APP",
          availability: availabilityByChannel.get(channel) ?? "NOT_CONFIGURED",
          revision: row ? row.revision : 0,
        });
      }
    }
    return {
      channels,
      events: COMPLAINT_NOTIFICATION_EVENT_KEYS.map((eventKey) => ({ eventKey })),
      settings,
    };
  }

  /** Toggle one cell with optimistic locking. Enabling a NOT_CONFIGURED channel is
   *  allowed (a preference) — availability stays honest in the response. */
  async function update(eventKey: string, input: z.infer<typeof UpdateComplaintNotificationSettingSchema>) {
    if (!EVENT_KEY_SET.has(eventKey)) throw complaintNotificationInvalidEventError(eventKey);
    const where = { eventKey_channel: { eventKey, channel: input.channel } };
    const existing = await prisma.complaintNotificationSetting.findUnique({ where });
    if (existing) {
      if (existing.revision !== input.revision) throw complaintNotificationSettingStaleError(input.revision, existing.revision);
      const updated = await prisma.complaintNotificationSetting.update({ where, data: { enabled: input.enabled, revision: { increment: 1 } } });
      return toDto(updated);
    }
    // No row yet → only a revision-0 write is valid (a non-zero expected revision
    // means another writer already created the cell → guided reload).
    if (input.revision !== 0) throw complaintNotificationSettingStaleError(input.revision, 0);
    try {
      const created = await prisma.complaintNotificationSetting.create({ data: { eventKey, channel: input.channel, enabled: input.enabled, revision: 1 } });
      return toDto(created);
    } catch {
      const now = await prisma.complaintNotificationSetting.findUnique({ where });
      throw complaintNotificationSettingStaleError(input.revision, now?.revision ?? 0);
    }
  }

  return { list, update };
}
