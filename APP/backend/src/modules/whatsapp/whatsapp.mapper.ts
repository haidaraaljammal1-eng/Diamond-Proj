import type { Prisma, WhatsAppConnection, User } from "@prisma/client";
import { WHATSAPP_PROTECTED_MEDIA_TYPES, WHATSAPP_PROVIDER } from "src/modules/whatsapp/whatsapp.constants";
import type {
  WhatsAppConnectionDto,
  WhatsAppConversationDetailDto,
  WhatsAppConversationListItemDto,
  WhatsAppMessageDto,
} from "src/modules/whatsapp/whatsapp.schema";
import type { WhatsAppMessagingEligibility } from "src/modules/whatsapp/whatsapp.eligibility";
import type { WhatsAppGrantedPhone, WhatsAppGrantedWaba } from "src/modules/whatsapp/whatsapp.types";

export function toConnectionDto(
  row:
    | (Pick<
        WhatsAppConnection,
        | "status"
        | "displayPhoneNumber"
        | "verifiedName"
        | "businessAccountName"
        | "connectedAt"
        | "lastValidatedAt"
        | "webhookStatus"
        | "lastWebhookAt"
      > & { connectedBy?: Pick<User, "id" | "name"> | null })
    | null,
): WhatsAppConnectionDto {
  if (!row) {
    return {
      status: "DISCONNECTED",
      provider: WHATSAPP_PROVIDER,
      displayPhoneNumber: null,
      verifiedName: null,
      businessAccountName: null,
      connectedAt: null,
      connectedBy: null,
      lastValidatedAt: null,
      webhookStatus: "NOT_CONFIGURED",
      lastWebhookAt: null,
    };
  }
  return {
    status: row.status,
    provider: WHATSAPP_PROVIDER,
    displayPhoneNumber: row.displayPhoneNumber,
    verifiedName: row.verifiedName,
    businessAccountName: row.businessAccountName,
    connectedAt: row.connectedAt,
    connectedBy: row.connectedBy ? { id: row.connectedBy.id, name: row.connectedBy.name } : null,
    lastValidatedAt: row.lastValidatedAt,
    webhookStatus: row.webhookStatus,
    lastWebhookAt: row.lastWebhookAt,
  };
}

export function toSelectableChoices(
  wabas: WhatsAppGrantedWaba[],
  phones: WhatsAppGrantedPhone[],
) {
  const nameByWaba = new Map(wabas.map((w) => [w.wabaId, w.businessName]));
  return phones.map((phone) => ({
    wabaId: phone.wabaId,
    businessName: nameByWaba.get(phone.wabaId) ?? null,
    phoneNumberId: phone.phoneNumberId,
    displayPhoneNumber: phone.displayPhoneNumber,
    verifiedName: phone.verifiedName,
  }));
}

type ConversationRow = {
  id: string;
  customerWaId: string;
  customerDisplayName: string | null;
  lastMessagePreview: string | null;
  lastMessageType: WhatsAppConversationListItemDto["lastMessageType"];
  lastMessageAt: Date | null;
  unreadCount: number;
  lastInboundAt: Date | null;
  lastReadAt?: Date | null;
  createdAt?: Date;
  customerId?: number | null;
  customerLinkedAt?: Date | null;
  customer?: {
    id: number;
    name: string;
    mobile: string | null;
    externalId: string | null;
  } | null;
  connection: { displayPhoneNumber: string | null; verifiedName: string | null };
};

export function toConversationListItem(row: ConversationRow): WhatsAppConversationListItemDto {
  return {
    id: row.id,
    customerWaId: row.customerWaId,
    customerDisplayName: row.customerDisplayName,
    lastMessagePreview: row.lastMessagePreview,
    lastMessageType: row.lastMessageType,
    lastMessageAt: row.lastMessageAt,
    unreadCount: row.unreadCount,
    lastInboundAt: row.lastInboundAt,
    customerLinked: Boolean(row.customerId),
    connection: {
      displayPhoneNumber: row.connection.displayPhoneNumber,
      verifiedName: row.connection.verifiedName,
    },
  };
}

export function toConversationDetail(
  row: ConversationRow & { lastReadAt: Date | null; createdAt: Date },
  eligibility: WhatsAppMessagingEligibility,
  customerVisible = false,
): WhatsAppConversationDetailDto {
  const linked = Boolean(row.customerId);
  return {
    ...toConversationListItem(row),
    lastReadAt: row.lastReadAt,
    createdAt: row.createdAt,
    customerLink: {
      linked,
      customer: linked && customerVisible && row.customer
        ? {
            id: row.customer.id,
            name: row.customer.name,
            mobile: row.customer.mobile,
            externalId: row.customer.externalId,
          }
        : null,
      linkedAt: row.customerLinkedAt ?? null,
    },
    messagingEligibility: eligibility,
  };
}

function asDisplayPayload(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as {
    location?: WhatsAppMessageDto["location"];
    contacts?: WhatsAppMessageDto["contacts"];
    reaction?: WhatsAppMessageDto["reaction"];
    interactive?: WhatsAppMessageDto["interactive"];
  };
}

export function toMessageDto(row: {
  id: string;
  direction: WhatsAppMessageDto["direction"];
  messageType: WhatsAppMessageDto["messageType"];
  textBody: string | null;
  caption?: string | null;
  mediaFilename?: string | null;
  mediaMimeType?: string | null;
  mediaSizeBytes?: number | null;
  providerMediaId?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  templatePreview?: string | null;
  displayPayload?: Prisma.JsonValue | null;
  providerOccurredAt: Date | null;
  receivedAt: Date;
  providerStatus: WhatsAppMessageDto["providerStatus"];
  sendState?: WhatsAppMessageDto["sendState"] | null;
}): WhatsAppMessageDto {
  const payload = asDisplayPayload(row.displayPayload);
  const protectedType = WHATSAPP_PROTECTED_MEDIA_TYPES.includes(
    row.messageType as (typeof WHATSAPP_PROTECTED_MEDIA_TYPES)[number],
  );
  return {
    id: row.id,
    direction: row.direction,
    messageType: row.messageType,
    textBody: row.textBody,
    caption: row.caption ?? null,
    mediaFilename: row.mediaFilename ?? null,
    mediaMimeType: row.mediaMimeType ?? null,
    mediaSizeBytes: row.mediaSizeBytes ?? null,
    hasProtectedMedia: Boolean(row.providerMediaId) && protectedType,
    templateName: row.templateName ?? null,
    templateLanguage: row.templateLanguage ?? null,
    templatePreview: row.templatePreview ?? null,
    location: payload?.location ?? null,
    contacts: payload?.contacts ?? null,
    reaction: payload?.reaction ?? null,
    interactive: payload?.interactive ?? null,
    providerOccurredAt: row.providerOccurredAt,
    receivedAt: row.receivedAt,
    providerStatus: row.providerStatus,
    sendState: row.sendState ?? null,
  };
}
