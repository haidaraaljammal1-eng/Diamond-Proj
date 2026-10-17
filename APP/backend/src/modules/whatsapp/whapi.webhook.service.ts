import type { FastifyInstance } from "fastify";
import type { Prisma, WhatsAppConnectionStatus, WhatsAppWebhookEventStatus } from "@prisma/client";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { withTransaction } from "src/lib/db/transaction";
import { env } from "src/config/env";
import { WHATSAPP_CURRENT_STATUSES } from "src/modules/whatsapp/whatsapp.constants";
import { WhatsAppErrorReason } from "src/modules/whatsapp/whatsapp.errors";
import { decryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { whapiWebhookAuthorized } from "src/modules/whatsapp/whapi.webhook-material";
import { archiveWhatsAppProviderMedia } from "src/modules/whatsapp/whatsapp.media-archive";
import { materializeInboundMessage } from "src/modules/whatsapp/whatsapp.inbound.service";
import { choosePendingEchoCandidate } from "src/modules/whatsapp/whatsapp.echo-match";
import { materializeOutboundEchoMessage } from "src/modules/whatsapp/whatsapp.outbound-echo.service";
import {
  applyOutboundProviderStatus,
  reconcileOutboundStatusEvents,
} from "src/modules/whatsapp/whatsapp.outbound-status";
import {
  applyDeferredMessageRevisions,
  applyWhapiMessageRevision,
} from "src/modules/whatsapp/whatsapp.message-revision";
import { writeWhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime-outbox";
import { publishWhatsAppRealtime } from "src/modules/whatsapp/whatsapp.realtime-publisher";
import type { WhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime";
import { sanitizeWebhookPayload } from "src/modules/whatsapp/whatsapp.webhook-sanitize";
import { sha256Hex } from "src/modules/whatsapp/whatsapp.webhook-signature";
import { mergeGroupMessagePayload } from "src/modules/whatsapp/whatsapp.group-display";
import { parseWhapiWebhookBatch, type ParsedWhapiWebhook } from "src/modules/whatsapp/whapi.webhook-parse";
import { whapiChannelIdsMatch, WHAPI_WEBHOOK_MAX_BYTES } from "src/modules/whatsapp/whapi.config";
import type { WhatsAppWebhookHttpResult } from "src/modules/whatsapp/whatsapp.webhook.service";

const CURRENT_STATUSES: WhatsAppConnectionStatus[] = [...WHATSAPP_CURRENT_STATUSES];

function logWebhookStage(
  log: FastifyInstance["log"],
  stage: string,
  startedAt: number,
  extra: { items?: number; messageType?: string | null } = {},
) {
  log.info(
    { stage, ms: Date.now() - startedAt, ...extra },
    "whatsapp webhook stage",
  );
}

function parseJson(raw: Buffer): unknown | undefined {
  try {
    return JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function inboundDisplayPayload(parsed: ParsedWhapiWebhook): Record<string, unknown> | null {
  const payload: Record<string, unknown> = {};
  if (parsed.source) payload.source = parsed.source;
  if (parsed.voiceNote) payload.whapi = { voice: true };
  if (parsed.isGroup) {
    return mergeGroupMessagePayload(payload, {
      senderDisplayName: parsed.displayName,
      senderProviderId: parsed.senderProviderId,
      quotedProviderMessageId: parsed.quotedProviderMessageId,
    }) as Record<string, unknown>;
  }
  return Object.keys(payload).length > 0 ? payload : null;
}

function storedWebhookPlaintext(stored: string | null): string | null {
  if (!stored) return null;
  try {
    return decryptWhatsAppCredential(stored);
  } catch {
    return null;
  }
}

export function createWhapiWebhookService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function ingest(
    rawBody: Buffer,
    callbackKey: string,
    webhookSecret: string | undefined,
  ): Promise<WhatsAppWebhookHttpResult> {
    if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > WHAPI_WEBHOOK_MAX_BYTES) {
      return { httpStatus: 400, code: WhatsAppErrorReason.WEBHOOK_MALFORMED_PAYLOAD };
    }

    const connection = await prisma.whatsAppConnection.findFirst({
      where: { provider: "WHAPI", status: { in: CURRENT_STATUSES } },
      select: {
        id: true,
        providerInstanceId: true,
        webhookCallbackCiphertext: true,
      },
    });
    const accepted = whapiWebhookAuthorized({
      presentedCallbackKey: callbackKey,
      presentedSecret: webhookSecret,
      storedPlaintext: storedWebhookPlaintext(connection?.webhookCallbackCiphertext ?? null),
      envCallbackKey: env.WHAPI_WEBHOOK_CALLBACK_KEY,
      envSecret: env.WHAPI_WEBHOOK_SECRET,
    });
    if (!accepted) {
      return { httpStatus: 403, code: WhatsAppErrorReason.WEBHOOK_CALLBACK_INVALID };
    }

    const parsedJson = parseJson(rawBody);
    if (parsedJson === undefined || parsedJson === null || typeof parsedJson !== "object") {
      return { httpStatus: 400, code: WhatsAppErrorReason.WEBHOOK_MALFORMED_PAYLOAD };
    }

    const envelopeHash = sha256Hex(rawBody);
    const batch = parseWhapiWebhookBatch(parsedJson, envelopeHash);
    const configuredChannel = connection?.providerInstanceId?.trim() ?? "";
    const channelId = batch.find((item) => item.channelId)?.channelId ?? null;
    if (!configuredChannel || !whapiChannelIdsMatch(configuredChannel, channelId)) {
      for (const parsed of batch) {
        await persistTrace(parsed, parsedJson, new Date(), null, "IGNORED", WhatsAppErrorReason.WEBHOOK_CONNECTION_NOT_FOUND);
      }
      return { httpStatus: 200, code: "RECEIVED" };
    }
    if (!connection) {
      for (const parsed of batch) {
        await persistTrace(parsed, parsedJson, new Date(), null, "IGNORED", WhatsAppErrorReason.WEBHOOK_CONNECTION_NOT_FOUND);
      }
      return { httpStatus: 200, code: "RECEIVED" };
    }

    const startedAt = Date.now();
    logWebhookStage(fastify.log, "accepted", startedAt, { items: batch.length });
    let failed = false;
    for (const parsed of batch) {
      try {
        await persistParsed(parsed, parsedJson, connection.id, new Date());
      } catch (err) {
        failed = true;
        fastify.log.error({ err, eventKey: parsed.providerEventKey }, "whapi webhook persist failed");
        try {
          await recordBatchItemFailure(parsed, parsedJson, connection.id, new Date());
        } catch (recordErr) {
          fastify.log.error(
            { err: recordErr, eventKey: parsed.providerEventKey },
            "whapi webhook failure row was not recorded",
          );
        }
      }
    }
    logWebhookStage(fastify.log, failed ? "failed" : "completed", startedAt, { items: batch.length });
    if (failed) return { httpStatus: 500, code: "WHATSAPP_WEBHOOK_INTERNAL_FAILURE" };
    return { httpStatus: 200, code: "RECEIVED" };
  }

  async function persistParsed(
    parsed: ParsedWhapiWebhook,
    json: unknown,
    connectionId: string,
    receivedAt: Date,
  ) {
    if (parsed.ignoreReason) {
      const insert = await persistTrace(parsed, json, receivedAt, connectionId, "IGNORED", parsed.ignoreReason);
      if (insert !== "duplicate") await touchConnection(connectionId, receivedAt);
      return;
    }
    if (parsed.kind === "status") {
      await ingestStatus(parsed, json, connectionId, receivedAt);
      return;
    }
    if (parsed.kind === "message" && (parsed.action === "update" || parsed.action === "delete")) {
      await ingestRevision(parsed, json, connectionId, receivedAt);
      return;
    }
    if (parsed.kind === "message") {
      if (parsed.fromMe) {
        await ingestOutboundEcho(parsed, json, connectionId, receivedAt);
      } else {
        await ingestInbound(parsed, json, connectionId, receivedAt);
      }
      return;
    }
    await persistTrace(
      parsed,
      json,
      receivedAt,
      connectionId,
      "IGNORED",
      WhatsAppErrorReason.WEBHOOK_UNSUPPORTED_EVENT,
    );
  }

  async function ingestInbound(
    parsed: ParsedWhapiWebhook,
    json: unknown,
    connectionId: string,
    receivedAt: Date,
  ) {
    const startedAt = Date.now();
    if (!parsed.providerMessageId || !parsed.customerWaId || !parsed.chatId) {
      await persistTrace(
        parsed,
        json,
        receivedAt,
        connectionId,
        "FAILED",
        WhatsAppErrorReason.INBOUND_CUSTOMER_MISSING,
      );
      return;
    }
    const eventRow = await ensureReceivedEvent(parsed, json, receivedAt, connectionId);
    if (!eventRow) return;
    if (eventRow.status === "PROCESSED") return;
    try {
      const stored = await materializeInboundMessage(prisma, {
        connectionId,
        customerWaId: parsed.customerWaId,
        providerChatId: parsed.chatId,
        customerDisplayName: parsed.displayName,
        providerMessageId: parsed.providerMessageId,
        messageType: parsed.messageType,
        textBody: parsed.textBody,
        providerMediaId: parsed.providerMediaId,
        caption: parsed.caption,
        mediaFilename: parsed.mediaFilename,
        mediaMimeType: parsed.mediaMimeType,
        mediaSizeBytes: parsed.mediaSizeBytes,
        displayPayload: inboundDisplayPayload(parsed),
        providerOccurredAt: parsed.occurredAt,
        receivedAt,
        webhookEventId: eventRow.id,
      });
      if (parsed.providerMediaId) {
        void archiveWhatsAppProviderMedia(prisma, stored.messageId).catch((err) => {
          fastify.log.warn({ err, messageId: stored.messageId }, "whatsapp media archive skipped");
        });
      }
      await prisma.whatsAppWebhookEvent.update({
        where: { id: eventRow.id },
        data: { status: "PROCESSED", processedAt: new Date(), failureCode: null },
      });
      if (parsed.providerMessageId) {
        await applyDeferredMessageRevisions(prisma, connectionId, parsed.providerMessageId);
      }
      await touchConnection(connectionId, receivedAt);
      logWebhookStage(fastify.log, "inbound.published", startedAt, { messageType: parsed.messageType });
    } catch (err) {
      await prisma.whatsAppWebhookEvent.update({
        where: { id: eventRow.id },
        data: {
          status: "FAILED",
          processedAt: null,
          failureCode: WhatsAppErrorReason.INBOUND_MATERIALIZATION_FAILED,
        },
      });
      throw err;
    }
  }

  async function ingestOutboundEcho(
    parsed: ParsedWhapiWebhook,
    json: unknown,
    connectionId: string,
    receivedAt: Date,
  ) {
    if (!parsed.providerMessageId || !parsed.customerWaId || !parsed.chatId) {
      await persistTrace(
        parsed,
        json,
        receivedAt,
        connectionId,
        "IGNORED",
        WhatsAppErrorReason.WEBHOOK_UNSUPPORTED_EVENT,
      );
      return;
    }

    const existing = await prisma.whatsAppMessage.findFirst({
      where: { connectionId, providerMessageId: parsed.providerMessageId, direction: "OUTBOUND" },
      select: { id: true },
    });
    if (existing) {
      await persistTrace(parsed, json, receivedAt, connectionId, "PROCESSED", null);
      await reconcileEchoStatuses(connectionId, parsed.providerMessageId);
      await applyDeferredMessageRevisions(prisma, connectionId, parsed.providerMessageId);
      await touchConnection(connectionId, receivedAt);
      return;
    }

    const conversation = await prisma.whatsAppConversation.findFirst({
      where: { connectionId, providerChatId: parsed.chatId },
      select: { id: true },
    });
    if (conversation) {
      const candidates = await prisma.whatsAppMessage.findMany({
        where: {
          conversationId: conversation.id,
          direction: "OUTBOUND",
          providerMessageId: null,
          sendState: { in: ["PENDING", "ACCEPTED", "UNKNOWN"] },
          createdAt: { gte: new Date(receivedAt.getTime() - 15 * 60_000) },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, textBody: true, messageType: true, createdAt: true },
      });
      const chosen = choosePendingEchoCandidate(candidates, { textBody: parsed.textBody });
      if (chosen) {
        try {
          await prisma.whatsAppMessage.update({
            where: { id: chosen.id },
            data: { providerMessageId: parsed.providerMessageId },
          });
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
        }
        await persistTrace(parsed, json, receivedAt, connectionId, "PROCESSED", null);
        await reconcileEchoStatuses(connectionId, parsed.providerMessageId);
        await applyDeferredMessageRevisions(prisma, connectionId, parsed.providerMessageId);
        await touchConnection(connectionId, receivedAt);
        return;
      }
    }

    const eventRow = await ensureReceivedEvent(parsed, json, receivedAt, connectionId);
    if (!eventRow || eventRow.status === "PROCESSED") return;
    const echoed = await materializeOutboundEchoMessage(prisma, {
      connectionId,
      customerWaId: parsed.customerWaId,
      providerChatId: parsed.chatId,
      providerMessageId: parsed.providerMessageId,
      messageType: parsed.messageType,
      textBody: parsed.textBody,
      caption: parsed.caption,
      mediaFilename: parsed.mediaFilename,
      providerMediaId: parsed.providerMediaId,
      mediaMimeType: parsed.mediaMimeType,
      voiceNote: parsed.voiceNote,
      providerOccurredAt: parsed.occurredAt,
      receivedAt,
      webhookEventId: eventRow.id,
      source: parsed.source,
    });
    if (parsed.providerMediaId) {
      void archiveWhatsAppProviderMedia(prisma, echoed.messageId).catch((err) => {
        fastify.log.warn({ err, messageId: echoed.messageId }, "whatsapp media archive skipped");
      });
    }
    await reconcileEchoStatuses(connectionId, parsed.providerMessageId);
    await applyDeferredMessageRevisions(prisma, connectionId, parsed.providerMessageId);
    await touchConnection(connectionId, receivedAt);
  }

  async function reconcileEchoStatuses(connectionId: string, providerMessageId: string) {
    const events = await reconcileOutboundStatusEvents(prisma, { connectionId, providerMessageId });
    publishWhatsAppRealtime(events);
  }

  async function ingestRevision(
    parsed: ParsedWhapiWebhook,
    json: unknown,
    connectionId: string,
    receivedAt: Date,
  ) {
    if (!parsed.providerMessageId || parsed.action === "create") {
      await persistTrace(parsed, json, receivedAt, connectionId, "IGNORED", WhatsAppErrorReason.WEBHOOK_UNSUPPORTED_EVENT);
      return;
    }
    const eventRow = await ensureReceivedEvent(parsed, json, receivedAt, connectionId);
    if (!eventRow || eventRow.status === "PROCESSED" || eventRow.status === "IGNORED") return;
    const state = await applyWhapiMessageRevision(prisma, {
      connectionId,
      providerMessageId: parsed.providerMessageId,
      action: parsed.action,
      textBody: parsed.textBody,
      caption: parsed.caption,
      occurredAt: parsed.occurredAt,
      webhookEventId: eventRow.id,
    });
    if (state === "waiting" || state === "applied") await touchConnection(connectionId, receivedAt);
  }

  async function ingestStatus(
    parsed: ParsedWhapiWebhook,
    json: unknown,
    connectionId: string,
    receivedAt: Date,
  ) {
    const startedAt = Date.now();
    if (!parsed.providerMessageId || !parsed.status) {
      await persistTrace(
        parsed,
        json,
        receivedAt,
        connectionId,
        "IGNORED",
        WhatsAppErrorReason.WEBHOOK_UNSUPPORTED_EVENT,
      );
      return;
    }
    const eventRow = await ensureReceivedEvent(parsed, json, receivedAt, connectionId);
    if (!eventRow || eventRow.status === "PROCESSED" || eventRow.status === "IGNORED") return;
    try {
      // Delivery and read receipts update the message row only. They must not move lastMessageAt.
      const statusEvents = await withTransaction(prisma, async (tx) => {
        const applied = await applyOutboundProviderStatus(tx, {
          connectionId,
          providerMessageId: parsed.providerMessageId!,
          incoming: parsed.status!,
        });
        if (
          !applied.changed ||
          !applied.messageId ||
          !applied.conversationId ||
          !applied.providerStatus ||
          applied.providerStatus === "PENDING"
        ) {
          return [] as WhatsAppRealtimeEvent[];
        }
        const realtime = await writeWhatsAppRealtimeEvent(tx, {
          type: "whatsapp.message.provider_status_changed",
          dedupeKey: `whatsapp.message.provider_status_changed:${applied.messageId}:${applied.providerStatus}`,
          conversationId: applied.conversationId,
          messageId: applied.messageId,
          connectionId,
          providerStatus: applied.providerStatus,
        });
        return realtime ? [realtime] : [];
      });
      publishWhatsAppRealtime(statusEvents);
      await prisma.whatsAppWebhookEvent.update({
        where: { id: eventRow.id },
        data: { status: "PROCESSED", processedAt: new Date(), failureCode: null },
      });
      await touchConnection(connectionId, receivedAt);
      logWebhookStage(fastify.log, "status.published", startedAt, { messageType: parsed.status });
    } catch (err) {
      await prisma.whatsAppWebhookEvent.update({
        where: { id: eventRow.id },
        data: {
          status: "FAILED",
          processedAt: null,
          failureCode: "WHATSAPP_WEBHOOK_INTERNAL_FAILURE",
        },
      });
      throw err;
    }
  }

  async function recordBatchItemFailure(
    parsed: ParsedWhapiWebhook,
    json: unknown,
    connectionId: string,
    receivedAt: Date,
  ) {
    const existing = await prisma.whatsAppWebhookEvent.findUnique({
      where: { providerEventKey: parsed.providerEventKey },
      select: { id: true, status: true },
    });
    const disposition = webhookFailureDisposition(existing?.status ?? null);
    if (disposition === "leave") return;
    if (disposition === "insert") {
      await persistTrace(parsed, json, receivedAt, connectionId, "FAILED", "WHATSAPP_WEBHOOK_INTERNAL_FAILURE");
      return;
    }
    await prisma.whatsAppWebhookEvent.update({
      where: { id: existing!.id },
      data: {
        status: "FAILED",
        processedAt: null,
        failureCode: "WHATSAPP_WEBHOOK_INTERNAL_FAILURE",
      },
    });
  }

  async function persistTrace(
    parsed: ParsedWhapiWebhook,
    json: unknown,
    receivedAt: Date,
    connectionId: string | null,
    status: WhatsAppWebhookEventStatus,
    failureCode: string | null,
  ): Promise<"inserted" | "duplicate"> {
    const payload = sanitizeWebhookPayload(json) as Prisma.InputJsonValue;
    try {
      const inserted = await prisma.whatsAppWebhookEvent.createMany({
        data: [
          {
            provider: "WHAPI",
            providerEventKey: parsed.providerEventKey,
            eventType: parsed.eventType,
            payload,
            receivedAt,
            processedAt: new Date(),
            status,
            failureCode,
            connectionId,
            providerMessageId: parsed.providerMessageId,
            customerWaId: parsed.customerWaId,
            customerDisplayName: parsed.displayName,
            occurredAt: parsed.occurredAt,
            messageType: parsed.kind === "status" ? parsed.status : parsed.messageType,
            textBody: parsed.textBody,
          },
        ],
        skipDuplicates: true,
      });
      return inserted.count === 0 ? "duplicate" : "inserted";
    } catch (err) {
      if (isUniqueViolation(err)) return "duplicate";
      throw err;
    }
  }

  async function ensureReceivedEvent(
    parsed: ParsedWhapiWebhook,
    json: unknown,
    receivedAt: Date,
    connectionId: string,
  ) {
    const payload = sanitizeWebhookPayload(json) as Prisma.InputJsonValue;
    try {
      const row = await prisma.whatsAppWebhookEvent.create({
        data: {
          provider: "WHAPI",
          providerEventKey: parsed.providerEventKey,
          eventType: parsed.eventType,
          payload,
          receivedAt,
          status: "RECEIVED",
          connectionId,
          providerMessageId: parsed.providerMessageId,
          customerWaId: parsed.customerWaId,
          customerDisplayName: parsed.displayName,
          occurredAt: parsed.occurredAt,
          messageType: parsed.kind === "status" ? parsed.status : parsed.messageType,
          textBody: parsed.textBody,
        },
      });
      return row;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const existing = await prisma.whatsAppWebhookEvent.findUnique({
        where: { providerEventKey: parsed.providerEventKey },
      });
      if (existing && parsed.kind === "status" && parsed.status && existing.messageType !== parsed.status) {
        return prisma.whatsAppWebhookEvent.update({
          where: { id: existing.id },
          data: { messageType: parsed.status },
        });
      }
      return existing;
    }
  }

  async function touchConnection(connectionId: string, receivedAt: Date) {
    await prisma.whatsAppConnection.update({
      where: { id: connectionId },
      data: { lastWebhookAt: receivedAt },
    });
  }

  return { ingest };
}

/** A failed batch item stays retryable. A finished or ignored row is left alone. */
export function webhookFailureDisposition(
  status: "RECEIVED" | "PROCESSED" | "FAILED" | "IGNORED" | null,
): "insert" | "mark-failed" | "leave" {
  if (status === null) return "insert";
  if (status === "PROCESSED" || status === "IGNORED") return "leave";
  return "mark-failed";
}
