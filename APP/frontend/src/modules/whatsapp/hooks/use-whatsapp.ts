"use client";

import { useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/modules/auth";
import { isDemoSimulationEnabled } from "@/modules/demo-simulation/simulation.enabled";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { useWhatsAppStore } from "../stores/whatsapp.store";
import {
  simulatedMessagesForPage,
  simulatedSelectedDetail,
  useWhatsAppSimulationStore,
} from "../simulation/whatsapp-simulation.store";
import {
  filterSimulatedConversations,
  selectWhatsAppPresentation,
} from "../simulation/select-whatsapp-presentation";
import {
  WHATSAPP_LINK_CUSTOMER_PERMISSION,
  WHATSAPP_MANAGE_CONNECTION_PERMISSION,
  WHATSAPP_PAGE_PERMISSIONS,
  WHATSAPP_SEND_PERMISSION,
} from "../whatsapp.permissions";
import type {
  WhatsAppConnectionDto,
  WhatsAppConversationDetailDto,
  WhatsAppConversationListItemDto,
  WhatsAppListQuery,
  WhatsAppMessageDto,
  WhatsAppPageMeta,
  WhatsAppTemplateDto,
} from "../types/whatsapp.types";
import { WHATSAPP_MESSAGE_PAGE_SIZE, WHATSAPP_PAGE_SIZE } from "../types/whatsapp.types";
import {
  isClientSendWindowStillOpen,
  keepSelectedIfMissingFromList,
} from "../utils/whatsapp-view-model";
import { acquireWhatsAppRealtime } from "../realtime/whatsapp.realtime-client";
import type { WhatsAppRealtimeTransportStatus } from "../realtime/whatsapp.realtime";

export interface UseWhatsAppResult {
  connection: WhatsAppConnectionDto | null;
  conversations: WhatsAppConversationListItemDto[];
  conversationMeta: WhatsAppPageMeta | null;
  query: WhatsAppListQuery;
  selectedConversationId: string | null;
  selectedConversation: WhatsAppConversationDetailDto | WhatsAppConversationListItemDto | null;
  messages: WhatsAppMessageDto[];
  hasOlderMessages: boolean;
  isAllowed: boolean;
  isConnectionLoading: boolean;
  isListLoading: boolean;
  isMessagesLoading: boolean;
  isRefreshing: boolean;
  connectionError: ApiRequestError | null;
  listError: ApiRequestError | null;
  messagesError: ApiRequestError | null;
  markReadError: ApiRequestError | null;
  sendError: ApiRequestError | null;
  sending: boolean;
  canSend: boolean;
  canSendTemplate: boolean;
  canSendMedia: boolean;
  hasSendPermission: boolean;
  hasManageConnectionPermission: boolean;
  hasLinkCustomerPermission: boolean;
  simulationActive: boolean;
  simulationEnabled: boolean;
  simulationTemplates: WhatsAppTemplateDto[];
  realtimeStatus: WhatsAppRealtimeTransportStatus;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  applySearch: (search: string) => void;
  setUnreadFilter: (unread: boolean) => void;
  loadMoreConversations: () => Promise<void>;
  selectConversation: (id: string) => void;
  clearSelection: () => void;
  loadOlderMessages: () => Promise<void>;
  sendText: (text: string, idempotencyKey: string) => Promise<boolean>;
  sendTemplate: (
    input: {
      name: string;
      language: string;
      headerParameters: string[];
      bodyParameters: string[];
    },
    idempotencyKey: string,
  ) => Promise<boolean>;
  sendMedia: (
    input: { file: File; messageType: string; caption?: string },
    idempotencyKey: string,
  ) => Promise<boolean>;
  simulationSetConnection?: (state: "DISCONNECTED" | "LINKED" | "LINKED_ACTIVE") => void;
  simulationLinkCustomer?: (customerId: number) => void;
  simulationUnlinkCustomer?: () => void;
}

export function useWhatsApp(): UseWhatsAppResult {
  const { status: sessionStatus } = useSession();
  const { hasPermission } = usePermissions();
  const isAllowed = WHATSAPP_PAGE_PERMISSIONS.every((permission) =>
    hasPermission(permission),
  );
  const hasSendPermission = hasPermission(WHATSAPP_SEND_PERMISSION);
  const hasManageConnectionPermission = hasPermission(WHATSAPP_MANAGE_CONNECTION_PERMISSION);
  const hasLinkCustomerPermission = hasPermission(WHATSAPP_LINK_CUSTOMER_PERMISSION);
  const simulationEnabled = isDemoSimulationEnabled();
  const simulationActive =
    simulationEnabled && useWhatsAppSimulationStore((state) => state.active);
  const simulatedInbox = useWhatsAppSimulationStore((state) => state.inbox);
  const simulatedSelectedId = useWhatsAppSimulationStore((state) => state.selectedConversationId);
  const simulatedPages = useWhatsAppSimulationStore((state) => state.messagePageByConversation);
  const simulatedSearch = useWhatsAppSimulationStore((state) => state.search);
  const simulatedUnread = useWhatsAppSimulationStore((state) => state.unread);

  const connection = useWhatsAppStore((state) => state.connection);
  const connectionStatus = useWhatsAppStore((state) => state.connectionStatus);
  const connectionError = useWhatsAppStore((state) => state.connectionError);
  const conversations = useWhatsAppStore((state) => state.conversations);
  const conversationMeta = useWhatsAppStore((state) => state.conversationMeta);
  const query = useWhatsAppStore((state) => state.query);
  const listStatus = useWhatsAppStore((state) => state.listStatus);
  const listError = useWhatsAppStore((state) => state.listError);
  const selectedConversationId = useWhatsAppStore((state) => state.selectedConversationId);
  const selectedConversation = useWhatsAppStore((state) => state.selectedConversation);
  const messagesByConversation = useWhatsAppStore((state) => state.messagesByConversation);
  const messagePageByConversation = useWhatsAppStore((state) => state.messagePageByConversation);
  const messageMetaByConversation = useWhatsAppStore((state) => state.messageMetaByConversation);
  const messagesStatus = useWhatsAppStore((state) => state.messagesStatus);
  const messagesError = useWhatsAppStore((state) => state.messagesError);
  const markReadError = useWhatsAppStore((state) => state.markReadError);
  const sending = useWhatsAppStore((state) => state.sending);
  const sendError = useWhatsAppStore((state) => state.sendError);
  const realtimeStatus = useWhatsAppStore((state) => state.realtimeStatus);
  const sendText = useWhatsAppStore((state) => state.sendText);
  const sendTemplate = useWhatsAppStore((state) => state.sendTemplate);
  const sendMedia = useWhatsAppStore((state) => state.sendMedia);
  const load = useWhatsAppStore((state) => state.load);
  const refresh = useWhatsAppStore((state) => state.refresh);
  const setSearch = useWhatsAppStore((state) => state.setSearch);
  const setUnreadFilter = useWhatsAppStore((state) => state.setUnreadFilter);
  const loadMoreConversations = useWhatsAppStore((state) => state.loadMoreConversations);
  const selectConversation = useWhatsAppStore((state) => state.selectConversation);
  const clearSelection = useWhatsAppStore((state) => state.clearSelection);
  const loadOlderMessages = useWhatsAppStore((state) => state.loadOlderMessages);

  const selectSim = useWhatsAppSimulationStore((state) => state.selectConversation);
  const clearSim = useWhatsAppSimulationStore((state) => state.clearSelection);
  const loadOlderSim = useWhatsAppSimulationStore((state) => state.loadOlderMessages);
  const setSimSearch = useWhatsAppSimulationStore((state) => state.setSearch);
  const setSimUnread = useWhatsAppSimulationStore((state) => state.setUnread);
  const sendSim = useWhatsAppSimulationStore((state) => state.sendText);
  const sendSimTemplate = useWhatsAppSimulationStore((state) => state.sendTemplate);
  const sendSimMedia = useWhatsAppSimulationStore((state) => state.sendMedia);
  const simSetConnection = useWhatsAppSimulationStore((state) => state.setConnectionState);
  const simLink = useWhatsAppSimulationStore((state) => state.linkCustomer);
  const simUnlink = useWhatsAppSimulationStore((state) => state.unlinkCustomer);
  const simTemplates = useWhatsAppSimulationStore((state) => state.templates);

  useEffect(() => {
    if (!isAllowed || simulationActive) return;
    void load();
  }, [isAllowed, simulationActive, load]);

  useEffect(() => {
    if (!isAllowed || simulationActive || sessionStatus === "unauthenticated") {
      return;
    }
    return acquireWhatsAppRealtime({
      onEvent: (event) => {
        void useWhatsAppStore.getState().applyRealtimeEvent(event);
      },
      onStatus: (status) => {
        useWhatsAppStore.getState().setRealtimeStatus(status);
      },
      onReconnect: () => {
        void useWhatsAppStore.getState().reconcileRealtime();
      },
    });
  }, [isAllowed, simulationActive, sessionStatus]);

  const simulatedConversations = useMemo(() => {
    if (!simulatedInbox) return [];
    return filterSimulatedConversations(simulatedInbox, simulatedSearch, simulatedUnread);
  }, [simulatedInbox, simulatedSearch, simulatedUnread]);

  const displayConversations = selectWhatsAppPresentation(
    conversations,
    simulationActive,
    simulatedConversations,
  );
  const displayConnection = selectWhatsAppPresentation(
    connection,
    simulationActive,
    simulatedInbox?.connection ?? null,
  );
  const displaySelectedId = selectWhatsAppPresentation(
    selectedConversationId,
    simulationActive,
    simulatedSelectedId,
  );
  const realSelected = keepSelectedIfMissingFromList(conversations, selectedConversation);
  const simSelected = keepSelectedIfMissingFromList(
    simulatedConversations,
    simulatedSelectedDetail(simulatedInbox, simulatedSelectedId),
  );
  const displaySelected = selectWhatsAppPresentation(
    realSelected,
    simulationActive,
    simSelected,
  );

  const realMessages = selectedConversationId
    ? (messagesByConversation[selectedConversationId] ?? [])
    : [];
  const simAll =
    simulatedSelectedId && simulatedInbox
      ? (simulatedInbox.messages[simulatedSelectedId] ?? [])
      : [];
  const simPage = simulatedSelectedId ? (simulatedPages[simulatedSelectedId] ?? 1) : 1;
  const simMessages = simulatedMessagesForPage(simAll, simPage);
  const displayMessages = selectWhatsAppPresentation(
    realMessages,
    simulationActive,
    simMessages,
  );
  const displayQuery = selectWhatsAppPresentation(query, simulationActive, {
    search: simulatedSearch,
    unread: simulatedUnread,
    page: 1,
    pageSize: WHATSAPP_PAGE_SIZE,
  });

  const realPage = selectedConversationId
    ? (messagePageByConversation[selectedConversationId] ?? 1)
    : 1;
  const realTotalPages = selectedConversationId
    ? (messageMetaByConversation[selectedConversationId]?.totalPages ?? 1)
    : 1;
  const realHasOlder = Boolean(selectedConversationId && realPage < realTotalPages);
  const simHasOlder = simAll.length > simPage * WHATSAPP_MESSAGE_PAGE_SIZE;
  const eligibility =
    displaySelected && "messagingEligibility" in displaySelected
      ? displaySelected.messagingEligibility
      : null;
  const canSend = Boolean(
    displaySelectedId &&
      eligibility?.canSendText &&
      (simulationActive
        ? true
        : hasSendPermission && isClientSendWindowStillOpen(eligibility.windowExpiresAt)),
  );
  const canSendTemplate = Boolean(
    displaySelectedId &&
      eligibility?.canSendTemplate &&
      (simulationActive ? true : hasSendPermission),
  );
  const canSendMedia = Boolean(
    displaySelectedId &&
      eligibility?.canSendMedia &&
      (simulationActive
        ? true
        : hasSendPermission && isClientSendWindowStillOpen(eligibility.windowExpiresAt)),
  );

  return useMemo(
    () => ({
      connection: displayConnection,
      conversations: displayConversations,
      conversationMeta: simulationActive
        ? {
            page: 1,
            pageSize: Math.max(displayConversations.length, 1),
            total: displayConversations.length,
            totalPages: 1,
          }
        : conversationMeta,
      query: displayQuery,
      selectedConversationId: displaySelectedId,
      selectedConversation: displaySelected,
      messages: displayMessages,
      hasOlderMessages: simulationActive ? simHasOlder : realHasOlder,
      isAllowed,
      isConnectionLoading:
        !simulationActive &&
        (connectionStatus === "loading" || (isAllowed && connectionStatus === "idle")),
      isListLoading:
        !simulationActive &&
        (listStatus === "loading" || (isAllowed && listStatus === "idle")),
      isMessagesLoading:
        !simulationActive &&
        (messagesStatus === "loading" ||
          (Boolean(displaySelectedId) && messagesStatus === "idle")),
      isRefreshing:
        !simulationActive && (connectionStatus === "loading" || listStatus === "loading"),
      connectionError: simulationActive ? null : connectionError,
      listError: simulationActive ? null : listError,
      messagesError: simulationActive ? null : messagesError,
      markReadError: simulationActive ? null : markReadError,
      sendError: simulationActive ? null : sendError,
      sending: simulationActive ? false : sending,
      canSend,
      canSendTemplate,
      canSendMedia,
      hasSendPermission,
      hasManageConnectionPermission,
      hasLinkCustomerPermission,
      simulationActive,
      simulationEnabled,
      simulationTemplates: simulationActive ? simTemplates : [],
      realtimeStatus,
      load,
      refresh,
      applySearch: (search: string) => {
        if (simulationActive) {
          setSimSearch(search);
          return;
        }
        setSearch(search);
      },
      setUnreadFilter: (unread: boolean) => {
        if (simulationActive) {
          setSimUnread(unread);
          return;
        }
        setUnreadFilter(unread);
      },
      loadMoreConversations: async () => {
        if (simulationActive) return;
        await loadMoreConversations();
      },
      selectConversation: (id: string) => {
        if (simulationActive) {
          selectSim(id);
          return;
        }
        selectConversation(id);
      },
      clearSelection: () => {
        if (simulationActive) {
          clearSim();
          return;
        }
        clearSelection();
      },
      loadOlderMessages: async () => {
        if (simulationActive) {
          loadOlderSim();
          return;
        }
        await loadOlderMessages();
      },
      sendText: async (text: string, idempotencyKey: string) => {
        if (!displaySelectedId) return false;
        if (simulationActive) {
          return sendSim(displaySelectedId, text);
        }
        return sendText(displaySelectedId, text, idempotencyKey);
      },
      sendTemplate: async (input, idempotencyKey) => {
        if (!displaySelectedId) return false;
        if (simulationActive) {
          return sendSimTemplate(displaySelectedId, input);
        }
        return sendTemplate(displaySelectedId, input, idempotencyKey);
      },
      sendMedia: async (input, idempotencyKey) => {
        if (!displaySelectedId) return false;
        if (simulationActive) {
          return sendSimMedia(displaySelectedId, input);
        }
        return sendMedia(displaySelectedId, input, idempotencyKey);
      },
      simulationSetConnection: simSetConnection,
      simulationLinkCustomer: simLink,
      simulationUnlinkCustomer: simUnlink,
    }),
    [
      displayConnection,
      displayConversations,
      conversationMeta,
      displayQuery,
      displaySelectedId,
      displaySelected,
      displayMessages,
      simulationActive,
      simHasOlder,
      realHasOlder,
      isAllowed,
      connectionStatus,
      listStatus,
      messagesStatus,
      connectionError,
      listError,
      messagesError,
      markReadError,
      sendError,
      sending,
      canSend,
      canSendTemplate,
      canSendMedia,
      hasSendPermission,
      hasManageConnectionPermission,
      hasLinkCustomerPermission,
      simulationEnabled,
      realtimeStatus,
      load,
      refresh,
      setSearch,
      setSimSearch,
      setUnreadFilter,
      setSimUnread,
      loadMoreConversations,
      selectConversation,
      selectSim,
      clearSelection,
      clearSim,
      loadOlderMessages,
      loadOlderSim,
      sendText,
      sendSim,
      sendTemplate,
      sendSimTemplate,
      sendMedia,
      sendSimMedia,
      simTemplates,
      simSetConnection,
      simLink,
      simUnlink,
    ],
  );
}
