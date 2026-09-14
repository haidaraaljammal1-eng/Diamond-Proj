import type {
  WhatsAppConnectionDto,
  WhatsAppConversationDetailDto,
  WhatsAppConversationListItemDto,
  WhatsAppMessageDto,
  WhatsAppMessagingEligibility,
  WhatsAppTemplateDto,
} from "../types/whatsapp.types.ts";
import { blankWhatsAppMessageFields } from "../utils/whatsapp-view-model.ts";

export const WHATSAPP_SIMULATION_ID_PREFIX = "sim-wa-";

const OFFICE = {
  displayPhoneNumber: "15550000000",
  verifiedName: "Demo Office Line",
};

function iso(minutesAgo: number): string {
  return new Date(Date.UTC(2026, 8, 12, 17, 0, 0) - minutesAgo * 60_000).toISOString();
}

function conversation(
  id: string,
  waId: string,
  name: string | null,
  unread: number,
  preview: string | null,
  type: WhatsAppConversationListItemDto["lastMessageType"],
  lastAt: string,
): WhatsAppConversationListItemDto {
  return {
    id: `${WHATSAPP_SIMULATION_ID_PREFIX}${id}`,
    customerWaId: waId,
    customerDisplayName: name,
    lastMessagePreview: preview,
    lastMessageType: type,
    lastMessageAt: lastAt,
    unreadCount: unread,
    lastInboundAt: lastAt,
    customerLinked: false,
    connection: OFFICE,
  };
}

function text(
  id: string,
  direction: WhatsAppMessageDto["direction"],
  body: string,
  minutesAgo: number,
  status: WhatsAppMessageDto["providerStatus"] = null,
): WhatsAppMessageDto {
  return {
    id: `${WHATSAPP_SIMULATION_ID_PREFIX}msg-${id}`,
    direction,
    messageType: "TEXT",
    textBody: body,
    ...blankWhatsAppMessageFields(),
    providerOccurredAt: iso(minutesAgo),
    receivedAt: iso(minutesAgo),
    providerStatus: status,
    sendState: direction === "OUTBOUND" ? (status ? "ACCEPTED" : "PENDING") : null,
  };
}

function typed(
  id: string,
  type: WhatsAppMessageDto["messageType"],
  minutesAgo: number,
): WhatsAppMessageDto {
  return {
    id: `${WHATSAPP_SIMULATION_ID_PREFIX}msg-${id}`,
    direction: "INBOUND",
    messageType: type,
    textBody: null,
    ...blankWhatsAppMessageFields(),
    hasProtectedMedia: type === "IMAGE" || type === "DOCUMENT" || type === "AUDIO" || type === "VIDEO",
    providerOccurredAt: iso(minutesAgo),
    receivedAt: iso(minutesAgo),
    providerStatus: null,
    sendState: null,
  };
}

export interface WhatsAppSimulationInbox {
  connection: WhatsAppConnectionDto;
  conversations: WhatsAppConversationListItemDto[];
  details: Record<string, WhatsAppConversationDetailDto>;
  messages: Record<string, WhatsAppMessageDto[]>;
}

export function isWhatsAppSimulationId(id: string): boolean {
  return id.startsWith(WHATSAPP_SIMULATION_ID_PREFIX);
}

export function buildWhatsAppSimulationInbox(): WhatsAppSimulationInbox {
  const north = conversation("north", "15550001001", "Demo North Desk", 3, "Is the Patrol available today?", "TEXT", iso(4));
  north.customerLinked = true;
  const harbor = conversation("harbor", "15550001002", "Demo Harbor Contact", 1, null, "IMAGE", iso(40));
  const ledger = conversation("ledger", "15550001003", "Demo Ledger Desk", 0, null, "DOCUMENT", iso(80));
  const long = conversation(
    "long",
    "15550001004",
    "Demo Longform Contact",
    2,
    "Need a seven-seat vehicle for a family visit next week and also a child seat if you have one available at the office.",
    "TEXT",
    iso(12),
  );
  const thread = conversation("thread", "15550001005", "Demo Thread Archive", 0, "See you at 10:00.", "TEXT", iso(180));
  const voice = conversation("voice", "15550001006", null, 12, null, "AUDIO", iso(9));
  const unknown = conversation("unknown", "15550001007", "Demo Unknown Type", 0, null, "UNKNOWN", iso(400));
  const burst = conversation("burst", "15550001008", "Demo Burst Inbox", 120, "Checking availability again", "TEXT", iso(2));

  const conversations = [burst, north, voice, long, harbor, ledger, thread, unknown];

  const messages: Record<string, WhatsAppMessageDto[]> = {
    [north.id]: [
      text("n1", "INBOUND", "Hello, this is a synthetic demo inbound.", 90),
      text("n2", "OUTBOUND", "Welcome. How can the office help?", 80, "READ"),
      text("n3", "INBOUND", "Is the Patrol available today?", 4),
    ],
    [harbor.id]: [
      typed("h1", "IMAGE", 40),
      {
        ...typed("h-fail", "IMAGE", 38),
        id: `${WHATSAPP_SIMULATION_ID_PREFIX}msg-h-fail`,
        direction: "OUTBOUND",
        sendState: "FAILED",
        hasProtectedMedia: false,
      },
      {
        ...typed("h-unknown", "DOCUMENT", 36),
        id: `${WHATSAPP_SIMULATION_ID_PREFIX}msg-h-unknown`,
        direction: "OUTBOUND",
        sendState: "UNKNOWN",
        hasProtectedMedia: false,
      },
    ],
    [ledger.id]: [typed("l1", "DOCUMENT", 80), typed("l2", "VIDEO", 70)],
    [long.id]: [
      text(
        "lf1",
        "INBOUND",
        "Need a seven-seat vehicle for a family visit next week and also a child seat if you have one available at the office.\nPlease confirm the daily rate and whether delivery to the hotel is possible.",
        12,
      ),
    ],
    [thread.id]: [
      text("t1", "INBOUND", "Can we collect at 10:00?", 240),
      text("t2", "OUTBOUND", "Yes, the office will be ready.", 220, "DELIVERED"),
      text("t3", "INBOUND", "See you at 10:00.", 180),
      {
        ...typed("t-loc", "LOCATION", 170),
        location: {
          latitude: 25.2048,
          longitude: 55.2708,
          name: "Demo Office",
          address: "Dubai",
        },
      },
      {
        ...typed("t-sticker", "STICKER", 160),
        hasProtectedMedia: true,
      },
    ],
    [voice.id]: [typed("v1", "AUDIO", 9)],
    [unknown.id]: [typed("u1", "UNKNOWN", 400)],
    [burst.id]: Array.from({ length: 24 }, (_, index) =>
      text(
        `b${index + 1}`,
        index % 5 === 0 ? "OUTBOUND" : "INBOUND",
        index % 5 === 0 ? "Office note recorded in simulation." : `Synthetic inbound ${index + 1}`,
        500 - index * 8,
        index % 5 === 0 ? "SENT" : null,
      ),
    ),
  };

  const details = Object.fromEntries(
    conversations.map((item) => [
      item.id,
      {
        ...item,
        lastReadAt: item.unreadCount === 0 ? iso(200) : null,
        createdAt: iso(800),
        messagingEligibility:
          item.id === unknown.id
            ? {
                canSendText: false,
                canSendMedia: false,
                canSendTemplate: true,
                reason: "CUSTOMER_SERVICE_WINDOW_CLOSED",
                windowExpiresAt: new Date(Date.now() - 60 * 60_000).toISOString(),
              } satisfies WhatsAppMessagingEligibility
            : {
                canSendText: true,
                canSendMedia: true,
                canSendTemplate: true,
                reason: "READY",
                windowExpiresAt: new Date(Date.now() + 12 * 60 * 60_000).toISOString(),
              } satisfies WhatsAppMessagingEligibility,
        customerLink: {
          linked: item.id.endsWith("north"),
          customer: item.id.endsWith("north")
            ? { id: 101, name: "Demo Linked Customer", mobile: "15550001001", externalId: "C-101" }
            : null,
          linkedAt: item.id.endsWith("north") ? iso(500) : null,
        },
      } satisfies WhatsAppConversationDetailDto,
    ]),
  );

  return {
    connection: {
      status: "LINKED",
      provider: "META_CLOUD_API",
      displayPhoneNumber: OFFICE.displayPhoneNumber,
      verifiedName: OFFICE.verifiedName,
      businessAccountName: "Demo WhatsApp Business",
      connectedAt: iso(2000),
      connectedBy: { id: 1, name: "Demo Operator" },
      lastValidatedAt: iso(200),
      webhookStatus: "ACTIVE",
      lastWebhookAt: iso(2),
    },
    conversations,
    details,
    messages,
  };
}

export const WHATSAPP_SIMULATION_TEMPLATES: WhatsAppTemplateDto[] = [
  {
    providerTemplateId: "sim-hello",
    name: "hello_office",
    language: "en",
    status: "APPROVED",
    category: "UTILITY",
    sendable: true,
    bodyText: "Hello {{1}}, the office can help with {{2}}.",
    headerText: null,
    footerText: "Diamond Rent Car",
    bodyVariableCount: 2,
    headerVariableCount: 0,
  },
  {
    providerTemplateId: "sim-pending",
    name: "pending_review",
    language: "en",
    status: "PENDING",
    category: "UTILITY",
    sendable: false,
    bodyText: "Pending",
    headerText: null,
    footerText: null,
    bodyVariableCount: 0,
    headerVariableCount: 0,
  },
];
