import type { FastifyInstance } from "fastify";
import type { Prisma, WhatsAppConnectionStatus, WhatsAppWebhookEventStatus } from "@prisma/client";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { withTransaction } from "src/lib/db/transaction";
import {
  WHATSAPP_CURRENT_STATUSES,
} from "src/modules/whatsapp/whatsapp.constants";
import { WhatsAppErrorReason } from "src/modules/whatsapp/whatsapp.errors";
import { whatsappWebhookSecrets } from "src/modules/whatsapp/whatsapp.config";
import {
  sha256Hex,
  verifyMetaHubSignature,
} from "src/modules/whatsapp/whatsapp.webhook-signature";
import { materializeInboundMessage } from "src/modules/whatsapp/whatsapp.inbound.service";
import { applyOutboundProviderStatus } from "src/modules/whatsapp/whatsapp.outbound-status";
import { writeWhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime-outbox";
import { publishWhatsAppRealtime } from "src/modules/whatsapp/whatsapp.realtime-publisher";
import type { WhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime";
import { mapWhatsAppProviderStatus } from "src/modules/whatsapp/whatsapp.message-type";
import { parseWhatsAppWebhookItems } from "src/modules/whatsapp/whatsapp.webhook-parse";
import type { ParsedWebhookItem } from "src/modules/whatsapp/whatsapp.webhook-parse";
import { sanitizeWebhookPayload } from "src/modules/whatsapp/whatsapp.webhook-sanitize";

const CURRENT_STATUSES: WhatsAppConnectionStatus[] = [...WHATSAPP_CURRENT_STATUSES];

export type WhatsAppWebhookHttpResult = {
  httpStatus: 200 | 400 | 403 | 500;
  code: string;
};

function parseJson(raw: Buffer): unknown | undefined {
  try {
    return JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function eventStatus(item: ParsedWebhookItem, routed: boolean): {
  status: WhatsAppWebhookEventStatus;
  failureCode: string | null;
} {
  if (item.failureCode === WhatsAppErrorReason.WEBHOOK_MALFORMED_PAYLOAD) {
    return { status: "FAILED", failureCode: item.failureCode };
  }
  if (!routed) {
    return {
      status: "IGNORED",
      failureCode: WhatsAppErrorReason.WEBHOOK_CONNECTION_NOT_FOUND,
    };
  }
  if (item.eventType === "UNKNOWN" || item.failureCode === WhatsAppErrorReason.WEBHOOK_UNSUPPORTED_EVENT) {
    return {
      status: "IGNORED",
      failureCode: item.failureCode ?? WhatsAppErrorReason.WEBHOOK_UNSUPPORTED_EVENT,
    };
  }
  return { status: "PROCESSED", failureCode: null };
}

export function createWhatsAppWebhookService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function ingestSignedPayload(rawBody: Buffer): Promise<WhatsAppWebhookHttpResult> {
    const receivedAt = new Date();
    const parsed = parseJson(rawBody);
    if (parsed === undefined || parsed === null || typeof parsed !== "object") {
      return { httpStatus: 400, code: WhatsAppErrorReason.WEBHOOK_MALFORMED_PAYLOAD };
    }

    const envelopeHash = sha256Hex(rawBody);
    const sanitized = sanitizeWebhookPayload(parsed) as Prisma.InputJsonValue;
    let items = parseWhatsAppWebhookItems(parsed, envelopeHash);
    if (items.length === 0) {
      items = [
        {
          eventType: "UNKNOWN",
          providerEventKey: `payload:${envelopeHash}`,
          wabaId: null,
          phoneNumberId: null,
          providerMessageId: null,
          customerWaId: null,
          customerDisplayName: null,
          occurredAt: null,
          messageType: null,
          textBody: null,
          providerMediaId: null,
          caption: null,
          mediaFilename: null,
          mediaMimeType: null,
          displayPayload: null,
          failureCode: WhatsAppErrorReason.WEBHOOK_UNSUPPORTED_EVENT,
        },
      ];
    }

    try {
      for (const item of items) {
        await persistItem(item, sanitized, receivedAt);
      }
    } catch (err) {
      fastify.log.error(
        { err, eventKey: items[0]?.providerEventKey ?? null },
        "whatsapp webhook persist failed",
      );
      return { httpStatus: 500, code: "WHATSAPP_WEBHOOK_INTERNAL_FAILURE" };
    }

    return { httpStatus: 200, code: "RECEIVED" };
  }

  async function persistItem(
    item: ParsedWebhookItem,
    payload: Prisma.InputJsonValue,
    receivedAt: Date,
  ) {
    const connection =
      item.wabaId && item.phoneNumberId
        ? await prisma.whatsAppConnection.findFirst({
            where: {
              wabaId: item.wabaId,
              phoneNumberId: item.phoneNumberId,
              status: { in: CURRENT_STATUSES },
            },
            select: { id: true, status: true },
          })
        : null;

    const routed = Boolean(connection);
    const { status, failureCode } = eventStatus(item, routed);
    const processedAt = new Date();

    const shouldMaterialize =
      item.eventType === "MESSAGE_RECEIVED" &&
      routed &&
      Boolean(connection) &&
      Boolean(item.providerMessageId) &&
      Boolean(item.customerWaId) &&
      status !== "FAILED" &&
      status !== "IGNORED";

    if (item.eventType === "MESSAGE_RECEIVED" && routed && !item.customerWaId) {
      await insertWebhookEvent(item, payload, receivedAt, processedAt, "FAILED", WhatsAppErrorReason.INBOUND_CUSTOMER_MISSING, connection?.id ?? null);
      if (connection) await touchConnection(connection.id, receivedAt);
      fastify.log.info(
        {
          provider: "META_CLOUD_API",
          eventKey: item.providerEventKey,
          connectionId: connection?.id ?? null,
          status: "FAILED",
          failureCode: WhatsAppErrorReason.INBOUND_CUSTOMER_MISSING,
        },
        "whatsapp webhook ingested",
      );
      return;
    }

    if (!shouldMaterialize) {
      const insertStatus = await insertWebhookEvent(
        item,
        payload,
        receivedAt,
        processedAt,
        status,
        failureCode,
        connection?.id ?? null,
      );
      if (insertStatus === "duplicate") return;
      if (connection && item.eventType === "MESSAGE_STATUS" && item.providerMessageId) {
        const mapped = mapWhatsAppProviderStatus(item.messageType);
        if (mapped) {
          const statusEvents = await withTransaction(prisma, async (tx) => {
            const applied = await applyOutboundProviderStatus(tx, {
              connectionId: connection.id,
              providerMessageId: item.providerMessageId!,
              incoming: mapped,
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
              connectionId: connection.id,
              providerStatus: applied.providerStatus,
            });
            return realtime ? [realtime] : [];
          });
          publishWhatsAppRealtime(statusEvents);
        }
      }
      if (connection) await touchConnection(connection.id, receivedAt);
      fastify.log.info(
        {
          provider: "META_CLOUD_API",
          eventKey: item.providerEventKey,
          connectionId: connection?.id ?? null,
          status,
          failureCode,
        },
        "whatsapp webhook ingested",
      );
      return;
    }

    const eventRow = await ensureReceivedEvent(
      item,
      payload,
      receivedAt,
      connection!.id,
    );
    if (!eventRow) return;
    if (eventRow.status === "PROCESSED") {
      fastify.log.info(
        {
          provider: "META_CLOUD_API",
          eventKey: item.providerEventKey,
          connectionId: connection!.id,
          status: "DUPLICATE",
        },
        "whatsapp webhook duplicate",
      );
      return;
    }

    try {
      const result = await materializeInboundMessage(prisma, {
        connectionId: connection!.id,
        customerWaId: item.customerWaId!,
        customerDisplayName: item.customerDisplayName,
        providerMessageId: item.providerMessageId!,
        messageType: item.messageType,
        textBody: item.textBody,
        providerMediaId: item.providerMediaId,
        caption: item.caption,
        mediaFilename: item.mediaFilename,
        mediaMimeType: item.mediaMimeType,
        displayPayload: item.displayPayload,
        providerOccurredAt: item.occurredAt,
        receivedAt,
        webhookEventId: eventRow.id,
      });
      await prisma.whatsAppWebhookEvent.update({
        where: { id: eventRow.id },
        data: { status: "PROCESSED", processedAt: new Date(), failureCode: null },
      });
      await touchConnection(connection!.id, receivedAt);
      fastify.log.info(
        {
          provider: "META_CLOUD_API",
          eventKey: item.providerEventKey,
          connectionId: connection!.id,
          conversationId: result.conversationId,
          messageId: result.messageId,
          status: "PROCESSED",
        },
        "whatsapp webhook ingested",
      );
    } catch (err) {
      await prisma.whatsAppWebhookEvent.update({
        where: { id: eventRow.id },
        data: {
          status: "FAILED",
          processedAt: null,
          failureCode: WhatsAppErrorReason.INBOUND_MATERIALIZATION_FAILED,
        },
      });
      fastify.log.error(
        {
          err,
          eventKey: item.providerEventKey,
          connectionId: connection!.id,
        },
        "whatsapp inbound materialization failed",
      );
      throw err;
    }
  }

  async function insertWebhookEvent(
    item: ParsedWebhookItem,
    payload: Prisma.InputJsonValue,
    receivedAt: Date,
    processedAt: Date,
    status: WhatsAppWebhookEventStatus,
    failureCode: string | null,
    connectionId: string | null,
  ): Promise<"inserted" | "duplicate"> {
    try {
      const inserted = await prisma.whatsAppWebhookEvent.createMany({
        data: [
          {
            provider: "META_CLOUD_API",
            providerEventKey: item.providerEventKey,
            wabaId: item.wabaId,
            phoneNumberId: item.phoneNumberId,
            eventType: item.eventType,
            payload,
            receivedAt,
            processedAt,
            status,
            failureCode,
            connectionId,
            providerMessageId: item.providerMessageId,
            customerWaId: item.customerWaId,
            customerDisplayName: item.customerDisplayName,
            occurredAt: item.occurredAt,
            messageType: item.messageType,
            textBody: item.textBody,
          },
        ],
        skipDuplicates: true,
      });
      if (inserted.count === 0) {
        fastify.log.info(
          {
            provider: "META_CLOUD_API",
            eventKey: item.providerEventKey,
            connectionId,
            status: "DUPLICATE",
          },
          "whatsapp webhook duplicate",
        );
        return "duplicate";
      }
      return "inserted";
    } catch (err) {
      if (isUniqueViolation(err)) {
        fastify.log.info(
          {
            provider: "META_CLOUD_API",
            eventKey: item.providerEventKey,
            connectionId,
            status: "DUPLICATE",
          },
          "whatsapp webhook duplicate",
        );
        return "duplicate";
      }
      throw err;
    }
  }

  async function ensureReceivedEvent(
    item: ParsedWebhookItem,
    payload: Prisma.InputJsonValue,
    receivedAt: Date,
    connectionId: string,
  ) {
    try {
      await prisma.whatsAppWebhookEvent.createMany({
        data: [
          {
            provider: "META_CLOUD_API",
            providerEventKey: item.providerEventKey,
            wabaId: item.wabaId,
            phoneNumberId: item.phoneNumberId,
            eventType: item.eventType,
            payload,
            receivedAt,
            processedAt: null,
            status: "RECEIVED",
            failureCode: null,
            connectionId,
            providerMessageId: item.providerMessageId,
            customerWaId: item.customerWaId,
            customerDisplayName: item.customerDisplayName,
            occurredAt: item.occurredAt,
            messageType: item.messageType,
            textBody: item.textBody,
          },
        ],
        skipDuplicates: true,
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    return prisma.whatsAppWebhookEvent.findUnique({
      where: { providerEventKey: item.providerEventKey },
      select: { id: true, status: true },
    });
  }

  async function touchConnection(connectionId: string, receivedAt: Date) {
    const events = await withTransaction(prisma, async (tx) => {
      const before = await tx.whatsAppConnection.findUnique({
        where: { id: connectionId },
        select: { webhookStatus: true },
      });
      await tx.whatsAppConnection.update({
        where: { id: connectionId },
        data: {
          lastWebhookAt: receivedAt,
          webhookStatus: "ACTIVE",
        },
      });
      if (!before || before.webhookStatus === "ACTIVE") return [] as WhatsAppRealtimeEvent[];
      const realtime = await writeWhatsAppRealtimeEvent(tx, {
        type: "whatsapp.connection.updated",
        dedupeKey: `whatsapp.connection.updated:${connectionId}:${before.webhookStatus}:ACTIVE`,
        connectionId,
      });
      return realtime ? [realtime] : [];
    });
    publishWhatsAppRealtime(events);
  }

  function verifySignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    const { appSecret } = whatsappWebhookSecrets();
    if (!appSecret) return false;
    return verifyMetaHubSignature(rawBody, signatureHeader, appSecret);
  }

  async function ingest(
    rawBody: Buffer,
    signatureHeader: string | undefined,
  ): Promise<WhatsAppWebhookHttpResult> {
    if (!verifySignature(rawBody, signatureHeader)) {
      return { httpStatus: 403, code: WhatsAppErrorReason.WEBHOOK_INVALID_SIGNATURE };
    }
    return ingestSignedPayload(rawBody);
  }

  return { ingest, verifySignature };
}

export type WhatsAppWebhookService = ReturnType<typeof createWhatsAppWebhookService>;
