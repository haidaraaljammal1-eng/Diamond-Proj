import type { FastifyInstance } from "fastify";
import type { Prisma, WhatsAppConnectionStatus, WhatsAppWebhookEventStatus } from "@prisma/client";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { withTransaction } from "src/lib/db/transaction";
import { env } from "src/config/env";
import { WHATSAPP_CURRENT_STATUSES } from "src/modules/whatsapp/whatsapp.constants";
import { WhatsAppErrorReason } from "src/modules/whatsapp/whatsapp.errors";
import { decryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { materializeInboundMessage } from "src/modules/whatsapp/whatsapp.inbound.service";
import { materializeOutboundEchoMessage } from "src/modules/whatsapp/whatsapp.outbound-echo.service";
import { applyOutboundProviderStatus } from "src/modules/whatsapp/whatsapp.outbound-status";
import { writeWhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime-outbox";
import { publishWhatsAppRealtime } from "src/modules/whatsapp/whatsapp.realtime-publisher";
import type { WhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime";
import { sanitizeWebhookPayload } from "src/modules/whatsapp/whatsapp.webhook-sanitize";
import { sha256Hex } from "src/modules/whatsapp/whatsapp.webhook-signature";
import { timingSafeCallbackKey } from "src/modules/whatsapp/ultramsg.webhook-parse";
import { parseWhapiWebhook, type ParsedWhapiWebhook } from "src/modules/whatsapp/whapi.webhook-parse";
import {
  timingSafeWhapiWebhookSecret,
  whapiChannelIdsMatch,
  WHAPI_WEBHOOK_MAX_BYTES,
} from "src/modules/whatsapp/whapi.config";
import type { WhatsAppWebhookHttpResult } from "src/modules/whatsapp/whatsapp.webhook.service";

const CURRENT_STATUSES: WhatsAppConnectionStatus[] = [...WHATSAPP_CURRENT_STATUSES];

function parseJson(raw: Buffer): unknown | undefined {
  try {
    return JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function expectedCallbackKeys(stored: string | null): string[] {
  const keys: string[] = [];
  const envKey = env.WHAPI_WEBHOOK_CALLBACK_KEY.trim();
  if (envKey) keys.push(envKey);
  if (stored) {
    try {
      const decrypted = decryptWhatsAppCredential(stored);
      if (decrypted && !keys.includes(decrypted)) keys.push(decrypted);
    } catch {
      /* ignore */
    }
  }
  return keys;
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

    const configuredSecret = env.WHAPI_WEBHOOK_SECRET.trim();
    if (!configuredSecret || !webhookSecret || !timingSafeWhapiWebhookSecret(configuredSecret, webhookSecret)) {
      return { httpStatus: 403, code: WhatsAppErrorReason.WEBHOOK_CALLBACK_INVALID };
    }

    const connection = await prisma.whatsAppConnection.findFirst({
      where: { provider: "WHAPI", status: { in: CURRENT_STATUSES } },
      select: {
        id: true,
        providerInstanceId: true,
        webhookCallbackCiphertext: true,
      },
    });
    const expected = expectedCallbackKeys(connection?.webhookCallbackCiphertext ?? null);
    const accepted = expected.some((key) => timingSafeCallbackKey(key, callbackKey));
    if (!accepted) {
      return { httpStatus: 403, code: WhatsAppErrorReason.WEBHOOK_CALLBACK_INVALID };
    }

    const parsedJson = parseJson(rawBody);
    if (parsedJson === undefined || parsedJson === null || typeof parsedJson !== "object") {
      return { httpStatus: 400, code: WhatsAppErrorReason.WEBHOOK_MALFORMED_PAYLOAD };
    }

    const envelopeHash = sha256Hex(rawBody);
    const parsed = parseWhapiWebhook(parsedJson, envelopeHash);
    const configuredChannel = connection?.providerInstanceId || env.WHAPI_CHANNEL_ID.trim();
    if (configuredChannel && !whapiChannelIdsMatch(configuredChannel, parsed.channelId)) {
      await persistTrace(parsed, parsedJson, new Date(), null, "IGNORED", WhatsAppErrorReason.WEBHOOK_CONNECTION_NOT_FOUND);
      return { httpStatus: 200, code: "RECEIVED" };
    }
    if (!connection) {
      await persistTrace(parsed, parsedJson, new Date(), null, "IGNORED", WhatsAppErrorReason.WEBHOOK_CONNECTION_NOT_FOUND);
      return { httpStatus: 200, code: "RECEIVED" };
    }

    try {
      await persistParsed(parsed, parsedJson, connection.id, new Date());
    } catch (err) {
      fastify.log.error({ err, eventKey: parsed.providerEventKey }, "whapi webhook persist failed");
      return { httpStatus: 500, code: "WHATSAPP_WEBHOOK_INTERNAL_FAILURE" };
    }
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
      await materializeInboundMessage(prisma, {
        connectionId,
        customerWaId: parsed.customerWaId,
        providerChatId: parsed.chatId,
        customerDisplayName: parsed.displayName,
        providerMessageId: parsed.providerMessageId,
        messageType: parsed.messageType,
        textBody: parsed.textBody,
        providerMediaId: null,
        caption: parsed.caption,
        mediaFilename: parsed.mediaFilename,
        mediaMimeType: null,
        displayPayload: parsed.source ? { source: parsed.source } : null,
        providerOccurredAt: parsed.occurredAt,
        receivedAt,
        webhookEventId: eventRow.id,
      });
      await prisma.whatsAppWebhookEvent.update({
        where: { id: eventRow.id },
        data: { status: "PROCESSED", processedAt: new Date(), failureCode: null },
      });
      await touchConnection(connectionId, receivedAt);
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
        orderBy: { createdAt: "desc" },
        take: 2,
        select: { id: true },
      });
      if (candidates.length === 1) {
        await prisma.whatsAppMessage.update({
          where: { id: candidates[0]!.id },
          data: { providerMessageId: parsed.providerMessageId },
        });
        await persistTrace(parsed, json, receivedAt, connectionId, "PROCESSED", null);
        await touchConnection(connectionId, receivedAt);
        return;
      }
    }

    const eventRow = await ensureReceivedEvent(parsed, json, receivedAt, connectionId);
    if (!eventRow || eventRow.status === "PROCESSED") return;
    await materializeOutboundEchoMessage(prisma, {
      connectionId,
      customerWaId: parsed.customerWaId,
      providerChatId: parsed.chatId,
      providerMessageId: parsed.providerMessageId,
      messageType: parsed.messageType,
      textBody: parsed.textBody,
      caption: parsed.caption,
      mediaFilename: parsed.mediaFilename,
      providerOccurredAt: parsed.occurredAt,
      receivedAt,
      webhookEventId: eventRow.id,
      source: parsed.source,
    });
    await touchConnection(connectionId, receivedAt);
  }

  async function ingestStatus(
    parsed: ParsedWhapiWebhook,
    json: unknown,
    connectionId: string,
    receivedAt: Date,
  ) {
    const insert = await persistTrace(
      parsed,
      json,
      receivedAt,
      connectionId,
      parsed.status ? "PROCESSED" : "IGNORED",
      parsed.status ? null : WhatsAppErrorReason.WEBHOOK_UNSUPPORTED_EVENT,
    );
    if (insert === "duplicate") return;
    if (parsed.providerMessageId && parsed.status) {
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
    }
    await touchConnection(connectionId, receivedAt);
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
          messageType: parsed.messageType,
          textBody: parsed.textBody,
        },
      });
      return row;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      return prisma.whatsAppWebhookEvent.findUnique({
        where: { providerEventKey: parsed.providerEventKey },
      });
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
