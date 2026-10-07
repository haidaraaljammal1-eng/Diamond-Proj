import type {
  WhatsAppConnectionBanner,
  WhatsAppConnectionDto,
  WhatsAppConversationDetailDto,
  WhatsAppConversationListItemDto,
  WhatsAppMessageDto,
  WhatsAppMessageType,
  WhatsAppMessagingEligibility,
  WhatsAppProviderCapabilities,
} from "../types/whatsapp.types.ts";
import { META_CLOUD_CAPABILITIES } from "../types/whatsapp.types.ts";

export function connectionCapabilities(
  connection: WhatsAppConnectionDto | null,
): WhatsAppProviderCapabilities {
  return connection?.capabilities ?? META_CLOUD_CAPABILITIES;
}

export function connectionBanner(connection: WhatsAppConnectionDto | null): WhatsAppConnectionBanner {
  if (!connection || connection.status === "DISCONNECTED") return "disconnected";
  if (connection.status === "REAUTH_REQUIRED") return "reauth";
  if (connection.status === "ERROR") return "error";
  const caps = connectionCapabilities(connection);
  if (caps.supportsQrAuthentication) {
    const session = connection.providerSessionStatus;
    if (session === "QR_REQUIRED") return "qrRequired";
    if (session === "LOADING" || session === "INITIALIZING") return "connecting";
    if (session === "RETRYING") return "retrying";
    if (session === "DISCONNECTED") return "sessionDisconnected";
    if (session === "STANDBY") return "standby";
    if (session === "AUTHENTICATED" && connection.webhookStatus === "ACTIVE") return "none";
    if (session === "AUTHENTICATED") return "webhookInactive";
    return "connecting";
  }
  if (connection.webhookStatus !== "ACTIVE") return "webhookInactive";
  return "none";
}

export function conversationTitle(
  customerDisplayName: string | null | undefined,
  customerWaId: string,
): string {
  const name = customerDisplayName?.trim();
  return name && name.length > 0 ? name : customerWaId;
}

/** Visual only. Never guesses country codes or Diamond Customer ids. */
export function formatCustomerWaId(waId: string): string {
  return waId;
}

export function unreadBadgeLabel(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

export function lastMessagePreviewKind(
  preview: string | null,
  type: WhatsAppMessageType | null,
): { kind: "text"; text: string } | { kind: WhatsAppMessageType } {
  const text = preview?.trim();
  if (text) return { kind: "text", text };
  return { kind: type ?? "UNKNOWN" };
}

export function isCurrentConnectionLinked(connection: WhatsAppConnectionDto | null): boolean {
  if (!connection) return false;
  return (
    connection.status === "LINKED" ||
    connection.status === "LINKING" ||
    connection.status === "REAUTH_REQUIRED" ||
    connection.status === "ERROR"
  );
}

export function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) map.set(item.id, item);
  return [...map.values()];
}

export function applyUnreadZero(
  conversation: WhatsAppConversationListItemDto,
): WhatsAppConversationListItemDto {
  return { ...conversation, unreadCount: 0 };
}

/** Merge fresher list-row presentation fields into an authoritative detail DTO. */
export function mergeConversationListIntoDetail(
  detail: WhatsAppConversationDetailDto,
  listRow: WhatsAppConversationListItemDto,
): WhatsAppConversationDetailDto {
  return {
    ...detail,
    customerWaId: listRow.customerWaId,
    customerDisplayName: listRow.customerDisplayName,
    customerLinked: listRow.customerLinked,
    lastMessagePreview: listRow.lastMessagePreview,
    lastMessageType: listRow.lastMessageType,
    lastMessageAt: listRow.lastMessageAt,
    unreadCount: listRow.unreadCount,
    lastInboundAt: listRow.lastInboundAt,
    connection: listRow.connection,
  };
}

/**
 * Keep the loaded conversation detail when the list refreshes.
 * Never replace a detail DTO with a list row (list rows lack messagingEligibility).
 */
export function reconcileSelectedConversation(
  list: WhatsAppConversationListItemDto[],
  selected: WhatsAppConversationDetailDto | WhatsAppConversationListItemDto | null,
): WhatsAppConversationDetailDto | WhatsAppConversationListItemDto | null {
  if (!selected) return null;
  const listRow = list.find((item) => item.id === selected.id);
  if (isConversationDetail(selected)) {
    return listRow ? mergeConversationListIntoDetail(selected, listRow) : selected;
  }
  return listRow ?? selected;
}

export function isFreeTextSendAllowed(
  eligibility: WhatsAppMessagingEligibility | null,
  input: {
    hasSendPermission: boolean;
    requiresCustomerServiceWindow: boolean;
    simulationActive: boolean;
  },
): boolean {
  if (!eligibility?.canSendText) return false;
  if (input.simulationActive) return true;
  if (!input.hasSendPermission) return false;
  if (!input.requiresCustomerServiceWindow) return true;
  return isClientSendWindowStillOpen(eligibility.windowExpiresAt);
}

export function isMediaSendAllowed(
  eligibility: WhatsAppMessagingEligibility | null,
  input: {
    hasSendPermission: boolean;
    requiresCustomerServiceWindow: boolean;
    simulationActive: boolean;
  },
): boolean {
  if (!eligibility?.canSendMedia) return false;
  if (input.simulationActive) return true;
  if (!input.hasSendPermission) return false;
  if (!input.requiresCustomerServiceWindow) return true;
  return isClientSendWindowStillOpen(eligibility.windowExpiresAt);
}

export function isTemplateSendAllowed(
  eligibility: WhatsAppMessagingEligibility | null,
  input: { hasSendPermission: boolean; simulationActive: boolean },
): boolean {
  if (!eligibility?.canSendTemplate) return false;
  if (input.simulationActive) return true;
  return input.hasSendPermission;
}

/** Milliseconds used for chronological ordering (provider time, then receivedAt). */
export function messageChronologyMillis(
  message: Pick<WhatsAppMessageDto, "providerOccurredAt" | "receivedAt">,
): { primary: number; received: number } {
  const received = toValidDate(message.receivedAt)?.getTime() ?? 0;
  const primary = toValidDate(message.providerOccurredAt)?.getTime() ?? received;
  return { primary, received };
}

/** Deterministic oldest → newest ordering for chat rendering. */
export function compareWhatsAppMessages(a: WhatsAppMessageDto, b: WhatsAppMessageDto): number {
  const aTime = messageChronologyMillis(a);
  const bTime = messageChronologyMillis(b);
  if (aTime.primary !== bTime.primary) return aTime.primary - bTime.primary;
  if (aTime.received !== bTime.received) return aTime.received - bTime.received;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function mergeWhatsAppMessageRecord(
  existing: WhatsAppMessageDto,
  incoming: WhatsAppMessageDto,
): WhatsAppMessageDto {
  return {
    ...existing,
    ...incoming,
    sendState: incoming.sendState ?? existing.sendState,
    providerStatus:
      incoming.providerStatus && incoming.providerStatus !== null
        ? nextClientProviderStatus(existing.providerStatus, incoming.providerStatus)
        : existing.providerStatus,
  };
}

/** Deduplicate by id, merge fields, sort by canonical chronology. */
export function mergeAndSortWhatsAppMessages(
  existing: WhatsAppMessageDto[],
  incoming: WhatsAppMessageDto[],
): WhatsAppMessageDto[] {
  const map = new Map<string, WhatsAppMessageDto>();
  for (const message of existing) map.set(message.id, message);
  for (const message of incoming) {
    const prior = map.get(message.id);
    map.set(message.id, prior ? mergeWhatsAppMessageRecord(prior, message) : message);
  }
  return [...map.values()].sort(compareWhatsAppMessages);
}

/** Backend returns newest-first. Chat UI is oldest → newest. */
export function toChronologicalPage(newestFirst: WhatsAppMessageDto[]): WhatsAppMessageDto[] {
  return mergeAndSortWhatsAppMessages([], newestFirst);
}

export function prependOlderMessages(
  currentChronological: WhatsAppMessageDto[],
  olderNewestFirst: WhatsAppMessageDto[],
): WhatsAppMessageDto[] {
  return mergeAndSortWhatsAppMessages(currentChronological, olderNewestFirst);
}

export function messageTimestamp(message: Pick<WhatsAppMessageDto, "providerOccurredAt" | "receivedAt">): string {
  return message.providerOccurredAt ?? message.receivedAt;
}

export function toValidDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function commitIfCurrent<T>(
  requestId: number,
  currentId: number,
  selectedId: string | null,
  expectedId: string,
  value: T,
): T | undefined {
  if (requestId !== currentId) return undefined;
  if (selectedId !== expectedId) return undefined;
  return value;
}

export function isConversationDetail(
  conversation: WhatsAppConversationDetailDto | WhatsAppConversationListItemDto | null,
): conversation is WhatsAppConversationDetailDto {
  return Boolean(conversation && "messagingEligibility" in conversation);
}

export function conversationEligibility(
  conversation: WhatsAppConversationDetailDto | WhatsAppConversationListItemDto | null,
): WhatsAppMessagingEligibility | null {
  return isConversationDetail(conversation) ? conversation.messagingEligibility : null;
}

/** Advisory UX only. Backend re-validates the 24-hour window on send. */
export function isClientSendWindowStillOpen(
  windowExpiresAt: string | null | undefined,
  now = Date.now(),
): boolean {
  const date = toValidDate(windowExpiresAt);
  if (!date) return true;
  return now < date.getTime();
}

export type WhatsAppOutboundUiStatus =
  | "sending"
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "unknown";

/** ACCEPTED is not SENT. Webhook providerStatus owns Sent/Delivered/Read. */
export function outboundUiStatus(message: WhatsAppMessageDto): WhatsAppOutboundUiStatus | null {
  if (message.direction !== "OUTBOUND") return null;
  if (message.sendState === "FAILED" || message.providerStatus === "FAILED") return "failed";
  if (message.sendState === "UNKNOWN") return "unknown";
  if (message.providerStatus === "READ") return "read";
  if (message.providerStatus === "DELIVERED") return "delivered";
  if (message.providerStatus === "SENT") return "sent";
  if (message.sendState === "PENDING") return "sending";
  if (message.sendState === "ACCEPTED") return "pending";
  return null;
}

export function conversationMatchesSearch(
  conversation: Pick<
    WhatsAppConversationListItemDto,
    "customerWaId" | "customerDisplayName" | "lastMessagePreview"
  >,
  search: string,
): boolean {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  const haystack = [
    conversation.customerWaId,
    conversation.customerDisplayName ?? "",
    conversation.lastMessagePreview ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
}

const PROVIDER_SUCCESS_RANK: Record<string, number> = {
  PENDING: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
};

/** Client-side monotonic merge. Backend remains authoritative. */
export function nextClientProviderStatus(
  current: WhatsAppMessageDto["providerStatus"],
  incoming: NonNullable<WhatsAppMessageDto["providerStatus"]>,
): WhatsAppMessageDto["providerStatus"] {
  if (!current || current === incoming) return incoming;
  if (current === "FAILED") return "FAILED";
  if (incoming === "FAILED") {
    if (current === "DELIVERED" || current === "READ") return current;
    return "FAILED";
  }
  const currentRank = PROVIDER_SUCCESS_RANK[current] ?? -1;
  const incomingRank = PROVIDER_SUCCESS_RANK[incoming] ?? -1;
  return incomingRank >= currentRank ? incoming : current;
}

export function patchOutboundMessage(
  messages: WhatsAppMessageDto[],
  messageId: string,
  patch: {
    sendState?: WhatsAppMessageDto["sendState"];
    providerStatus?: WhatsAppMessageDto["providerStatus"];
  },
): WhatsAppMessageDto[] {
  return messages.map((message) => {
    if (message.id !== messageId) return message;
    return {
      ...message,
      sendState: patch.sendState ?? message.sendState,
      providerStatus:
        patch.providerStatus && patch.providerStatus !== null
          ? nextClientProviderStatus(message.providerStatus, patch.providerStatus)
          : message.providerStatus,
    };
  });
}

export function sortConversationsByRecent(
  conversations: WhatsAppConversationListItemDto[],
): WhatsAppConversationListItemDto[] {
  return [...conversations].sort((a, b) => {
    const aTime = a.lastMessageAt ?? "";
    const bTime = b.lastMessageAt ?? "";
    if (aTime === bTime) return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
    return aTime < bTime ? 1 : -1;
  });
}

export function upsertConversationForRealtime(
  conversations: WhatsAppConversationListItemDto[],
  incoming: WhatsAppConversationListItemDto,
  query: { search: string; unread: boolean },
  selectedConversationId: string | null,
): WhatsAppConversationListItemDto[] {
  if (!conversationMatchesSearch(incoming, query.search)) {
    return conversations.filter((item) => item.id !== incoming.id);
  }
  if (query.unread && incoming.unreadCount <= 0 && incoming.id !== selectedConversationId) {
    return conversations.filter((item) => item.id !== incoming.id);
  }
  return sortConversationsByRecent(mergeById(conversations, [incoming]));
}

export function appendMessageById(
  current: WhatsAppMessageDto[],
  incoming: WhatsAppMessageDto,
): WhatsAppMessageDto[] {
  return mergeAndSortWhatsAppMessages(current, [incoming]);
}

export function blankWhatsAppMessageFields(): Pick<
  WhatsAppMessageDto,
  | "caption"
  | "mediaFilename"
  | "mediaMimeType"
  | "mediaSizeBytes"
  | "hasProtectedMedia"
  | "templateName"
  | "templateLanguage"
  | "templatePreview"
  | "location"
  | "contacts"
  | "reaction"
  | "interactive"
> {
  return {
    caption: null,
    mediaFilename: null,
    mediaMimeType: null,
    mediaSizeBytes: null,
    hasProtectedMedia: false,
    templateName: null,
    templateLanguage: null,
    templatePreview: null,
    location: null,
    contacts: null,
    reaction: null,
    interactive: null,
  };
}
