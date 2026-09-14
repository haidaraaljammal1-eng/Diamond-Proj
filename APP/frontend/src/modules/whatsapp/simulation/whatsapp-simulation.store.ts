"use client";

import { create } from "zustand";
import { isDemoSimulationEnabled } from "@/modules/demo-simulation/simulation.enabled";
import type {
  WhatsAppConversationDetailDto,
  WhatsAppConversationListItemDto,
  WhatsAppMessageDto,
} from "../types/whatsapp.types";
import { WHATSAPP_MESSAGE_PAGE_SIZE } from "../types/whatsapp.types";
import { applyUnreadZero, nextClientProviderStatus, prependOlderMessages, toChronologicalPage } from "../utils/whatsapp-view-model";
import {
  buildWhatsAppSimulationInbox,
  WHATSAPP_SIMULATION_ID_PREFIX,
  WHATSAPP_SIMULATION_TEMPLATES,
  type WhatsAppSimulationInbox,
} from "./whatsapp-simulation.fixture";
import { blankWhatsAppMessageFields } from "../utils/whatsapp-view-model";
import type { WhatsAppTemplateDto } from "../types/whatsapp.types";

interface WhatsAppSimulationState {
  active: boolean;
  inbox: WhatsAppSimulationInbox | null;
  selectedConversationId: string | null;
  messagePageByConversation: Record<string, number>;
  search: string;
  unread: boolean;
  templates: WhatsAppTemplateDto[];
  activate: () => void;
  reset: () => void;
  disable: () => void;
  setSearch: (search: string) => void;
  setUnread: (unread: boolean) => void;
  selectConversation: (id: string) => void;
  clearSelection: () => void;
  markReadLocal: (id: string) => void;
  loadOlderMessages: () => void;
  sendText: (conversationId: string, text: string) => boolean;
  sendTemplate: (
    conversationId: string,
    input: {
      name: string;
      language: string;
      headerParameters: string[];
      bodyParameters: string[];
    },
  ) => boolean;
  sendMedia: (
    conversationId: string,
    input: { file: File; messageType: string; caption?: string },
  ) => boolean;
  setConnectionState: (state: "DISCONNECTED" | "LINKED" | "LINKED_ACTIVE") => void;
  linkCustomer: (customerId: number) => void;
  unlinkCustomer: () => void;
  simulateInbound: () => void;
  simulateProviderStatus: (status: NonNullable<WhatsAppMessageDto["providerStatus"]>) => void;
}

export const useWhatsAppSimulationStore = create<WhatsAppSimulationState>((set, get) => ({
  active: false,
  inbox: null,
  selectedConversationId: null,
  messagePageByConversation: {},
  search: "",
  unread: false,
  templates: WHATSAPP_SIMULATION_TEMPLATES,

  activate() {
    if (!isDemoSimulationEnabled()) return;
    set({
      active: true,
      inbox: buildWhatsAppSimulationInbox(),
      selectedConversationId: null,
      messagePageByConversation: {},
      search: "",
      unread: false,
    });
  },

  reset() {
    if (!isDemoSimulationEnabled() || !get().active) return;
    set({
      inbox: buildWhatsAppSimulationInbox(),
      selectedConversationId: null,
      messagePageByConversation: {},
      search: "",
      unread: false,
    });
  },

  disable() {
    set({
      active: false,
      inbox: null,
      selectedConversationId: null,
      messagePageByConversation: {},
      search: "",
      unread: false,
    });
  },

  setSearch(search: string) {
    set({ search: search.trim() });
  },

  setUnread(unread: boolean) {
    set({ unread });
  },

  selectConversation(id: string) {
    const inbox = get().inbox;
    if (!inbox) return;
    const details = {
      ...inbox.details,
      [id]: inbox.details[id]
        ? { ...inbox.details[id]!, unreadCount: 0 }
        : inbox.details[id],
    };
    const conversations = inbox.conversations.map((item) =>
      item.id === id ? applyUnreadZero(item) : item,
    );
    set({
      selectedConversationId: id,
      inbox: { ...inbox, conversations, details },
      messagePageByConversation: {
        ...get().messagePageByConversation,
        [id]: get().messagePageByConversation[id] ?? 1,
      },
    });
  },

  clearSelection() {
    set({ selectedConversationId: null });
  },

  markReadLocal(id: string) {
    get().selectConversation(id);
  },

  loadOlderMessages() {
    const id = get().selectedConversationId;
    const inbox = get().inbox;
    if (!id || !inbox) return;
    const total = inbox.messages[id]?.length ?? 0;
    const current = get().messagePageByConversation[id] ?? 1;
    const totalPages = Math.max(1, Math.ceil(total / WHATSAPP_MESSAGE_PAGE_SIZE));
    if (current >= totalPages) return;
    set({
      messagePageByConversation: {
        ...get().messagePageByConversation,
        [id]: current + 1,
      },
    });
  },

  sendText(conversationId, text) {
    if (!isDemoSimulationEnabled() || !get().active) return false;
    const inbox = get().inbox;
    if (!inbox) return false;
    const detail = inbox.details[conversationId];
    if (!detail?.messagingEligibility.canSendText) return false;
    const trimmed = text.replace(/^[\s\uFEFF\u200B]+|[\s\uFEFF\u200B]+$/g, "");
    if (!trimmed) return false;
    const now = new Date().toISOString();
    const message: WhatsAppMessageDto = {
      id: `${WHATSAPP_SIMULATION_ID_PREFIX}send-${crypto.randomUUID()}`,
      direction: "OUTBOUND",
      messageType: "TEXT",
      textBody: trimmed,
      ...blankWhatsAppMessageFields(),
      providerOccurredAt: now,
      receivedAt: now,
      providerStatus: null,
      sendState: "ACCEPTED",
    };
    const messages = {
      ...inbox.messages,
      [conversationId]: [...(inbox.messages[conversationId] ?? []), message],
    };
    const updatedDetail = {
      ...detail,
      lastMessagePreview: trimmed,
      lastMessageType: "TEXT" as const,
      lastMessageAt: now,
    };
    set({
      inbox: {
        ...inbox,
        messages,
        details: { ...inbox.details, [conversationId]: updatedDetail },
        conversations: inbox.conversations.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                lastMessagePreview: trimmed,
                lastMessageType: "TEXT",
                lastMessageAt: now,
              }
            : item,
        ),
      },
    });
    return true;
  },

  sendTemplate(conversationId, input) {
    if (!isDemoSimulationEnabled() || !get().active) return false;
    const inbox = get().inbox;
    const detail = inbox?.details[conversationId];
    if (!inbox || !detail?.messagingEligibility.canSendTemplate) return false;
    const template = WHATSAPP_SIMULATION_TEMPLATES.find(
      (item) => item.sendable && item.name === input.name && item.language === input.language,
    );
    if (!template) return false;
    const now = new Date().toISOString();
    const preview = (template.bodyText ?? "").replace(/\{\{1\}\}/g, input.bodyParameters[0] ?? "{{1}}").replace(/\{\{2\}\}/g, input.bodyParameters[1] ?? "{{2}}");
    const message: WhatsAppMessageDto = {
      id: `${WHATSAPP_SIMULATION_ID_PREFIX}tpl-${crypto.randomUUID()}`,
      direction: "OUTBOUND",
      messageType: "TEMPLATE",
      textBody: preview,
      ...blankWhatsAppMessageFields(),
      templateName: template.name,
      templateLanguage: template.language,
      templatePreview: preview,
      providerOccurredAt: now,
      receivedAt: now,
      providerStatus: null,
      sendState: "ACCEPTED",
    };
    set({
      inbox: {
        ...inbox,
        messages: { ...inbox.messages, [conversationId]: [...(inbox.messages[conversationId] ?? []), message] },
        details: {
          ...inbox.details,
          [conversationId]: { ...detail, lastMessagePreview: preview, lastMessageType: "TEMPLATE", lastMessageAt: now },
        },
      },
    });
    return true;
  },

  sendMedia(conversationId, input) {
    if (!isDemoSimulationEnabled() || !get().active) return false;
    const inbox = get().inbox;
    const detail = inbox?.details[conversationId];
    if (!inbox || !detail?.messagingEligibility.canSendMedia) return false;
    const now = new Date().toISOString();
    const messageType = input.messageType as WhatsAppMessageDto["messageType"];
    const message: WhatsAppMessageDto = {
      id: `${WHATSAPP_SIMULATION_ID_PREFIX}media-${crypto.randomUUID()}`,
      direction: "OUTBOUND",
      messageType,
      textBody: null,
      ...blankWhatsAppMessageFields(),
      caption: input.caption ?? null,
      mediaFilename: input.file.name,
      mediaSizeBytes: input.file.size,
      hasProtectedMedia: true,
      providerOccurredAt: now,
      receivedAt: now,
      providerStatus: null,
      sendState: "ACCEPTED",
    };
    set({
      inbox: {
        ...inbox,
        messages: { ...inbox.messages, [conversationId]: [...(inbox.messages[conversationId] ?? []), message] },
        details: {
          ...inbox.details,
          [conversationId]: {
            ...detail,
            lastMessageType: messageType,
            lastMessageAt: now,
            lastMessagePreview: input.caption ?? null,
          },
        },
      },
    });
    return true;
  },

  setConnectionState(state) {
    if (!isDemoSimulationEnabled() || !get().active) return;
    const inbox = get().inbox;
    if (!inbox) return;
    const connection = {
      ...inbox.connection,
      status: state === "DISCONNECTED" ? ("DISCONNECTED" as const) : ("LINKED" as const),
      webhookStatus: state === "LINKED_ACTIVE" ? ("ACTIVE" as const) : state === "LINKED" ? ("PENDING" as const) : ("NOT_CONFIGURED" as const),
    };
    set({ inbox: { ...inbox, connection } });
  },

  linkCustomer(_customerId: number) {
    if (!isDemoSimulationEnabled() || !get().active) return;
    const inbox = get().inbox;
    const id = get().selectedConversationId;
    if (!inbox || !id || !inbox.details[id]) return;
    const customer = { id: 202, name: "Demo Manual Link", mobile: "15550001999", externalId: "C-202" };
    set({
      inbox: {
        ...inbox,
        conversations: inbox.conversations.map((item) =>
          item.id === id ? { ...item, customerLinked: true } : item,
        ),
        details: {
          ...inbox.details,
          [id]: {
            ...inbox.details[id]!,
            customerLinked: true,
            customerLink: { linked: true, customer, linkedAt: new Date().toISOString() },
          },
        },
      },
    });
  },

  unlinkCustomer() {
    if (!isDemoSimulationEnabled() || !get().active) return;
    const inbox = get().inbox;
    const id = get().selectedConversationId;
    if (!inbox || !id || !inbox.details[id]) return;
    set({
      inbox: {
        ...inbox,
        conversations: inbox.conversations.map((item) =>
          item.id === id ? { ...item, customerLinked: false } : item,
        ),
        details: {
          ...inbox.details,
          [id]: {
            ...inbox.details[id]!,
            customerLinked: false,
            customerLink: { linked: false, customer: null, linkedAt: null },
          },
        },
      },
    });
  },

  simulateInbound() {
    if (!isDemoSimulationEnabled() || !get().active) return;
    const inbox = get().inbox;
    if (!inbox) return;
    const now = new Date().toISOString();
    const selectedId = get().selectedConversationId;
    if (selectedId && inbox.details[selectedId]) {
      const message: WhatsAppMessageDto = {
        id: `${WHATSAPP_SIMULATION_ID_PREFIX}in-${crypto.randomUUID()}`,
        direction: "INBOUND",
        messageType: "TEXT",
        textBody: "Simulated inbound message",
        ...blankWhatsAppMessageFields(),
        providerOccurredAt: now,
        receivedAt: now,
        providerStatus: null,
        sendState: null,
      };
      const detail = inbox.details[selectedId]!;
      const unreadCount = detail.unreadCount + 1;
      const updatedDetail = {
        ...detail,
        unreadCount,
        lastMessagePreview: message.textBody,
        lastMessageType: "TEXT" as const,
        lastMessageAt: now,
        lastInboundAt: now,
      };
      set({
        inbox: {
          ...inbox,
          messages: {
            ...inbox.messages,
            [selectedId]: [...(inbox.messages[selectedId] ?? []), message],
          },
          details: { ...inbox.details, [selectedId]: updatedDetail },
          conversations: inbox.conversations.map((item) =>
            item.id === selectedId
              ? {
                  ...item,
                  unreadCount,
                  lastMessagePreview: message.textBody,
                  lastMessageType: "TEXT",
                  lastMessageAt: now,
                  lastInboundAt: now,
                }
              : item,
          ),
        },
      });
      return;
    }
    const id = `${WHATSAPP_SIMULATION_ID_PREFIX}live-${crypto.randomUUID()}`;
    const row: WhatsAppConversationListItemDto = {
      id,
      customerWaId: "15550999001",
      customerDisplayName: "Simulated New Chat",
      lastMessagePreview: "Simulated inbound message",
      lastMessageType: "TEXT",
      lastMessageAt: now,
      unreadCount: 1,
      lastInboundAt: now,
      customerLinked: false,
      connection: inbox.connection
        ? {
            displayPhoneNumber: inbox.connection.displayPhoneNumber,
            verifiedName: inbox.connection.verifiedName,
          }
        : { displayPhoneNumber: null, verifiedName: null },
    };
    const message: WhatsAppMessageDto = {
      id: `${WHATSAPP_SIMULATION_ID_PREFIX}in-${crypto.randomUUID()}`,
      direction: "INBOUND",
      messageType: "TEXT",
      textBody: "Simulated inbound message",
      ...blankWhatsAppMessageFields(),
      providerOccurredAt: now,
      receivedAt: now,
      providerStatus: null,
      sendState: null,
    };
    const detail: WhatsAppConversationDetailDto = {
      ...row,
      lastReadAt: null,
      createdAt: now,
      messagingEligibility: {
        canSendText: true,
        canSendMedia: true,
        canSendTemplate: true,
        reason: "READY",
        windowExpiresAt: new Date(Date.now() + 12 * 60 * 60_000).toISOString(),
      },
      customerLink: { linked: false, customer: null, linkedAt: null },
    };
    set({
      inbox: {
        ...inbox,
        conversations: [row, ...inbox.conversations],
        details: { ...inbox.details, [id]: detail },
        messages: { ...inbox.messages, [id]: [message] },
      },
    });
  },

  simulateProviderStatus(status) {
    if (!isDemoSimulationEnabled() || !get().active) return;
    const inbox = get().inbox;
    const selectedId = get().selectedConversationId;
    if (!inbox || !selectedId) return;
    const messages = inbox.messages[selectedId] ?? [];
    const target = [...messages].reverse().find((item) => item.direction === "OUTBOUND");
    if (!target) return;
    set({
      inbox: {
        ...inbox,
        messages: {
          ...inbox.messages,
          [selectedId]: messages.map((item) =>
            item.id === target.id
              ? {
                  ...item,
                  providerStatus: nextClientProviderStatus(item.providerStatus, status),
                }
              : item,
          ),
        },
      },
    });
  },
}));

export function simulatedMessagesForPage(
  allChronological: WhatsAppMessageDto[],
  page: number,
): WhatsAppMessageDto[] {
  let chronological: WhatsAppMessageDto[] = [];
  for (let current = 1; current <= page; current += 1) {
    const newestFirst = [...allChronological].reverse();
    const start = (current - 1) * WHATSAPP_MESSAGE_PAGE_SIZE;
    const slice = newestFirst.slice(start, start + WHATSAPP_MESSAGE_PAGE_SIZE);
    chronological =
      current === 1
        ? toChronologicalPage(slice)
        : prependOlderMessages(chronological, slice);
  }
  return chronological;
}

export function simulatedSelectedDetail(
  inbox: WhatsAppSimulationInbox | null,
  selectedId: string | null,
): WhatsAppConversationDetailDto | WhatsAppConversationListItemDto | null {
  if (!inbox || !selectedId) return null;
  return inbox.details[selectedId] ?? inbox.conversations.find((item) => item.id === selectedId) ?? null;
}
