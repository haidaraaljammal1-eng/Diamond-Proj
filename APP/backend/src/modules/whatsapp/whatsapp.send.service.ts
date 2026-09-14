import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { WhatsAppConnectionStatus, WhatsAppMessageSendState } from "@prisma/client";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { withTransaction } from "src/lib/db/transaction";
import { fingerprintIdempotentPayload } from "src/lib/db/idempotency";
import type { AuditContext } from "src/types/fastify";
import {
  WHATSAPP_AUDIT,
  WHATSAPP_CONVERSATION_LOCK_NS,
  WHATSAPP_CURRENT_STATUSES,
} from "src/modules/whatsapp/whatsapp.constants";
import { decryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import {
  evaluateMessagingEligibility,
  type WhatsAppMessagingEligibility,
} from "src/modules/whatsapp/whatsapp.eligibility";
import { whatsappError } from "src/modules/whatsapp/whatsapp.errors";
import { buildMessagePreview, isNewerConversationMessage } from "src/modules/whatsapp/whatsapp.message-type";
import { createWhatsAppProvider } from "src/modules/whatsapp/whatsapp.provider";
import { reconcileOutboundStatusEvents } from "src/modules/whatsapp/whatsapp.outbound-status";
import { assertOutboundText } from "src/modules/whatsapp/whatsapp.text";
import {
  assertTemplateParameters,
  buildTemplateSendComponents,
  renderTemplatePreview,
} from "src/modules/whatsapp/whatsapp.templates";
import {
  hashMediaBytes,
  normalizeMediaCaption,
  sanitizeMediaFilename,
  validateOutboundMedia,
} from "src/modules/whatsapp/whatsapp.media";
import { toConversationDetail, toMessageDto } from "src/modules/whatsapp/whatsapp.mapper";
import { writeWhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime-outbox";
import { publishWhatsAppRealtime } from "src/modules/whatsapp/whatsapp.realtime-publisher";
import type { WhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime";

type AuditWrite = (partial: Partial<AuditContext>) => void;

const CURRENT_STATUSES: WhatsAppConnectionStatus[] = [...WHATSAPP_CURRENT_STATUSES];

const CONVERSATION_DETAIL_SELECT = {
  id: true,
  customerWaId: true,
  customerDisplayName: true,
  lastMessagePreview: true,
  lastMessageType: true,
  lastMessageAt: true,
  lastMessageId: true,
  unreadCount: true,
  lastInboundAt: true,
  lastReadAt: true,
  createdAt: true,
  connectionId: true,
  customerId: true,
  customerLinkedAt: true,
  customer: { select: { id: true, name: true, mobile: true, externalId: true } },
  connection: {
    select: {
      id: true,
      status: true,
      webhookStatus: true,
      displayPhoneNumber: true,
      verifiedName: true,
      credentialCiphertext: true,
      phoneNumberId: true,
      wabaId: true,
    },
  },
} as const;

const MESSAGE_DTO_SELECT = {
  id: true,
  direction: true,
  messageType: true,
  textBody: true,
  caption: true,
  mediaFilename: true,
  mediaMimeType: true,
  mediaSizeBytes: true,
  providerMediaId: true,
  templateName: true,
  templateLanguage: true,
  templatePreview: true,
  displayPayload: true,
  providerOccurredAt: true,
  receivedAt: true,
  providerStatus: true,
  sendState: true,
} as const;

function hashIdempotencyKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function requireIdempotencyKey(raw: string | undefined): string {
  const key = raw?.trim() ?? "";
  if (key.length < 8 || key.length > 128) throw whatsappError.idempotencyKeyRequired();
  return key;
}

function throwIfCannotSend(
  eligibility: WhatsAppMessagingEligibility,
  mode: "freeform" | "template",
): void {
  if (mode === "freeform" && eligibility.canSendText) return;
  if (mode === "template" && eligibility.canSendTemplate) return;
  throwForEligibility(eligibility.reason);
}

function throwForEligibility(reason: WhatsAppMessagingEligibility["reason"]): never {
  switch (reason) {
    case "PROVIDER_NOT_CONFIGURED":
      throw whatsappError.providerNotConfigured();
    case "NO_ACTIVE_CONNECTION":
    case "CONNECTION_INACTIVE":
      throw whatsappError.conversationConnectionInactive();
    case "WEBHOOK_NOT_ACTIVE":
      throw whatsappError.webhookNotActive();
    case "CUSTOMER_SERVICE_WINDOW_CLOSED":
      throw whatsappError.customerServiceWindowClosed();
    case "CUSTOMER_SERVICE_WINDOW_UNKNOWN":
      throw whatsappError.customerServiceWindowUnknown();
    default:
      throw whatsappError.conversationConnectionInactive();
  }
}

export function createWhatsAppSendService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function currentOfficeConnection() {
    return prisma.whatsAppConnection.findFirst({
      where: { status: { in: CURRENT_STATUSES } },
      select: {
        id: true,
        status: true,
        webhookStatus: true,
        credentialCiphertext: true,
        phoneNumberId: true,
        wabaId: true,
      },
    });
  }

  async function eligibilityForConversation(conversation: {
    connectionId: string;
    lastInboundAt: Date | null;
    connection: { credentialCiphertext: string | null };
  }): Promise<WhatsAppMessagingEligibility> {
    const current = await currentOfficeConnection();
    return evaluateMessagingEligibility({
      conversationConnectionId: conversation.connectionId,
      lastInboundAt: conversation.lastInboundAt,
      currentConnection: current
        ? {
            id: current.id,
            status: current.status,
            webhookStatus: current.webhookStatus,
            hasCredential: Boolean(current.credentialCiphertext),
          }
        : null,
      providerConfigured: createWhatsAppProvider().configured,
      now: new Date(),
    });
  }

  async function sendText(params: {
    conversationId: string;
    text: string;
    actorUserId: number;
    idempotencyKey: string | undefined;
    audit: AuditWrite;
  }) {
    const text = assertOutboundText(params.text);
    const idempotencyKey = requireIdempotencyKey(params.idempotencyKey);
    const keyHash = hashIdempotencyKey(idempotencyKey);
    const fingerprint = fingerprintIdempotentPayload({
      actorUserId: params.actorUserId,
      conversationId: params.conversationId,
      text,
    });

    const reserved = await withTransaction(prisma, async (tx) => {
      const conversation = await tx.whatsAppConversation.findUnique({
        where: { id: params.conversationId },
        select: CONVERSATION_DETAIL_SELECT,
      });
      if (!conversation) throw whatsappError.conversationNotFound();

      await acquireAdvisoryLock(tx, WHATSAPP_CONVERSATION_LOCK_NS, conversation.id);

      const current = await tx.whatsAppConnection.findFirst({
        where: { status: { in: CURRENT_STATUSES } },
        select: {
          id: true,
          status: true,
          webhookStatus: true,
          credentialCiphertext: true,
          phoneNumberId: true,
        },
      });
      const eligibility = evaluateMessagingEligibility({
        conversationConnectionId: conversation.connectionId,
        lastInboundAt: conversation.lastInboundAt,
        currentConnection: current
          ? {
              id: current.id,
              status: current.status,
              webhookStatus: current.webhookStatus,
              hasCredential: Boolean(current.credentialCiphertext),
            }
          : null,
        providerConfigured: createWhatsAppProvider().configured,
        now: new Date(),
      });
      if (!eligibility.canSendText) throwIfCannotSend(eligibility, "freeform");
      if (!current?.phoneNumberId || !current.credentialCiphertext) {
        throw whatsappError.conversationConnectionInactive();
      }

      const existing = await tx.whatsAppOutboundAttempt.findUnique({
        where: {
          actorUserId_idempotencyKeyHash: {
            actorUserId: params.actorUserId,
            idempotencyKeyHash: keyHash,
          },
        },
      });
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) throw whatsappError.idempotencyKeyReused();
        return { kind: "existing" as const, messageId: existing.messageId };
      }

      const submittedAt = new Date();
      const messageId = randomUUID();
      try {
        await tx.whatsAppMessage.create({
          data: {
            id: messageId,
            conversationId: conversation.id,
            connectionId: conversation.connectionId,
            direction: "OUTBOUND",
            messageType: "TEXT",
            textBody: text,
            providerMessageId: null,
            providerOccurredAt: null,
            receivedAt: submittedAt,
            providerStatus: null,
            sentByUserId: params.actorUserId,
            sendState: "PENDING",
          },
        });
        await tx.whatsAppOutboundAttempt.create({
          data: {
            messageId,
            conversationId: conversation.id,
            connectionId: conversation.connectionId,
            actorUserId: params.actorUserId,
            idempotencyKeyHash: keyHash,
            requestFingerprint: fingerprint,
            state: "PENDING",
          },
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const raced = await tx.whatsAppOutboundAttempt.findUnique({
          where: {
            actorUserId_idempotencyKeyHash: {
              actorUserId: params.actorUserId,
              idempotencyKeyHash: keyHash,
            },
          },
        });
        if (!raced) throw err;
        if (raced.requestFingerprint !== fingerprint) throw whatsappError.idempotencyKeyReused();
        return { kind: "existing" as const, messageId: raced.messageId };
      }

      const currentLast = conversation.lastMessageId
        ? await tx.whatsAppMessage.findUnique({
            where: { id: conversation.lastMessageId },
            select: { id: true, createdAt: true, providerOccurredAt: true },
          })
        : null;
      const newer = isNewerConversationMessage(
        { occurredAt: submittedAt, createdAt: submittedAt, id: messageId },
        currentLast
          ? {
              occurredAt: currentLast.providerOccurredAt ?? currentLast.createdAt,
              createdAt: currentLast.createdAt,
              id: currentLast.id,
            }
          : null,
      );
      if (newer) {
        await tx.whatsAppConversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageId: messageId,
            lastMessageAt: submittedAt,
            lastMessagePreview: buildMessagePreview("TEXT", text),
            lastMessageType: "TEXT",
            lastOutboundAt: submittedAt,
          },
        });
      } else {
        await tx.whatsAppConversation.update({
          where: { id: conversation.id },
          data: { lastOutboundAt: submittedAt },
        });
      }

      const createdEvent = await writeWhatsAppRealtimeEvent(tx, {
        type: "whatsapp.message.outbound_created",
        dedupeKey: `whatsapp.message.outbound_created:${messageId}`,
        conversationId: conversation.id,
        messageId,
        connectionId: conversation.connectionId,
      });

      return {
        kind: "created" as const,
        messageId,
        connectionId: conversation.connectionId,
        phoneNumberId: current.phoneNumberId,
        credentialCiphertext: current.credentialCiphertext,
        customerWaId: conversation.customerWaId,
        events: createdEvent ? [createdEvent] : [],
      };
    });

    if (reserved.kind === "existing") {
      return loadSendResult(reserved.messageId, params.conversationId);
    }

    publishWhatsAppRealtime(reserved.events);

    params.audit({
      action: WHATSAPP_AUDIT.MESSAGE_SEND_ATTEMPTED,
      entityType: "WhatsAppMessage",
      entityId: reserved.messageId,
      metadata: {
        conversationId: params.conversationId,
        connectionId: reserved.connectionId,
        sendState: "PENDING",
      },
    });

    fastify.log.info(
      {
        messageId: reserved.messageId,
        conversationId: params.conversationId,
        connectionId: reserved.connectionId,
        sendState: "PENDING",
      },
      "whatsapp outbound send attempted",
    );

    const provider = createWhatsAppProvider();
    if (!provider.configured) {
      await completeAttempt(reserved.messageId, "FAILED", null, "WHATSAPP_PROVIDER_NOT_CONFIGURED");
      params.audit({
        action: WHATSAPP_AUDIT.MESSAGE_SEND_FAILED,
        entityType: "WhatsAppMessage",
        entityId: reserved.messageId,
        metadata: {
          conversationId: params.conversationId,
          connectionId: reserved.connectionId,
          sendState: "FAILED",
        },
      });
      return loadSendResult(reserved.messageId, params.conversationId);
    }

    let accessToken: string;
    try {
      accessToken = decryptWhatsAppCredential(reserved.credentialCiphertext);
    } catch {
      await completeAttempt(reserved.messageId, "FAILED", null, "WHATSAPP_SEND_AUTH_FAILED");
      params.audit({
        action: WHATSAPP_AUDIT.MESSAGE_SEND_FAILED,
        entityType: "WhatsAppMessage",
        entityId: reserved.messageId,
        metadata: {
          conversationId: params.conversationId,
          connectionId: reserved.connectionId,
          sendState: "FAILED",
        },
      });
      return loadSendResult(reserved.messageId, params.conversationId);
    }

    const sent = await provider.sendTextMessage({
      accessToken,
      phoneNumberId: reserved.phoneNumberId,
      toWaId: reserved.customerWaId,
      text,
    });

    if (!sent.ok) {
      const state: WhatsAppMessageSendState = sent.code === "SEND_UNKNOWN" ? "UNKNOWN" : "FAILED";
      await completeAttempt(reserved.messageId, state, null, sent.providerErrorCode ?? sent.code);
      params.audit({
        action: WHATSAPP_AUDIT.MESSAGE_SEND_FAILED,
        entityType: "WhatsAppMessage",
        entityId: reserved.messageId,
        metadata: {
          conversationId: params.conversationId,
          connectionId: reserved.connectionId,
          sendState: state,
        },
      });
      fastify.log.info(
        {
          messageId: reserved.messageId,
          conversationId: params.conversationId,
          connectionId: reserved.connectionId,
          sendState: state,
          providerErrorCode: sent.providerErrorCode ?? sent.code,
        },
        "whatsapp outbound send finished",
      );
      return loadSendResult(reserved.messageId, params.conversationId);
    }

    await completeAttempt(reserved.messageId, "ACCEPTED", sent.value.providerMessageId, null);
    const statusEvents = await reconcileOutboundStatusEvents(prisma, {
      connectionId: reserved.connectionId,
      providerMessageId: sent.value.providerMessageId,
    });
    publishWhatsAppRealtime(statusEvents);
    params.audit({
      action: WHATSAPP_AUDIT.MESSAGE_SEND_ACCEPTED,
      entityType: "WhatsAppMessage",
      entityId: reserved.messageId,
      metadata: {
        conversationId: params.conversationId,
        connectionId: reserved.connectionId,
        sendState: "ACCEPTED",
        providerMessageId: sent.value.providerMessageId,
      },
    });
    fastify.log.info(
      {
        messageId: reserved.messageId,
        conversationId: params.conversationId,
        connectionId: reserved.connectionId,
        sendState: "ACCEPTED",
        providerMessageId: sent.value.providerMessageId,
      },
      "whatsapp outbound send finished",
    );

    return loadSendResult(reserved.messageId, params.conversationId);
  }

  async function completeAttempt(
    messageId: string,
    state: WhatsAppMessageSendState,
    providerMessageId: string | null,
    safeProviderErrorCode: string | null,
  ) {
    const events = await withTransaction(prisma, async (tx) => {
      await tx.whatsAppOutboundAttempt.update({
        where: { messageId },
        data: {
          state,
          providerMessageId,
          safeProviderErrorCode,
          completedAt: new Date(),
        },
      });
      const message = await tx.whatsAppMessage.update({
        where: { id: messageId },
        data: {
          sendState: state,
          ...(providerMessageId ? { providerMessageId } : {}),
        },
        select: { id: true, conversationId: true, connectionId: true },
      });
      const sendState =
        state === "PENDING" || state === "ACCEPTED" || state === "FAILED" || state === "UNKNOWN"
          ? state
          : undefined;
      const realtime = await writeWhatsAppRealtimeEvent(tx, {
        type: "whatsapp.message.send_state_changed",
        dedupeKey: `whatsapp.message.send_state_changed:${message.id}:${state}`,
        conversationId: message.conversationId,
        messageId: message.id,
        connectionId: message.connectionId,
        sendState,
      });
      return realtime ? [realtime] : ([] as WhatsAppRealtimeEvent[]);
    });
    publishWhatsAppRealtime(events);
  }

  async function loadSendResult(messageId: string, conversationId: string) {
    const [message, conversation] = await Promise.all([
      prisma.whatsAppMessage.findUniqueOrThrow({
        where: { id: messageId },
        select: MESSAGE_DTO_SELECT,
      }),
      prisma.whatsAppConversation.findUniqueOrThrow({
        where: { id: conversationId },
        select: CONVERSATION_DETAIL_SELECT,
      }),
    ]);
    const eligibility = await eligibilityForConversation(conversation);
    return {
      message: toMessageDto(message),
      conversation: toConversationDetail(conversation, eligibility),
    };
  }

  async function sendTemplate(params: {
    conversationId: string;
    name: string;
    language: string;
    headerParameters: string[];
    bodyParameters: string[];
    actorUserId: number;
    idempotencyKey: string | undefined;
    audit: AuditWrite;
  }) {
    const idempotencyKey = requireIdempotencyKey(params.idempotencyKey);
    const keyHash = hashIdempotencyKey(idempotencyKey);
    const fingerprint = fingerprintIdempotentPayload({
      actorUserId: params.actorUserId,
      conversationId: params.conversationId,
      kind: "TEMPLATE",
      name: params.name,
      language: params.language,
      headerParameters: params.headerParameters,
      bodyParameters: params.bodyParameters,
    });

    const current = await currentOfficeConnection();
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id: params.conversationId },
      select: CONVERSATION_DETAIL_SELECT,
    });
    if (!conversation) throw whatsappError.conversationNotFound();
    const eligibility = evaluateMessagingEligibility({
      conversationConnectionId: conversation.connectionId,
      lastInboundAt: conversation.lastInboundAt,
      currentConnection: current
        ? {
            id: current.id,
            status: current.status,
            webhookStatus: current.webhookStatus,
            hasCredential: Boolean(current.credentialCiphertext),
          }
        : null,
      providerConfigured: createWhatsAppProvider().configured,
      now: new Date(),
    });
    throwIfCannotSend(eligibility, "template");
    if (!current?.phoneNumberId || !current.credentialCiphertext || !current.wabaId) {
      throw whatsappError.conversationConnectionInactive();
    }

    const provider = createWhatsAppProvider();
    let accessToken: string;
    try {
      accessToken = decryptWhatsAppCredential(current.credentialCiphertext);
    } catch {
      throw whatsappError.sendAuthFailed();
    }
    const listed = await provider.listMessageTemplates(accessToken, current.wabaId);
    if (!listed.ok) {
      if (listed.code === "NOT_CONFIGURED") throw whatsappError.providerNotConfigured();
      throw whatsappError.templateNotFound();
    }
    const template = listed.value.find(
      (item) => item.name === params.name && item.language === params.language,
    );
    if (!template) throw whatsappError.templateNotFound();
    if (!template.sendable) throw whatsappError.templateNotApproved();
    try {
      assertTemplateParameters(template, params.headerParameters, params.bodyParameters);
    } catch {
      throw whatsappError.templateParametersInvalid();
    }
    const components = buildTemplateSendComponents({
      template,
      headerParameters: params.headerParameters,
      bodyParameters: params.bodyParameters,
    });
    const preview = renderTemplatePreview(
      template.bodyText,
      template.headerText,
      template.footerText,
      params.headerParameters,
      params.bodyParameters,
    );

    const reserved = await withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, WHATSAPP_CONVERSATION_LOCK_NS, conversation.id);
      const existing = await tx.whatsAppOutboundAttempt.findUnique({
        where: {
          actorUserId_idempotencyKeyHash: {
            actorUserId: params.actorUserId,
            idempotencyKeyHash: keyHash,
          },
        },
      });
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) throw whatsappError.idempotencyKeyReused();
        return { kind: "existing" as const, messageId: existing.messageId };
      }
      const submittedAt = new Date();
      const messageId = randomUUID();
      try {
        await tx.whatsAppMessage.create({
          data: {
            id: messageId,
            conversationId: conversation.id,
            connectionId: conversation.connectionId,
            direction: "OUTBOUND",
            messageType: "TEMPLATE",
            textBody: preview || null,
            templateName: template.name,
            templateLanguage: template.language,
            templatePreview: preview || null,
            providerMessageId: null,
            providerOccurredAt: null,
            receivedAt: submittedAt,
            providerStatus: null,
            sentByUserId: params.actorUserId,
            sendState: "PENDING",
          },
        });
        await tx.whatsAppOutboundAttempt.create({
          data: {
            messageId,
            conversationId: conversation.id,
            connectionId: conversation.connectionId,
            actorUserId: params.actorUserId,
            idempotencyKeyHash: keyHash,
            requestFingerprint: fingerprint,
            state: "PENDING",
          },
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const raced = await tx.whatsAppOutboundAttempt.findUnique({
          where: {
            actorUserId_idempotencyKeyHash: {
              actorUserId: params.actorUserId,
              idempotencyKeyHash: keyHash,
            },
          },
        });
        if (!raced) throw err;
        if (raced.requestFingerprint !== fingerprint) throw whatsappError.idempotencyKeyReused();
        return { kind: "existing" as const, messageId: raced.messageId };
      }
      const currentLast = conversation.lastMessageId
        ? await tx.whatsAppMessage.findUnique({
            where: { id: conversation.lastMessageId },
            select: { id: true, createdAt: true, providerOccurredAt: true },
          })
        : null;
      const newer = isNewerConversationMessage(
        { occurredAt: submittedAt, createdAt: submittedAt, id: messageId },
        currentLast
          ? {
              occurredAt: currentLast.providerOccurredAt ?? currentLast.createdAt,
              createdAt: currentLast.createdAt,
              id: currentLast.id,
            }
          : null,
      );
      if (newer) {
        await tx.whatsAppConversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageId: messageId,
            lastMessageAt: submittedAt,
            lastMessagePreview: buildMessagePreview("TEMPLATE", null, { templatePreview: preview }),
            lastMessageType: "TEMPLATE",
            lastOutboundAt: submittedAt,
          },
        });
      } else {
        await tx.whatsAppConversation.update({
          where: { id: conversation.id },
          data: { lastOutboundAt: submittedAt },
        });
      }
      const createdEvent = await writeWhatsAppRealtimeEvent(tx, {
        type: "whatsapp.message.outbound_created",
        dedupeKey: `whatsapp.message.outbound_created:${messageId}`,
        conversationId: conversation.id,
        messageId,
        connectionId: conversation.connectionId,
      });
      return {
        kind: "created" as const,
        messageId,
        events: createdEvent ? [createdEvent] : [],
      };
    });

    if (reserved.kind === "existing") {
      return loadSendResult(reserved.messageId, params.conversationId);
    }
    publishWhatsAppRealtime(reserved.events);
    params.audit({
      action: WHATSAPP_AUDIT.MESSAGE_SEND_ATTEMPTED,
      entityType: "WhatsAppMessage",
      entityId: reserved.messageId,
      metadata: { conversationId: params.conversationId, sendState: "PENDING" },
    });

    const sent = await provider.sendTemplateMessage({
      accessToken,
      phoneNumberId: current.phoneNumberId,
      toWaId: conversation.customerWaId,
      name: template.name,
      language: template.language,
      components,
    });
    if (!sent.ok) {
      const state: WhatsAppMessageSendState = sent.code === "SEND_UNKNOWN" ? "UNKNOWN" : "FAILED";
      await completeAttempt(reserved.messageId, state, null, sent.providerErrorCode ?? sent.code);
      params.audit({
        action: WHATSAPP_AUDIT.MESSAGE_SEND_FAILED,
        entityType: "WhatsAppMessage",
        entityId: reserved.messageId,
        metadata: { conversationId: params.conversationId, sendState: state },
      });
      return loadSendResult(reserved.messageId, params.conversationId);
    }
    await completeAttempt(reserved.messageId, "ACCEPTED", sent.value.providerMessageId, null);
    const statusEvents = await reconcileOutboundStatusEvents(prisma, {
      connectionId: conversation.connectionId,
      providerMessageId: sent.value.providerMessageId,
    });
    publishWhatsAppRealtime(statusEvents);
    params.audit({
      action: WHATSAPP_AUDIT.MESSAGE_SEND_ACCEPTED,
      entityType: "WhatsAppMessage",
      entityId: reserved.messageId,
      metadata: {
        conversationId: params.conversationId,
        sendState: "ACCEPTED",
        providerMessageId: sent.value.providerMessageId,
      },
    });
    return loadSendResult(reserved.messageId, params.conversationId);
  }

  async function sendMedia(params: {
    conversationId: string;
    bytes: Buffer;
    declaredMime: string;
    filename: string;
    requestedKind: string;
    caption: string | null;
    actorUserId: number;
    idempotencyKey: string | undefined;
    audit: AuditWrite;
  }) {
    const validated = validateOutboundMedia({
      bytes: params.bytes,
      declaredMime: params.declaredMime,
      requestedKind: params.requestedKind,
    });
    const caption = normalizeMediaCaption(validated.kind, params.caption);
    const filename = sanitizeMediaFilename(params.filename);
    const contentHash = hashMediaBytes(params.bytes);
    const idempotencyKey = requireIdempotencyKey(params.idempotencyKey);
    const keyHash = hashIdempotencyKey(idempotencyKey);
    const fingerprint = fingerprintIdempotentPayload({
      actorUserId: params.actorUserId,
      conversationId: params.conversationId,
      kind: validated.kind,
      contentHash,
      caption,
    });

    const reserved = await withTransaction(prisma, async (tx) => {
      const conversation = await tx.whatsAppConversation.findUnique({
        where: { id: params.conversationId },
        select: CONVERSATION_DETAIL_SELECT,
      });
      if (!conversation) throw whatsappError.conversationNotFound();
      await acquireAdvisoryLock(tx, WHATSAPP_CONVERSATION_LOCK_NS, conversation.id);
      const current = await tx.whatsAppConnection.findFirst({
        where: { status: { in: CURRENT_STATUSES } },
        select: {
          id: true,
          status: true,
          webhookStatus: true,
          credentialCiphertext: true,
          phoneNumberId: true,
        },
      });
      const eligibility = evaluateMessagingEligibility({
        conversationConnectionId: conversation.connectionId,
        lastInboundAt: conversation.lastInboundAt,
        currentConnection: current
          ? {
              id: current.id,
              status: current.status,
              webhookStatus: current.webhookStatus,
              hasCredential: Boolean(current.credentialCiphertext),
            }
          : null,
        providerConfigured: createWhatsAppProvider().configured,
        now: new Date(),
      });
      throwIfCannotSend(eligibility, "freeform");
      if (!current?.phoneNumberId || !current.credentialCiphertext) {
        throw whatsappError.conversationConnectionInactive();
      }
      const existing = await tx.whatsAppOutboundAttempt.findUnique({
        where: {
          actorUserId_idempotencyKeyHash: {
            actorUserId: params.actorUserId,
            idempotencyKeyHash: keyHash,
          },
        },
      });
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) throw whatsappError.idempotencyKeyReused();
        return { kind: "existing" as const, messageId: existing.messageId };
      }
      const submittedAt = new Date();
      const messageId = randomUUID();
      try {
        await tx.whatsAppMessage.create({
          data: {
            id: messageId,
            conversationId: conversation.id,
            connectionId: conversation.connectionId,
            direction: "OUTBOUND",
            messageType: validated.kind,
            caption,
            mediaFilename: filename,
            mediaMimeType: validated.mimeType,
            mediaSizeBytes: params.bytes.length,
            providerMessageId: null,
            providerOccurredAt: null,
            receivedAt: submittedAt,
            providerStatus: null,
            sentByUserId: params.actorUserId,
            sendState: "PENDING",
          },
        });
        await tx.whatsAppOutboundAttempt.create({
          data: {
            messageId,
            conversationId: conversation.id,
            connectionId: conversation.connectionId,
            actorUserId: params.actorUserId,
            idempotencyKeyHash: keyHash,
            requestFingerprint: fingerprint,
            state: "PENDING",
          },
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const raced = await tx.whatsAppOutboundAttempt.findUnique({
          where: {
            actorUserId_idempotencyKeyHash: {
              actorUserId: params.actorUserId,
              idempotencyKeyHash: keyHash,
            },
          },
        });
        if (!raced) throw err;
        if (raced.requestFingerprint !== fingerprint) throw whatsappError.idempotencyKeyReused();
        return { kind: "existing" as const, messageId: raced.messageId };
      }
      const currentLast = conversation.lastMessageId
        ? await tx.whatsAppMessage.findUnique({
            where: { id: conversation.lastMessageId },
            select: { id: true, createdAt: true, providerOccurredAt: true },
          })
        : null;
      const newer = isNewerConversationMessage(
        { occurredAt: submittedAt, createdAt: submittedAt, id: messageId },
        currentLast
          ? {
              occurredAt: currentLast.providerOccurredAt ?? currentLast.createdAt,
              createdAt: currentLast.createdAt,
              id: currentLast.id,
            }
          : null,
      );
      await tx.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          lastOutboundAt: submittedAt,
          ...(newer
            ? {
                lastMessageId: messageId,
                lastMessageAt: submittedAt,
                lastMessagePreview: buildMessagePreview(validated.kind, null, { caption }),
                lastMessageType: validated.kind,
              }
            : {}),
        },
      });
      const createdEvent = await writeWhatsAppRealtimeEvent(tx, {
        type: "whatsapp.message.outbound_created",
        dedupeKey: `whatsapp.message.outbound_created:${messageId}`,
        conversationId: conversation.id,
        messageId,
        connectionId: conversation.connectionId,
      });
      return {
        kind: "created" as const,
        messageId,
        connectionId: conversation.connectionId,
        phoneNumberId: current.phoneNumberId,
        credentialCiphertext: current.credentialCiphertext,
        customerWaId: conversation.customerWaId,
        events: createdEvent ? [createdEvent] : [],
      };
    });

    if (reserved.kind === "existing") {
      return loadSendResult(reserved.messageId, params.conversationId);
    }
    publishWhatsAppRealtime(reserved.events);
    params.audit({
      action: WHATSAPP_AUDIT.MESSAGE_SEND_ATTEMPTED,
      entityType: "WhatsAppMessage",
      entityId: reserved.messageId,
      metadata: { conversationId: params.conversationId, sendState: "PENDING" },
    });

    const provider = createWhatsAppProvider();
    let accessToken: string;
    try {
      accessToken = decryptWhatsAppCredential(reserved.credentialCiphertext);
    } catch {
      await completeAttempt(reserved.messageId, "FAILED", null, "WHATSAPP_SEND_AUTH_FAILED");
      return loadSendResult(reserved.messageId, params.conversationId);
    }
    const uploaded = await provider.uploadMedia({
      accessToken,
      phoneNumberId: reserved.phoneNumberId,
      bytes: params.bytes,
      mimeType: validated.mimeType,
      filename,
    });
    if (!uploaded.ok) {
      const state: WhatsAppMessageSendState = uploaded.code === "SEND_UNKNOWN" ? "UNKNOWN" : "FAILED";
      await completeAttempt(reserved.messageId, state, null, uploaded.providerErrorCode ?? uploaded.code);
      return loadSendResult(reserved.messageId, params.conversationId);
    }
    const sent = await provider.sendMediaMessage({
      accessToken,
      phoneNumberId: reserved.phoneNumberId,
      toWaId: reserved.customerWaId,
      kind: validated.kind,
      mediaId: uploaded.value.mediaId,
      caption: caption ?? undefined,
    });
    if (!sent.ok) {
      const state: WhatsAppMessageSendState = sent.code === "SEND_UNKNOWN" ? "UNKNOWN" : "FAILED";
      await completeAttempt(reserved.messageId, state, null, sent.providerErrorCode ?? sent.code);
      params.audit({
        action: WHATSAPP_AUDIT.MESSAGE_SEND_FAILED,
        entityType: "WhatsAppMessage",
        entityId: reserved.messageId,
        metadata: { conversationId: params.conversationId, sendState: state },
      });
      return loadSendResult(reserved.messageId, params.conversationId);
    }
    await completeAttempt(reserved.messageId, "ACCEPTED", sent.value.providerMessageId, null);
    const statusEvents = await reconcileOutboundStatusEvents(prisma, {
      connectionId: reserved.connectionId,
      providerMessageId: sent.value.providerMessageId,
    });
    publishWhatsAppRealtime(statusEvents);
    params.audit({
      action: WHATSAPP_AUDIT.MESSAGE_SEND_ACCEPTED,
      entityType: "WhatsAppMessage",
      entityId: reserved.messageId,
      metadata: {
        conversationId: params.conversationId,
        sendState: "ACCEPTED",
        providerMessageId: sent.value.providerMessageId,
      },
    });
    return loadSendResult(reserved.messageId, params.conversationId);
  }

  return { sendText, sendTemplate, sendMedia, eligibilityForConversation };
}

export type WhatsAppSendService = ReturnType<typeof createWhatsAppSendService>;
