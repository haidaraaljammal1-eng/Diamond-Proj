import type { FastifyInstance } from "fastify";
import type { ComplaintNotificationChannel } from "@prisma/client";
import { env } from "src/config/env";
import { withTransaction } from "src/lib/db/transaction";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { defaultProviderRegistry, type ProviderRegistry } from "src/modules/communication/providers";
import { renderComplaintEmail, type ComplaintEmailContext } from "src/modules/complaints/complaint-email";

/**
 * Complaint-notification EMAIL delivery: settings gating + a durable per-recipient
 * outbox processed with retry/backoff + idempotency. This is the bridge between
 * the complaint lifecycle and the CENTRAL transactional email provider — it does
 * NOT build its own SMTP transport (reuses {@link defaultProviderRegistry}).
 *
 * Ordering enforced (prompt §5): Event → Admin channel rule
 * ({@link ComplaintNotificationSetting}) → resolved audience → per-user preference
 * → provider availability (checked at send) → delivery. A user preference can only
 * NARROW what the admin enabled — never enable a channel the admin turned off.
 */

const PROCESSING_LEASE_MS = 5 * 60_000;
const ALL_CHANNELS: ComplaintNotificationChannel[] = ["IN_APP", "EMAIL", "WHATSAPP", "SMS"];

type Deps = { providers?: ProviderRegistry; now?: () => Date };

export function createComplaintNotificationsService(fastify: FastifyInstance, deps: Deps = {}) {
  const prisma = fastify.prisma;
  const providers = deps.providers ?? defaultProviderRegistry(fastify);
  const now = deps.now ?? (() => new Date());

  /**
   * Admin-enabled channels for an event. A missing cell defaults to IN_APP ON /
   * external channels OFF (mirrors the settings list synthesis). This is the ONE
   * source of channel gating for complaint notifications.
   */
  async function getEnabledChannels(eventKey: string): Promise<Set<ComplaintNotificationChannel>> {
    const rows = await prisma.complaintNotificationSetting.findMany({ where: { eventKey } });
    const explicit = new Map(rows.map((r) => [r.channel, r.enabled]));
    const enabled = new Set<ComplaintNotificationChannel>();
    for (const ch of ALL_CHANNELS) {
      const val = explicit.get(ch);
      const on = val !== undefined ? val : ch === "IN_APP";
      if (on) enabled.add(ch);
    }
    return enabled;
  }

  /**
   * Enqueue EMAIL deliveries for an event's audience (idempotent). Returns how many
   * rows were newly queued and, when zero, a stable reason for the admin log.
   */
  async function enqueueEmails(input: {
    eventKey: string;
    complaintId: number;
    dedupeSuffix?: string;
    userIds: number[];
  }): Promise<{ enqueued: number; reason?: "channel_disabled" | "no_audience" }> {
    const enabled = await getEnabledChannels(input.eventKey);
    if (!enabled.has("EMAIL")) return { enqueued: 0, reason: "channel_disabled" };
    if (input.userIds.length === 0) return { enqueued: 0, reason: "no_audience" };

    const users = await prisma.user.findMany({
      where: { id: { in: input.userIds }, status: "ACTIVE" },
      select: { id: true, email: true, language: true },
    });
    const prefs = await prisma.notificationPreference.findMany({
      where: { userId: { in: input.userIds }, eventKey: input.eventKey },
      select: { userId: true, enabled: true, channels: true },
    });
    const prefBy = new Map(prefs.map((p) => [p.userId, p]));
    const suffix = input.dedupeSuffix ?? "";

    let enqueued = 0;
    for (const u of users) {
      if (!u.email || !u.email.includes("@")) continue; // no usable address
      const pref = prefBy.get(u.id);
      if (pref) {
        if (!pref.enabled) continue; // user muted this event
        const chans = pref.channels as string[] | null;
        if (Array.isArray(chans) && !chans.includes("EMAIL")) continue; // user narrowed out EMAIL
      }
      try {
        await prisma.complaintNotificationDelivery.create({
          data: {
            complaintId: input.complaintId,
            eventKey: input.eventKey,
            dedupeSuffix: suffix,
            channel: "EMAIL",
            recipientUserId: u.id,
            recipientEmail: u.email,
            lang: u.language || "ar",
          },
        });
        enqueued++;
      } catch (err) {
        if (!isUniqueViolation(err)) throw err; // already queued for this (event,cycle,recipient)
      }
    }
    return { enqueued };
  }

  async function logDelivery(userId: number, eventKey: string, status: "DELIVERED" | "FAILED" | "SKIPPED", reason?: string) {
    // Reuse the generic delivery log for admin visibility (no PII/body persisted).
    await prisma.notificationDeliveryLog.create({
      data: { userId, eventKey, channel: "EMAIL", status, reason },
    });
  }

  /** Requeue deliveries whose PROCESSING lease is stale (worker crashed mid-send). */
  async function recoverStaleLeases(): Promise<number> {
    const cutoff = new Date(now().getTime() - PROCESSING_LEASE_MS);
    const res = await prisma.complaintNotificationDelivery.updateMany({
      where: { status: "PROCESSING", processingStartedAt: { lt: cutoff }, providerMessageId: null },
      data: { status: "QUEUED", failureReason: "lease_recovered", processingStartedAt: null },
    });
    return res.count;
  }

  async function buildContext(complaintId: number, lang: string): Promise<ComplaintEmailContext | null> {
    const c = await prisma.complaint.findUnique({
      where: { id: complaintId },
      include: {
        customer: { select: { name: true } },
        branch: { select: { name: true } },
        category: { select: { nameEn: true, nameAr: true } },
        department: { select: { name: true } },
        assignedTo: { select: { name: true } },
        escalations: { orderBy: { createdAt: "desc" }, take: 1, select: { reason: true } },
      },
    });
    if (!c) return null;
    const ar = lang.toLowerCase().startsWith("ar");
    return {
      publicNumber: c.publicNumber,
      customerName: c.customer?.name ?? null,
      branchName: c.branch?.name ?? null,
      categoryName: c.category ? (ar ? c.category.nameAr : c.category.nameEn) : null,
      priority: c.priority,
      lifecycleStatus: c.lifecycleStatus,
      assigneeName: c.assignedTo?.name ?? null,
      departmentName: c.department?.name ?? null,
      escalationLevel: c.escalationLevel,
      escalationReason: c.escalations[0]?.reason ?? null,
      slaStatus: null,
      viewUrl: `${env.FRONTEND_URL.replace(/\/+$/, "")}/${ar ? "ar" : "en"}/complaints/${complaintId}`,
    };
  }

  function slaStatusFor(eventKey: string): "warning" | "breached" | null {
    if (eventKey === "complaint.sla.warning") return "warning";
    if (eventKey === "complaint.sla.breached") return "breached";
    return null;
  }

  async function finalize(id: number, status: "SENT" | "FAILED" | "SKIPPED", patch: Record<string, unknown>) {
    await prisma.complaintNotificationDelivery.update({ where: { id }, data: { status, ...patch } });
  }

  async function processOne(id: number): Promise<"SENT" | "SKIPPED" | "FAILED" | "RETRY" | "NOOP"> {
    // Claim under advisory lock + status CAS → idempotent across concurrent workers.
    const claimed = await withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, "complaint_notif_delivery", id);
      const d = await tx.complaintNotificationDelivery.findUnique({ where: { id } });
      if (!d || d.status !== "QUEUED") return null;
      await tx.complaintNotificationDelivery.update({
        where: { id },
        data: { status: "PROCESSING", attempts: { increment: 1 }, processingStartedAt: now() },
      });
      return d;
    });
    if (!claimed) return "NOOP";

    const d = claimed;
    const ctx = await buildContext(d.complaintId, d.lang);
    if (!ctx) {
      await finalize(id, "SKIPPED", { failureReason: "complaint_missing", processingStartedAt: null });
      await logDelivery(d.recipientUserId, d.eventKey, "SKIPPED", "complaint_missing");
      return "SKIPPED";
    }
    ctx.slaStatus = slaStatusFor(d.eventKey);

    const rendered = renderComplaintEmail(d.eventKey, ctx, d.lang);
    if (!rendered) {
      await finalize(id, "SKIPPED", { failureReason: "no_template", processingStartedAt: null });
      await logDelivery(d.recipientUserId, d.eventKey, "SKIPPED", "no_template");
      return "SKIPPED";
    }

    const provider = providers.EMAIL;
    if ((await provider.readiness()) !== "CONFIGURED") {
      // Honest SKIPPED_NOT_CONFIGURED — never a fake "sent".
      await finalize(id, "SKIPPED", { failureReason: "provider_not_configured", processingStartedAt: null });
      await logDelivery(d.recipientUserId, d.eventKey, "SKIPPED", "provider_not_configured");
      return "SKIPPED";
    }

    const result = await provider.send({
      to: d.recipientEmail,
      rendered: { subject: rendered.subject, html: rendered.html, text: rendered.text, buttons: [] },
    });

    if (result.status === "SENT") {
      await finalize(id, "SENT", { sentAt: now(), providerMessageId: result.providerMessageId, failureReason: null, processingStartedAt: null });
      await logDelivery(d.recipientUserId, d.eventKey, "DELIVERED");
      return "SENT";
    }
    if (result.status === "SKIPPED") {
      await finalize(id, "SKIPPED", { failureReason: result.reason, processingStartedAt: null });
      await logDelivery(d.recipientUserId, d.eventKey, "SKIPPED", result.reason);
      return "SKIPPED";
    }
    // FAILED — retry with backoff until maxAttempts, then terminal FAILED.
    if (d.attempts + 1 < d.maxAttempts) {
      const backoffMs = Math.min(60, 2 ** (d.attempts + 1)) * 60_000;
      await prisma.complaintNotificationDelivery.update({
        where: { id },
        data: { status: "QUEUED", failureReason: result.reason, nextAttemptAt: new Date(now().getTime() + backoffMs), processingStartedAt: null },
      });
      return "RETRY";
    }
    await finalize(id, "FAILED", { failureReason: result.reason, processingStartedAt: null });
    await logDelivery(d.recipientUserId, d.eventKey, "FAILED", result.reason);
    return "FAILED";
  }

  async function processDueEmails(opts: { batchSize?: number } = {}) {
    const batchSize = opts.batchSize ?? 200;
    const recovered = await recoverStaleLeases();
    const due = await prisma.complaintNotificationDelivery.findMany({
      where: { status: "QUEUED", channel: "EMAIL", nextAttemptAt: { lte: now() } },
      select: { id: true },
      orderBy: { nextAttemptAt: "asc" },
      take: batchSize,
    });
    let sent = 0, skipped = 0, failed = 0, retried = 0;
    for (const row of due) {
      const o = await processOne(row.id);
      if (o === "SENT") sent++;
      else if (o === "SKIPPED") skipped++;
      else if (o === "FAILED") failed++;
      else if (o === "RETRY") retried++;
    }
    return { recovered, processed: due.length, sent, skipped, failed, retried };
  }

  return { getEnabledChannels, enqueueEmails, processDueEmails, recoverStaleLeases };
}

export type ComplaintNotificationsService = ReturnType<typeof createComplaintNotificationsService>;
