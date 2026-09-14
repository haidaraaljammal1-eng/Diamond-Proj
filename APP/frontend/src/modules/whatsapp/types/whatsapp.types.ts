export const WHATSAPP_PAGE_SIZE = 20;
export const WHATSAPP_MESSAGE_PAGE_SIZE = 20;
/** Official Cloud API text body maximum. Backend remains authoritative. */
export const WHATSAPP_TEXT_BODY_MAX = 4096;

export type WhatsAppMessageSendState = "PENDING" | "ACCEPTED" | "FAILED" | "UNKNOWN";

export type WhatsAppMessagingEligibilityReason =
  | "READY"
  | "NO_ACTIVE_CONNECTION"
  | "CONNECTION_INACTIVE"
  | "WEBHOOK_NOT_ACTIVE"
  | "CUSTOMER_SERVICE_WINDOW_CLOSED"
  | "CUSTOMER_SERVICE_WINDOW_UNKNOWN"
  | "PROVIDER_NOT_CONFIGURED";

export interface WhatsAppMessagingEligibility {
  canSendText: boolean;
  canSendMedia: boolean;
  canSendTemplate: boolean;
  reason: WhatsAppMessagingEligibilityReason;
  windowExpiresAt: string | null;
}

export type WhatsAppConnectionStatus =
  | "DISCONNECTED"
  | "LINKING"
  | "LINKED"
  | "REAUTH_REQUIRED"
  | "ERROR";

export type WhatsAppWebhookStatus =
  | "NOT_CONFIGURED"
  | "PENDING"
  | "ACTIVE"
  | "ERROR";

export type WhatsAppMessageType =
  | "TEXT"
  | "IMAGE"
  | "DOCUMENT"
  | "AUDIO"
  | "VIDEO"
  | "LOCATION"
  | "CONTACTS"
  | "INTERACTIVE"
  | "REACTION"
  | "STICKER"
  | "TEMPLATE"
  | "UNKNOWN";

export type WhatsAppMessageDirection = "INBOUND" | "OUTBOUND";

export type WhatsAppMessageProviderStatus =
  | "PENDING"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED";

export type WhatsAppConversationFilter = "all" | "unread";

export interface WhatsAppPageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface WhatsAppConnectionDto {
  status: WhatsAppConnectionStatus;
  provider: "META_CLOUD_API";
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  businessAccountName: string | null;
  connectedAt: string | null;
  connectedBy: { id: number; name: string | null } | null;
  lastValidatedAt: string | null;
  webhookStatus: WhatsAppWebhookStatus;
  lastWebhookAt: string | null;
}

export interface WhatsAppConversationConnectionDto {
  displayPhoneNumber: string | null;
  verifiedName: string | null;
}

export interface WhatsAppConversationListItemDto {
  id: string;
  customerWaId: string;
  customerDisplayName: string | null;
  lastMessagePreview: string | null;
  lastMessageType: WhatsAppMessageType | null;
  lastMessageAt: string | null;
  unreadCount: number;
  lastInboundAt: string | null;
  customerLinked: boolean;
  connection: WhatsAppConversationConnectionDto;
}

export interface WhatsAppLinkedCustomerDto {
  id: number;
  name: string;
  mobile: string | null;
  externalId: string | null;
}

export interface WhatsAppConversationDetailDto extends WhatsAppConversationListItemDto {
  lastReadAt: string | null;
  createdAt: string;
  customerLink: {
    linked: boolean;
    customer: WhatsAppLinkedCustomerDto | null;
    linkedAt: string | null;
  };
  messagingEligibility: WhatsAppMessagingEligibility;
}

export interface WhatsAppMessageDto {
  id: string;
  direction: WhatsAppMessageDirection;
  messageType: WhatsAppMessageType;
  textBody: string | null;
  caption: string | null;
  mediaFilename: string | null;
  mediaMimeType: string | null;
  mediaSizeBytes: number | null;
  hasProtectedMedia: boolean;
  templateName: string | null;
  templateLanguage: string | null;
  templatePreview: string | null;
  location: {
    latitude: number | null;
    longitude: number | null;
    name: string | null;
    address: string | null;
  } | null;
  contacts: { formattedName: string | null; phones: string[] }[] | null;
  reaction: { emoji: string | null; referencedProviderMessageId: string | null } | null;
  interactive: { kind: string | null; title: string | null } | null;
  providerOccurredAt: string | null;
  receivedAt: string;
  providerStatus: WhatsAppMessageProviderStatus | null;
  sendState: WhatsAppMessageSendState | null;
}

export interface WhatsAppTemplateDto {
  providerTemplateId: string;
  name: string;
  language: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED" | "OTHER";
  category: string | null;
  sendable: boolean;
  bodyText: string | null;
  headerText: string | null;
  footerText: string | null;
  bodyVariableCount: number;
  headerVariableCount: number;
}

export interface WhatsAppCustomerMatchDto {
  state: "NO_MATCH" | "NO_SAFE_MATCH" | "ONE_MATCH" | "AMBIGUOUS";
  customer: WhatsAppLinkedCustomerDto | null;
}

export interface WhatsAppConnectionAttemptStartDto {
  attemptId: string;
  state: string;
  expiresAt: string;
  provider: "META_CLOUD_API";
  bootstrap: {
    appId: string | null;
    graphApiVersion: string;
    configId: string | null;
  };
}

export interface WhatsAppGrantedChoiceDto {
  wabaId: string;
  businessName: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string | null;
}

export interface WhatsAppSendResult {
  message: WhatsAppMessageDto;
  conversation: WhatsAppConversationDetailDto;
}

export interface WhatsAppListQuery {
  search: string;
  unread: boolean;
  page: number;
  pageSize: number;
}

export interface WhatsAppMessageQuery {
  page: number;
  pageSize: number;
}

export type WhatsAppLoadStatus = "idle" | "loading" | "ready" | "error";

export type WhatsAppConnectionBanner =
  | "none"
  | "disconnected"
  | "webhookInactive"
  | "reauth"
  | "error";
