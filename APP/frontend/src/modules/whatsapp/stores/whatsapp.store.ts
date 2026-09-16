"use client";

import { create } from "zustand";
import { normalizeApiError } from "@/infrastructure/api/errors";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import {
  getWhatsAppConnection,
  getWhatsAppConversation,
  listWhatsAppConversations,
  listWhatsAppMessages,
  markWhatsAppConversationRead,
  sendWhatsAppMediaMessage,
  sendWhatsAppTemplateMessage,
  sendWhatsAppTextMessage,
} from "../api/whatsapp.api";
import type {
  WhatsAppConnectionDto,
  WhatsAppConversationDetailDto,
  WhatsAppConversationListItemDto,
  WhatsAppListQuery,
  WhatsAppLoadStatus,
  WhatsAppMessageDto,
  WhatsAppPageMeta,
  WhatsAppSendResult,
} from "../types/whatsapp.types";
import { WHATSAPP_MESSAGE_PAGE_SIZE, WHATSAPP_PAGE_SIZE } from "../types/whatsapp.types";
import {
  applyUnreadZero,
  appendMessageById,
  mergeById,
  patchOutboundMessage,
  prependOlderMessages,
  toChronologicalPage,
  upsertConversationForRealtime,
} from "../utils/whatsapp-view-model";
import type { WhatsAppRealtimeEvent } from "../realtime/whatsapp.realtime";
import type { WhatsAppRealtimeTransportStatus } from "../realtime/whatsapp.realtime";

interface WhatsAppState {
  connection: WhatsAppConnectionDto | null;
  connectionStatus: WhatsAppLoadStatus;
  connectionError: ApiRequestError | null;
  conversations: WhatsAppConversationListItemDto[];
  conversationMeta: WhatsAppPageMeta | null;
  query: WhatsAppListQuery;
  listStatus: WhatsAppLoadStatus;
  listError: ApiRequestError | null;
  selectedConversationId: string | null;
  selectedConversation: WhatsAppConversationDetailDto | WhatsAppConversationListItemDto | null;
  messagesByConversation: Record<string, WhatsAppMessageDto[]>;
  messageMetaByConversation: Record<string, WhatsAppPageMeta | null>;
  messagePageByConversation: Record<string, number>;
  messagesStatus: WhatsAppLoadStatus;
  messagesError: ApiRequestError | null;
  markReadError: ApiRequestError | null;
  sending: boolean;
  sendError: ApiRequestError | null;
  realtimeStatus: WhatsAppRealtimeTransportStatus;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  reconcileRealtime: () => Promise<void>;
  setRealtimeStatus: (status: WhatsAppRealtimeTransportStatus) => void;
  applyRealtimeEvent: (event: WhatsAppRealtimeEvent) => Promise<void>;
  setSearch: (search: string) => void;
  setUnreadFilter: (unread: boolean) => void;
  loadMoreConversations: () => Promise<void>;
  selectConversation: (id: string) => void;
  clearSelection: () => void;
  loadOlderMessages: () => Promise<void>;
  sendText: (conversationId: string, text: string, idempotencyKey: string) => Promise<boolean>;
  sendTemplate: (
    conversationId: string,
    input: {
      name: string;
      language: string;
      headerParameters?: string[];
      bodyParameters?: string[];
    },
    idempotencyKey: string,
  ) => Promise<boolean>;
  sendMedia: (
    conversationId: string,
    input: { file: File; messageType: string; caption?: string },
    idempotencyKey: string,
  ) => Promise<boolean>;
}

const DEFAULT_QUERY: WhatsAppListQuery = {
  search: "",
  unread: false,
  page: 1,
  pageSize: WHATSAPP_PAGE_SIZE,
};

let connectionRequestId = 0;
let listRequestId = 0;
let messagesRequestId = 0;
let listInFlight: Promise<void> | null = null;
const seenRealtimeEventIds = new Set<string>();
let conversationPatchRequestId = 0;
let realtimeMessageRequestId = 0;

export const useWhatsAppStore = create<WhatsAppState>((set, get) => ({
  connection: null,
  connectionStatus: "idle",
  connectionError: null,
  conversations: [],
  conversationMeta: null,
  query: DEFAULT_QUERY,
  listStatus: "idle",
  listError: null,
  selectedConversationId: null,
  selectedConversation: null,
  messagesByConversation: {},
  messageMetaByConversation: {},
  messagePageByConversation: {},
  messagesStatus: "idle",
  messagesError: null,
  markReadError: null,
  sending: false,
  sendError: null,
  realtimeStatus: "idle",

  async load() {
    await Promise.all([loadConnection(set), loadConversations(get, set, { replace: true })]);
  },

  async refresh() {
    const selectedId = get().selectedConversationId;
    await Promise.all([loadConnection(set), loadConversations(get, set, { replace: true })]);
    if (selectedId) get().selectConversation(selectedId);
  },

  async reconcileRealtime() {
    const selectedId = get().selectedConversationId;
    await Promise.all([loadConnection(set), loadConversations(get, set, { replace: true })]);
    if (selectedId) await mergeSelectedMessages(selectedId, get, set);
  },

  setRealtimeStatus(status) {
    set({ realtimeStatus: status });
  },

  async applyRealtimeEvent(event) {
    if (rememberRealtimeEvent(event.eventId)) return;
    switch (event.type) {
      case "whatsapp.connection.updated":
        await loadConnection(set);
        if (get().selectedConversationId) {
          await refreshAffectedConversation(get().selectedConversationId!, event, get, set);
        }
        return;
      case "whatsapp.conversation.read":
        if (event.conversationId) applyConversationRead(event.conversationId, get, set);
        return;
      case "whatsapp.message.send_state_changed":
        if (event.messageId) {
          patchLocalMessage(event.messageId, { sendState: event.sendState ?? null }, get, set);
        }
        return;
      case "whatsapp.message.provider_status_changed":
        if (event.messageId) {
          patchLocalMessage(
            event.messageId,
            { providerStatus: event.providerStatus ?? null },
            get,
            set,
          );
        }
        return;
      case "whatsapp.conversation.created":
      case "whatsapp.conversation.updated":
      case "whatsapp.message.received":
      case "whatsapp.message.outbound_created":
        if (event.conversationId) {
          await refreshAffectedConversation(event.conversationId, event, get, set);
        }
        return;
      default:
        return;
    }
  },

  setSearch(search: string) {
    set({ query: { ...get().query, search: search.trim(), page: 1 } });
    void loadConversations(get, set, { replace: true });
  },

  setUnreadFilter(unread: boolean) {
    set({ query: { ...get().query, unread, page: 1 } });
    void loadConversations(get, set, { replace: true });
  },

  async loadMoreConversations() {
    const meta = get().conversationMeta;
    const page = get().query.page;
    if (!meta || page >= meta.totalPages) return;
    set({ query: { ...get().query, page: page + 1 } });
    await loadConversations(get, set, { replace: false });
  },

  selectConversation(id: string) {
    void selectConversation(id, get, set);
  },

  clearSelection() {
    messagesRequestId += 1;
    set({
      selectedConversationId: null,
      selectedConversation: null,
      messagesStatus: "idle",
      messagesError: null,
      markReadError: null,
    });
  },

  async loadOlderMessages() {
    const conversationId = get().selectedConversationId;
    if (!conversationId) return;
    const meta = get().messageMetaByConversation[conversationId];
    const page = get().messagePageByConversation[conversationId] ?? 1;
    if (!meta || page >= meta.totalPages) return;
    const nextPage = page + 1;
    const requestId = ++messagesRequestId;
    try {
      const result = await listWhatsAppMessages(conversationId, {
        page: nextPage,
        pageSize: WHATSAPP_MESSAGE_PAGE_SIZE,
      });
      if (requestId !== messagesRequestId) return;
      if (get().selectedConversationId !== conversationId) return;
      const current = get().messagesByConversation[conversationId] ?? [];
      set({
        messagesByConversation: {
          ...get().messagesByConversation,
          [conversationId]: prependOlderMessages(current, result.data),
        },
        messageMetaByConversation: {
          ...get().messageMetaByConversation,
          [conversationId]: result.meta,
        },
        messagePageByConversation: {
          ...get().messagePageByConversation,
          [conversationId]: nextPage,
        },
        messagesStatus: "ready",
        messagesError: null,
      });
    } catch (error) {
      if (requestId !== messagesRequestId) return;
      if (get().selectedConversationId !== conversationId) return;
      set({
        messagesStatus: "error",
        messagesError: normalizeApiError(error),
      });
    }
  },

  async sendText(conversationId, text, idempotencyKey) {
    if (get().sending) return false;
    set({ sending: true, sendError: null });
    try {
      const result = await sendWhatsAppTextMessage(conversationId, text, idempotencyKey);
      if (get().selectedConversationId !== conversationId) {
        set({ sending: false });
        return true;
      }
      const current = get().messagesByConversation[conversationId] ?? [];
      set({
        sending: false,
        sendError: null,
        selectedConversation: result.conversation,
        messagesByConversation: {
          ...get().messagesByConversation,
          [conversationId]: appendMessageById(current, result.message),
        },
        conversations: get().conversations.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                lastMessagePreview: result.conversation.lastMessagePreview,
                lastMessageType: result.conversation.lastMessageType,
                lastMessageAt: result.conversation.lastMessageAt,
                unreadCount: result.conversation.unreadCount,
              }
            : item,
        ),
      });
      return true;
    } catch (error) {
      if (get().selectedConversationId !== conversationId) {
        set({ sending: false });
        return false;
      }
      set({ sending: false, sendError: normalizeApiError(error) });
      return false;
    }
  },

  async sendTemplate(conversationId, input, idempotencyKey) {
    if (get().sending) return false;
    set({ sending: true, sendError: null });
    try {
      const result = await sendWhatsAppTemplateMessage(conversationId, input, idempotencyKey);
      applySendResult(conversationId, result, get, set);
      return true;
    } catch (error) {
      set({ sending: false, sendError: normalizeApiError(error) });
      return false;
    }
  },

  async sendMedia(conversationId, input, idempotencyKey) {
    if (get().sending) return false;
    set({ sending: true, sendError: null });
    try {
      const result = await sendWhatsAppMediaMessage(conversationId, input, idempotencyKey);
      applySendResult(conversationId, result, get, set);
      return true;
    } catch (error) {
      set({ sending: false, sendError: normalizeApiError(error) });
      return false;
    }
  },
}));

function applySendResult(
  conversationId: string,
  result: WhatsAppSendResult,
  get: () => WhatsAppState,
  set: (partial: Partial<WhatsAppState>) => void,
) {
  if (get().selectedConversationId !== conversationId) {
    set({ sending: false });
    return;
  }
  const current = get().messagesByConversation[conversationId] ?? [];
  set({
    sending: false,
    sendError: null,
    selectedConversation: result.conversation,
    messagesByConversation: {
      ...get().messagesByConversation,
      [conversationId]: appendMessageById(current, result.message),
    },
    conversations: get().conversations.map((item) =>
      item.id === conversationId
        ? {
            ...item,
            lastMessagePreview: result.conversation.lastMessagePreview,
            lastMessageType: result.conversation.lastMessageType,
            lastMessageAt: result.conversation.lastMessageAt,
            unreadCount: result.conversation.unreadCount,
            customerLinked: result.conversation.customerLinked,
          }
        : item,
    ),
  });
}

async function loadConnection(set: (partial: Partial<WhatsAppState>) => void) {
  const requestId = ++connectionRequestId;
  set({ connectionStatus: "loading", connectionError: null });
  try {
    const connection = await getWhatsAppConnection();
    if (requestId !== connectionRequestId) return;
    set({ connection, connectionStatus: "ready", connectionError: null });
  } catch (error) {
    if (requestId !== connectionRequestId) return;
    set({
      connectionStatus: "error",
      connectionError: normalizeApiError(error),
    });
  }
}

async function loadConversations(
  get: () => WhatsAppState,
  set: (partial: Partial<WhatsAppState>) => void,
  options: { replace: boolean },
) {
  const requestId = ++listRequestId;
  const query = get().query;
  set({ listStatus: "loading", listError: null });
  const run = (async () => {
    try {
      const result = await listWhatsAppConversations(query);
      if (requestId !== listRequestId) return;
      const existing = options.replace ? [] : get().conversations;
      set({
        conversations: options.replace ? result.data : mergeById(existing, result.data),
        conversationMeta: result.meta,
        listStatus: "ready",
        listError: null,
      });
    } catch (error) {
      if (requestId !== listRequestId) return;
      set({
        listStatus: "error",
        listError: normalizeApiError(error),
      });
    }
  })();
  listInFlight = run;
  await run;
  if (listInFlight === run) listInFlight = null;
}

async function selectConversation(
  id: string,
  get: () => WhatsAppState,
  set: (partial: Partial<WhatsAppState>) => void,
) {
  const requestId = ++messagesRequestId;
  const fromList = get().conversations.find((item) => item.id === id) ?? null;
  const previous =
    get().selectedConversationId === id ? get().selectedConversation : fromList;
  set({
    selectedConversationId: id,
    selectedConversation: previous ?? fromList,
    messagesStatus: "loading",
    messagesError: null,
    markReadError: null,
  });

  try {
    const [detail, messages] = await Promise.all([
      getWhatsAppConversation(id),
      listWhatsAppMessages(id, { page: 1, pageSize: WHATSAPP_MESSAGE_PAGE_SIZE }),
    ]);
    if (requestId !== messagesRequestId) return;
    if (get().selectedConversationId !== id) return;
    set({
      selectedConversation: detail,
      messagesByConversation: {
        ...get().messagesByConversation,
        [id]: toChronologicalPage(messages.data),
      },
      messageMetaByConversation: {
        ...get().messageMetaByConversation,
        [id]: messages.meta,
      },
      messagePageByConversation: {
        ...get().messagePageByConversation,
        [id]: 1,
      },
      messagesStatus: "ready",
      messagesError: null,
    });
  } catch (error) {
    if (requestId !== messagesRequestId) return;
    if (get().selectedConversationId !== id) return;
    set({
      messagesStatus: "error",
      messagesError: normalizeApiError(error),
    });
    return;
  }

  try {
    const updated = await markWhatsAppConversationRead(id);
    if (requestId !== messagesRequestId) return;
    if (get().selectedConversationId !== id) return;
    set({
      selectedConversation: updated,
      conversations: get().conversations.map((item) =>
        item.id === id ? applyUnreadZero(item) : item,
      ),
      markReadError: null,
    });
  } catch (error) {
    if (requestId !== messagesRequestId) return;
    if (get().selectedConversationId !== id) return;
    set({ markReadError: normalizeApiError(error) });
  }
}

function rememberRealtimeEvent(eventId: string): boolean {
  if (seenRealtimeEventIds.has(eventId)) return true;
  seenRealtimeEventIds.add(eventId);
  if (seenRealtimeEventIds.size > 500) {
    const oldest = seenRealtimeEventIds.values().next().value;
    if (oldest) seenRealtimeEventIds.delete(oldest);
  }
  return false;
}

function applyConversationRead(
  conversationId: string,
  get: () => WhatsAppState,
  set: (partial: Partial<WhatsAppState>) => void,
): void {
  const query = get().query;
  const selectedId = get().selectedConversationId;
  const conversations = get().conversations.map((item) =>
    item.id === conversationId ? applyUnreadZero(item) : item,
  );
  const selected =
    get().selectedConversation?.id === conversationId
      ? applyUnreadZero(get().selectedConversation as WhatsAppConversationListItemDto)
      : get().selectedConversation;
  const visible = conversations.filter((item) => {
    if (query.unread && item.unreadCount <= 0 && item.id !== selectedId) return false;
    return true;
  });
  set({
    conversations: visible,
    selectedConversation: selected,
  });
}

function patchLocalMessage(
  messageId: string,
  patch: {
    sendState?: WhatsAppMessageDto["sendState"];
    providerStatus?: WhatsAppMessageDto["providerStatus"];
  },
  get: () => WhatsAppState,
  set: (partial: Partial<WhatsAppState>) => void,
): void {
  const nextMessages: Record<string, WhatsAppMessageDto[]> = {
    ...get().messagesByConversation,
  };
  let changed = false;
  for (const [conversationId, messages] of Object.entries(nextMessages)) {
    if (!messages.some((message) => message.id === messageId)) continue;
    nextMessages[conversationId] = patchOutboundMessage(messages, messageId, patch);
    changed = true;
  }
  if (changed) set({ messagesByConversation: nextMessages });
}

async function refreshAffectedConversation(
  conversationId: string,
  event: WhatsAppRealtimeEvent,
  get: () => WhatsAppState,
  set: (partial: Partial<WhatsAppState>) => void,
): Promise<void> {
  const requestId = ++conversationPatchRequestId;
  try {
    const detail = await getWhatsAppConversation(conversationId);
    if (requestId !== conversationPatchRequestId) return;
    const query = get().query;
    set({
      conversations: upsertConversationForRealtime(
        get().conversations,
        detail,
        query,
        get().selectedConversationId,
      ),
      selectedConversation:
        get().selectedConversationId === conversationId ? detail : get().selectedConversation,
    });
  } catch {
    if (requestId !== conversationPatchRequestId) return;
  }

  const selected = get().selectedConversationId === conversationId;
  const needsMessage =
    selected &&
    (event.type === "whatsapp.message.received" ||
      event.type === "whatsapp.message.outbound_created");
  if (!needsMessage) return;
  await mergeSelectedMessages(conversationId, get, set);
}

async function mergeSelectedMessages(
  conversationId: string,
  get: () => WhatsAppState,
  set: (partial: Partial<WhatsAppState>) => void,
): Promise<void> {
  const requestId = ++realtimeMessageRequestId;
  try {
    const messages = await listWhatsAppMessages(conversationId, {
      page: 1,
      pageSize: WHATSAPP_MESSAGE_PAGE_SIZE,
    });
    if (requestId !== realtimeMessageRequestId) return;
    if (get().selectedConversationId !== conversationId) return;
    const current = get().messagesByConversation[conversationId] ?? [];
    set({
      messagesByConversation: {
        ...get().messagesByConversation,
        [conversationId]: mergeById(current, toChronologicalPage(messages.data)),
      },
      messageMetaByConversation: {
        ...get().messageMetaByConversation,
        [conversationId]: messages.meta,
      },
      messagesError: null,
    });
  } catch {
    if (requestId !== realtimeMessageRequestId) return;
  }
}

export function resetWhatsAppStoreForTests(): void {
  connectionRequestId = 0;
  listRequestId = 0;
  messagesRequestId = 0;
  conversationPatchRequestId = 0;
  realtimeMessageRequestId = 0;
  seenRealtimeEventIds.clear();
  useWhatsAppStore.setState({
    connection: null,
    connectionStatus: "idle",
    connectionError: null,
    conversations: [],
    conversationMeta: null,
    query: DEFAULT_QUERY,
    listStatus: "idle",
    listError: null,
    selectedConversationId: null,
    selectedConversation: null,
    messagesByConversation: {},
    messageMetaByConversation: {},
    messagePageByConversation: {},
    messagesStatus: "idle",
    messagesError: null,
    markReadError: null,
    sending: false,
    sendError: null,
    realtimeStatus: "idle",
  });
}
