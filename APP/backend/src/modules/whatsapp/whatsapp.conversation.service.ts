import type { FastifyInstance } from "fastify";
import type { Prisma, WhatsAppConnectionStatus } from "@prisma/client";
import { paginate } from "src/lib/http/pagination";
import { withTransaction } from "src/lib/db/transaction";
import type { AuditContext } from "src/types/fastify";
import { PERMISSIONS } from "src/constants/permissions";
import { hasPermission, type AuthUser } from "src/lib/context/auth-context";
import { assertCustomerVisible } from "src/modules/customers/customer-scope";
import { WHATSAPP_AUDIT, WHATSAPP_CURRENT_STATUSES } from "src/modules/whatsapp/whatsapp.constants";
import { evaluateMessagingEligibility } from "src/modules/whatsapp/whatsapp.eligibility";
import { createWhatsAppProvider } from "src/modules/whatsapp/whatsapp.provider";
import { whatsappError } from "src/modules/whatsapp/whatsapp.errors";
import {
  providerContactIdForConversation,
  type ConversationPresentationRow,
} from "src/modules/whatsapp/whatsapp.conversation-presentation";
import {
  toConversationDetail,
  toConversationListItem,
  toMessageDto,
} from "src/modules/whatsapp/whatsapp.mapper";
import { writeWhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime-outbox";
import { publishWhatsAppRealtime } from "src/modules/whatsapp/whatsapp.realtime-publisher";
import { sendProviderReadReceiptsBestEffort } from "src/modules/whatsapp/whatsapp.provider-read-receipt";
import type {
  ListWhatsAppConversationsQuery,
  ListWhatsAppMessagesQuery,
  WhatsAppGroupContext,
} from "src/modules/whatsapp/whatsapp.schema";
import { sanitizeGroupParticipants } from "src/modules/whatsapp/whatsapp.group-display";

type AuditWrite = (partial: Partial<AuditContext>) => void;

const CONVERSATION_LIST_SELECT = {
  id: true,
  connectionId: true,
  kind: true,
  customerWaId: true,
  providerChatId: true,
  customerDisplayName: true,
  lastMessagePreview: true,
  lastMessageType: true,
  lastMessageAt: true,
  unreadCount: true,
  lastInboundAt: true,
  lastReadAt: true,
  createdAt: true,
  customerId: true,
  customer: { select: { name: true } },
  connection: { select: { displayPhoneNumber: true, verifiedName: true } },
} as const;

const CONVERSATION_DETAIL_SELECT = {
  ...CONVERSATION_LIST_SELECT,
  customerLinkedAt: true,
  customer: { select: { id: true, name: true, mobile: true, externalId: true } },
  connection: {
    select: {
      displayPhoneNumber: true,
      verifiedName: true,
      id: true,
      status: true,
      webhookStatus: true,
      credentialCiphertext: true,
    },
  },
} as const;

const MESSAGE_SELECT = {
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

const CURRENT_STATUSES: WhatsAppConnectionStatus[] = [...WHATSAPP_CURRENT_STATUSES];

async function loadAvatarFlags(
  prisma: FastifyInstance["prisma"],
  rows: ConversationPresentationRow[],
): Promise<Map<string, boolean>> {
  const byConnection = new Map<string, Set<string>>();
  const groupIds = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.kind === "GROUP") {
      const contactId = providerContactIdForConversation(row);
      if (!contactId) continue;
      const set = groupIds.get(row.connectionId) ?? new Set<string>();
      set.add(contactId);
      groupIds.set(row.connectionId, set);
      continue;
    }
    const contactId = providerContactIdForConversation(row);
    if (!contactId) continue;
    const set = byConnection.get(row.connectionId) ?? new Set<string>();
    set.add(contactId);
    byConnection.set(row.connectionId, set);
  }
  const flags = new Map<string, boolean>();
  for (const [connectionId, contactIds] of byConnection) {
    const profiles = await prisma.whatsAppContactProfile.findMany({
      where: {
        connectionId,
        providerContactId: { in: [...contactIds] },
        hasProfilePicture: true,
      },
      select: { providerContactId: true },
    });
    for (const profile of profiles) {
      flags.set(profile.providerContactId, true);
    }
  }
  for (const [connectionId, ids] of groupIds) {
    const profiles = await prisma.whatsAppGroupProfile.findMany({
      where: { connectionId, providerGroupId: { in: [...ids] }, hasIcon: true },
      select: { providerGroupId: true },
    });
    for (const profile of profiles) {
      flags.set(profile.providerGroupId, true);
    }
  }
  return flags;
}

export function createWhatsAppConversationService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function list(query: ListWhatsAppConversationsQuery) {
    const where: Prisma.WhatsAppConversationWhereInput = {
      connection: { status: { in: CURRENT_STATUSES } },
    };
    if (query.unread === "true") where.unreadCount = { gt: 0 };
    if (query.search) {
      where.OR = [
        { customerWaId: { contains: query.search, mode: "insensitive" } },
        { customerDisplayName: { contains: query.search, mode: "insensitive" } },
        { lastMessagePreview: { contains: query.search, mode: "insensitive" } },
      ];
    }
    const result = await paginate({
      page: query.page,
      pageSize: query.pageSize,
      count: () => prisma.whatsAppConversation.count({ where }),
      findMany: (skip, take) =>
        prisma.whatsAppConversation.findMany({
          where,
          select: CONVERSATION_LIST_SELECT,
          orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
          skip,
          take,
        }),
    });
    const avatarByContactId = await loadAvatarFlags(prisma, result.data);
    return {
      data: result.data.map((row) => toConversationListItem(row, avatarByContactId)),
      meta: result.meta,
    };
  }

  async function messagingEligibility(conversation: {
    connectionId: string;
    lastInboundAt: Date | null;
    connection: { credentialCiphertext: string | null };
  }) {
    const current = await prisma.whatsAppConnection.findFirst({
      where: { status: { in: CURRENT_STATUSES } },
      select: {
        id: true,
        status: true,
        webhookStatus: true,
        credentialCiphertext: true,
        providerSessionStatus: true,
      },
    });
    const provider = createWhatsAppProvider();
    return evaluateMessagingEligibility({
      conversationConnectionId: conversation.connectionId,
      lastInboundAt: conversation.lastInboundAt,
      currentConnection: current
        ? {
            id: current.id,
            status: current.status,
            webhookStatus: current.webhookStatus,
            hasCredential: Boolean(current.credentialCiphertext),
            providerSessionStatus: current.providerSessionStatus,
          }
        : null,
      providerConfigured: provider.configured,
      capabilities: provider.capabilities(),
      now: new Date(),
    });
  }

  async function canExposeLinkedCustomer(
    auth: AuthUser | null | undefined,
    customerId: number | null | undefined,
  ): Promise<boolean> {
    if (!auth || !customerId || !hasPermission(auth, PERMISSIONS.CUSTOMERS_READ)) return false;
    try {
      await assertCustomerVisible(prisma, customerId, auth);
      return true;
    } catch {
      return false;
    }
  }

  async function getById(id: string, auth?: AuthUser | null) {
    const row = await prisma.whatsAppConversation.findUnique({
      where: { id },
      select: CONVERSATION_DETAIL_SELECT,
    });
    if (!row) throw whatsappError.conversationNotFound();
    const avatarByContactId = await loadAvatarFlags(prisma, [row]);
    const listItem = toConversationListItem(row, avatarByContactId);
    return toConversationDetail(
      row,
      await messagingEligibility(row),
      await canExposeLinkedCustomer(auth, row.customerId),
      listItem.displayTitle,
      listItem.hasAvatar,
    );
  }

  async function listMessages(conversationId: string, query: ListWhatsAppMessagesQuery) {
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    });
    if (!conversation) throw whatsappError.conversationNotFound();
    const result = await paginate({
      page: query.page,
      pageSize: query.pageSize,
      count: () => prisma.whatsAppMessage.count({ where: { conversationId } }),
      findMany: (skip, take) =>
        prisma.whatsAppMessage.findMany({
          where: { conversationId },
          select: MESSAGE_SELECT,
          orderBy: [
            { providerOccurredAt: { sort: "desc", nulls: "last" } },
            { createdAt: "desc" },
            { id: "desc" },
          ],
          skip,
          take,
        }),
    });
    return { data: result.data.map(toMessageDto), meta: result.meta };
  }

  async function getGroupContext(conversationId: string): Promise<WhatsAppGroupContext> {
    const row = await prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      select: { kind: true, connectionId: true, customerDisplayName: true, providerChatId: true, customerWaId: true },
    });
    if (!row || row.kind !== "GROUP") throw whatsappError.conversationNotFound();
    const groupId = row.providerChatId?.trim() || row.customerWaId.trim();
    if (!groupId) throw whatsappError.conversationNotFound();
    const profile = await prisma.whatsAppGroupProfile.findUnique({
      where: { connectionId_providerGroupId: { connectionId: row.connectionId, providerGroupId: groupId } },
      select: { groupName: true, participantCount: true, participants: true },
    });
    const participants = sanitizeGroupParticipants(profile?.participants ?? []);
    return {
      groupName: profile?.groupName ?? row.customerDisplayName,
      participantCount: profile?.participantCount ?? participants.length,
      participants,
    };
  }

  async function markRead(conversationId: string, userId: number, audit: AuditWrite, auth?: AuthUser | null) {
    const result = await withTransaction(prisma, async (tx) => {
      const existing = await tx.whatsAppConversation.findUnique({
        where: { id: conversationId },
        select: { id: true, unreadCount: true, connectionId: true, lastReadAt: true },
      });
      if (!existing) throw whatsappError.conversationNotFound();
      const updated = await tx.whatsAppConversation.update({
        where: { id: conversationId },
        data: {
          unreadCount: 0,
          lastReadAt: new Date(),
          lastReadByUserId: userId,
        },
        select: CONVERSATION_DETAIL_SELECT,
      });
      const events =
        existing.unreadCount > 0
          ? await writeWhatsAppRealtimeEvent(tx, {
              type: "whatsapp.conversation.read",
              dedupeKey: `whatsapp.conversation.read:${conversationId}:${updated.lastReadAt?.toISOString() ?? "now"}`,
              conversationId,
              connectionId: existing.connectionId,
            }).then((event) => (event ? [event] : []))
          : [];
      return { updated, events, previousUnreadCount: existing.unreadCount, readBeforeAt: existing.lastReadAt };
    });
    publishWhatsAppRealtime(result.events);
    void sendProviderReadReceiptsBestEffort(prisma, {
      conversationId,
      connectionId: result.updated.connectionId,
      previousUnreadCount: result.previousUnreadCount,
      readBeforeAt: result.readBeforeAt,
    });
    audit({
      action: WHATSAPP_AUDIT.CONVERSATION_READ,
      entityType: "WhatsAppConversation",
      entityId: conversationId,
      metadata: { conversationId },
    });
    const avatarByContactId = await loadAvatarFlags(prisma, [result.updated]);
    const listItem = toConversationListItem(result.updated, avatarByContactId);
    return toConversationDetail(
      result.updated,
      await messagingEligibility(result.updated),
      await canExposeLinkedCustomer(auth, result.updated.customerId),
      listItem.displayTitle,
      listItem.hasAvatar,
    );
  }

  return { list, getById, listMessages, markRead, getGroupContext };
}

export type WhatsAppConversationService = ReturnType<typeof createWhatsAppConversationService>;
