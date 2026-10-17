import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { WhapiClient } from "src/modules/whatsapp/providers/whapi.client";
import { createWhapiContactsClient, type WhapiContactsClient } from "src/modules/whatsapp/whapi.contacts.client";
import { parseWhapiContactRow } from "src/modules/whatsapp/whapi.contacts.parse";
import { whapiRuntimeConfig } from "src/modules/whatsapp/whapi.config";
import type { WhatsAppConnectionStatus } from "@prisma/client";
import { WHATSAPP_CURRENT_STATUSES } from "src/modules/whatsapp/whatsapp.constants";
import { decryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { mergeWhapiContactDisplayName } from "src/modules/whatsapp/whatsapp.display-title";
import {
  customerWaIdFromWhapiChatId,
  isWhapiPhoneChatId,
  outboundWhapiChatId,
} from "src/modules/whatsapp/whapi.chat-id";

const CONTACTS_PAGE = 50;
const CONTACTS_PER_TICK = 25;
const CONTACT_SYNC_INTER_REQUEST_MS = 400;

let contactsClientOverride: WhapiContactsClient | null = null;
const contactSyncScheduled = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function setWhapiContactsClientForTests(client: WhapiContactsClient | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("contacts client injection is not allowed in production");
  }
  contactsClientOverride = client;
}

type ContactSyncDeps = { prisma: PrismaClient; log: FastifyBaseLogger };

export function createWhatsAppContactSyncService(deps: FastifyInstance | ContactSyncDeps) {
  const prisma = deps.prisma;
  const log = deps.log;

  async function resolveClient(connectionId: string): Promise<WhapiContactsClient> {
    if (contactsClientOverride) return contactsClientOverride;
    const connection = await prisma.whatsAppConnection.findUnique({
      where: { id: connectionId },
      select: { credentialCiphertext: true, providerApiUrl: true, provider: true, status: true },
    });
    if (!connection?.credentialCiphertext || connection.provider !== "WHAPI") {
      throw new Error("WHATSAPP_CONTACT_SYNC_NOT_CONFIGURED");
    }
    const activeStatuses: WhatsAppConnectionStatus[] = [...WHATSAPP_CURRENT_STATUSES];
    if (!activeStatuses.includes(connection.status)) {
      throw new Error("WHATSAPP_CONTACT_SYNC_CONNECTION_INACTIVE");
    }
    const token = decryptWhatsAppCredential(connection.credentialCiphertext);
    const cfg = whapiRuntimeConfig();
    const apiUrl = connection.providerApiUrl?.trim() || cfg.apiUrl;
    return createWhapiContactsClient(new WhapiClient({ apiUrl, token }));
  }

  async function applyContactToConversations(
    connectionId: string,
    providerContactId: string,
    whapiDisplayName: string | null,
    hasProfilePicture: boolean,
  ): Promise<void> {
    const waIdFromChat = customerWaIdFromWhapiChatId(providerContactId);
    const phoneMatch =
      isWhapiPhoneChatId(providerContactId) && waIdFromChat
        ? [{ customerWaId: waIdFromChat }]
        : [];

    await prisma.whatsAppContactProfile.upsert({
      where: { connectionId_providerContactId: { connectionId, providerContactId } },
      create: {
        connectionId,
        providerContactId,
        whapiDisplayName,
        hasProfilePicture,
        lastSyncedAt: new Date(),
      },
      update: {
        ...(whapiDisplayName?.trim() ? { whapiDisplayName: whapiDisplayName.trim() } : {}),
        hasProfilePicture,
        lastSyncedAt: new Date(),
      },
    });

    const conversations = await prisma.whatsAppConversation.findMany({
      where: {
        connectionId,
        OR: [{ providerChatId: providerContactId }, ...phoneMatch],
      },
      select: { id: true, customerDisplayName: true, customerWaId: true, customerId: true, providerChatId: true },
    });

    for (const convo of conversations) {
      const merged = mergeWhapiContactDisplayName(
        convo.customerDisplayName,
        whapiDisplayName,
        convo.customerWaId,
        Boolean(convo.customerId),
      );
      if (merged === convo.customerDisplayName) continue;
      await prisma.whatsAppConversation.update({
        where: { id: convo.id },
        data: { customerDisplayName: merged },
      });
    }
  }

  /** Bounded batch; returns true when more contacts remain. */
  async function processContactSyncBatch(connectionId: string): Promise<boolean> {
    const state = await prisma.whatsAppContactSyncState.upsert({
      where: { connectionId },
      create: { connectionId, status: "RUNNING", contactsOffset: 0 },
      update: { status: "RUNNING" },
    });

    let client: WhapiContactsClient;
    try {
      client = await resolveClient(connectionId);
    } catch (err) {
      await prisma.whatsAppContactSyncState.update({
        where: { connectionId },
        data: { status: "IDLE" },
      });
      log.warn({ err, connectionId }, "whatsapp contact sync: not configured");
      return false;
    }

    try {
      const page = await client.listContacts(CONTACTS_PAGE, state.contactsOffset);
      const slice = page.items.slice(0, CONTACTS_PER_TICK);
      for (const row of slice) {
        const parsed = parseWhapiContactRow(row);
        if (!parsed) continue;
        await applyContactToConversations(
          connectionId,
          parsed.providerContactId,
          parsed.whapiDisplayName,
          parsed.hasProfilePicture,
        );
      }

      const nextOffset = state.contactsOffset + page.items.length;
      const done = !page.hasMore || page.items.length === 0;
      await prisma.whatsAppContactSyncState.update({
        where: { connectionId },
        data: {
          contactsOffset: nextOffset,
          status: done ? "IDLE" : "RUNNING",
          lastSyncedAt: done ? new Date() : state.lastSyncedAt,
        },
      });
      return !done;
    } catch (err) {
      log.warn({ err, connectionId }, "whatsapp contact sync: batch failed");
      await prisma.whatsAppContactSyncState.update({
        where: { connectionId },
        data: { status: "IDLE" },
      });
      return false;
    }
  }

  async function fetchConversationAvatar(
    connectionId: string,
    conversationId: string,
  ): Promise<{ contentType: string; body: Buffer } | null> {
    const convo = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, connectionId },
      select: { providerChatId: true, customerWaId: true },
    });
    if (!convo) return null;
    const chatId =
      convo.providerChatId ??
      outboundWhapiChatId({ providerChatId: convo.providerChatId, customerWaId: convo.customerWaId });
    if (!chatId) return null;

    const profile = await prisma.whatsAppContactProfile.findUnique({
      where: { connectionId_providerContactId: { connectionId, providerContactId: chatId } },
    });
    if (!profile?.hasProfilePicture) return null;

    const client = await resolveClient(connectionId);
    const result = await client.getProfilePicture(chatId);
    if (result.status < 200 || result.status >= 300 || result.body.length === 0) return null;
    return {
      contentType: result.contentType ?? "image/jpeg",
      body: result.body,
    };
  }

  function scheduleContactSync(connectionId: string): void {
    if (contactSyncScheduled.has(connectionId)) return;
    contactSyncScheduled.add(connectionId);
    void (async () => {
      try {
        while (await processContactSyncBatch(connectionId)) {
          await sleep(CONTACT_SYNC_INTER_REQUEST_MS);
        }
      } catch (err) {
        log.warn({ err, connectionId }, "whatsapp contact sync: worker failed");
      } finally {
        contactSyncScheduled.delete(connectionId);
      }
    })();
  }

  return { processContactSyncBatch, fetchConversationAvatar, scheduleContactSync };
}

export function enqueueWhatsAppContactSyncAfterHistory(
  deps: FastifyInstance | ContactSyncDeps,
  connectionId: string,
): void {
  createWhatsAppContactSyncService(deps).scheduleContactSync(connectionId);
}
