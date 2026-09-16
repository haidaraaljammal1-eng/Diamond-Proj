import { z } from "zod";
import { PaginationQuerySchema } from "src/lib/http/pagination";
import { WHATSAPP_TEXT_BODY_MAX } from "src/modules/whatsapp/whatsapp.constants";

const metaId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[0-9]+$/, "Must be a Meta numeric id");

export const WhatsAppConnectionStatusSchema = z.enum([
  "DISCONNECTED",
  "LINKING",
  "LINKED",
  "REAUTH_REQUIRED",
  "ERROR",
]);

export const WhatsAppWebhookStatusSchema = z.enum([
  "NOT_CONFIGURED",
  "PENDING",
  "ACTIVE",
  "ERROR",
]);

export const WhatsAppConnectedBySchema = z
  .object({
    id: z.number().int(),
    name: z.string().nullable(),
  })
  .nullable();

export const WhatsAppCapabilitySchema = z.object({
  provider: z.enum(["META_CLOUD", "ULTRAMSG"]),
  supportsQrAuthentication: z.boolean(),
  supportsEmbeddedSignup: z.boolean(),
  supportsFreeText: z.boolean(),
  supportsTemplates: z.boolean(),
  requiresCustomerServiceWindow: z.boolean(),
  supportsImage: z.boolean(),
  supportsDocument: z.boolean(),
  supportsAudio: z.boolean(),
  supportsVideo: z.boolean(),
  supportsProviderReadReceipt: z.boolean(),
  supportsWebhookReceived: z.boolean(),
  supportsWebhookCreate: z.boolean(),
  supportsWebhookAck: z.boolean(),
});

export const WhatsAppProviderSessionStatusSchema = z.enum([
  "INITIALIZING",
  "QR_REQUIRED",
  "RETRYING",
  "LOADING",
  "AUTHENTICATED",
  "DISCONNECTED",
  "STANDBY",
  "UNKNOWN",
]);

export const WhatsAppConnectionSchema = z.object({
  status: WhatsAppConnectionStatusSchema,
  provider: z.enum(["META_CLOUD_API", "ULTRAMSG"]),
  displayPhoneNumber: z.string().nullable(),
  verifiedName: z.string().nullable(),
  businessAccountName: z.string().nullable(),
  connectedAt: z.date().nullable(),
  connectedBy: WhatsAppConnectedBySchema,
  lastValidatedAt: z.date().nullable(),
  webhookStatus: WhatsAppWebhookStatusSchema,
  lastWebhookAt: z.date().nullable(),
  providerSessionStatus: WhatsAppProviderSessionStatusSchema.nullable(),
  capabilities: WhatsAppCapabilitySchema,
});

export const WhatsAppQrSchema = z.object({
  imageDataUrl: z.string().nullable(),
  qrCode: z.string().nullable(),
});

export const WhatsAppConnectionAttemptStartSchema = z.object({
  attemptId: z.string().uuid(),
  state: z.string(),
  expiresAt: z.date(),
  provider: z.literal("META_CLOUD_API"),
  bootstrap: z.object({
    appId: z.string().nullable(),
    graphApiVersion: z.string(),
    configId: z.string().nullable(),
  }),
});

export const WhatsAppGrantedChoiceSchema = z.object({
  wabaId: z.string(),
  businessName: z.string().nullable(),
  phoneNumberId: z.string(),
  displayPhoneNumber: z.string(),
  verifiedName: z.string().nullable(),
});

export const WhatsAppAuthorizeResponseSchema = z.object({
  attemptId: z.string().uuid(),
  choices: z.array(WhatsAppGrantedChoiceSchema),
});

export const WhatsAppAuthorizeBodySchema = z.object({
  authorizationCode: z
    .string()
    .trim()
    .min(1)
    .max(4096)
    .describe("Single-use Meta authorization code. Exchanged server-side. Never logged."),
  state: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .describe("One-time connection state returned when the attempt was created."),
});

export const WhatsAppSelectBodySchema = z.object({
  wabaId: metaId,
  phoneNumberId: metaId,
});

export type WhatsAppConnectionDto = z.infer<typeof WhatsAppConnectionSchema>;
export type WhatsAppAuthorizeBody = z.infer<typeof WhatsAppAuthorizeBodySchema>;
export type WhatsAppSelectBody = z.infer<typeof WhatsAppSelectBodySchema>;

export const WhatsAppMessageTypeSchema = z.enum([
  "TEXT",
  "IMAGE",
  "DOCUMENT",
  "AUDIO",
  "VIDEO",
  "LOCATION",
  "CONTACTS",
  "INTERACTIVE",
  "REACTION",
  "STICKER",
  "TEMPLATE",
  "UNKNOWN",
]);

export const WhatsAppMessageDirectionSchema = z.enum(["INBOUND", "OUTBOUND"]);

export const WhatsAppMessageProviderStatusSchema = z.enum([
  "PENDING",
  "SENT",
  "DELIVERED",
  "READ",
  "FAILED",
]);

export const WhatsAppConversationConnectionSchema = z.object({
  displayPhoneNumber: z.string().nullable(),
  verifiedName: z.string().nullable(),
});

export const WhatsAppConversationListItemSchema = z.object({
  id: z.string().uuid(),
  customerWaId: z.string(),
  customerDisplayName: z.string().nullable(),
  lastMessagePreview: z.string().nullable(),
  lastMessageType: WhatsAppMessageTypeSchema.nullable(),
  lastMessageAt: z.date().nullable(),
  unreadCount: z.number().int().nonnegative(),
  lastInboundAt: z.date().nullable(),
  customerLinked: z.boolean(),
  connection: WhatsAppConversationConnectionSchema,
});

export const WhatsAppLinkedCustomerSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    mobile: z.string().nullable(),
    externalId: z.string().nullable(),
  })
  .nullable();

export const WhatsAppConversationDetailSchema = WhatsAppConversationListItemSchema.extend({
  lastReadAt: z.date().nullable(),
  createdAt: z.date(),
  customerLink: z.object({
    linked: z.boolean(),
    customer: WhatsAppLinkedCustomerSchema,
    linkedAt: z.date().nullable(),
  }),
  messagingEligibility: z.object({
    canSendText: z.boolean(),
    canSendMedia: z.boolean(),
    canSendTemplate: z.boolean(),
    reason: z.enum([
      "READY",
      "NO_ACTIVE_CONNECTION",
      "CONNECTION_INACTIVE",
      "WEBHOOK_NOT_ACTIVE",
      "CUSTOMER_SERVICE_WINDOW_CLOSED",
      "CUSTOMER_SERVICE_WINDOW_UNKNOWN",
      "PROVIDER_NOT_CONFIGURED",
      "PROVIDER_NOT_AUTHENTICATED",
      "QR_REQUIRED",
    ]),
    windowExpiresAt: z.date().nullable(),
  }),
});

export const WhatsAppMessageSendStateSchema = z.enum([
  "PENDING",
  "ACCEPTED",
  "FAILED",
  "UNKNOWN",
]);

export const WhatsAppMessageSchema = z.object({
  id: z.string().uuid(),
  direction: WhatsAppMessageDirectionSchema,
  messageType: WhatsAppMessageTypeSchema,
  textBody: z.string().nullable(),
  caption: z.string().nullable(),
  mediaFilename: z.string().nullable(),
  mediaMimeType: z.string().nullable(),
  mediaSizeBytes: z.number().int().nullable(),
  hasProtectedMedia: z.boolean(),
  templateName: z.string().nullable(),
  templateLanguage: z.string().nullable(),
  templatePreview: z.string().nullable(),
  location: z
    .object({
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      name: z.string().nullable(),
      address: z.string().nullable(),
    })
    .nullable(),
  contacts: z
    .array(
      z.object({
        formattedName: z.string().nullable(),
        phones: z.array(z.string()),
      }),
    )
    .nullable(),
  reaction: z
    .object({
      emoji: z.string().nullable(),
      referencedProviderMessageId: z.string().nullable(),
    })
    .nullable(),
  interactive: z
    .object({
      kind: z.string().nullable(),
      title: z.string().nullable(),
    })
    .nullable(),
  providerOccurredAt: z.date().nullable(),
  receivedAt: z.date(),
  providerStatus: WhatsAppMessageProviderStatusSchema.nullable(),
  sendState: WhatsAppMessageSendStateSchema.nullable(),
});

export const WhatsAppSendTextBodySchema = z
  .object({
    text: z.string().min(1).max(WHATSAPP_TEXT_BODY_MAX),
  })
  .strict();

export const WhatsAppSendMessageResponseSchema = z.object({
  message: WhatsAppMessageSchema,
  conversation: WhatsAppConversationDetailSchema,
});

export const WhatsAppIdempotencyHeadersSchema = z
  .object({
    "idempotency-key": z.string().trim().min(8).max(128),
  })
  .passthrough();

export const ListWhatsAppConversationsQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().min(1).max(100).optional(),
  unread: z.enum(["true", "false"]).optional(),
});

export const ListWhatsAppMessagesQuerySchema = PaginationQuerySchema;

export const WhatsAppTemplateSchema = z.object({
  providerTemplateId: z.string(),
  name: z.string(),
  language: z.string(),
  status: z.enum(["APPROVED", "PENDING", "REJECTED", "PAUSED", "DISABLED", "OTHER"]),
  category: z.string().nullable(),
  sendable: z.boolean(),
  bodyText: z.string().nullable(),
  headerText: z.string().nullable(),
  footerText: z.string().nullable(),
  bodyVariableCount: z.number().int().nonnegative(),
  headerVariableCount: z.number().int().nonnegative(),
});

export const WhatsAppSendTemplateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(512),
    language: z.string().trim().min(1).max(32),
    headerParameters: z.array(z.string().min(1).max(1024)).max(10).optional(),
    bodyParameters: z.array(z.string().min(1).max(1024)).max(20).optional(),
  })
  .strict();

export const WhatsAppCustomerMatchSchema = z.object({
  state: z.enum(["NO_MATCH", "NO_SAFE_MATCH", "ONE_MATCH", "AMBIGUOUS"]),
  customer: WhatsAppLinkedCustomerSchema,
});

export const WhatsAppCustomerLinkBodySchema = z
  .object({
    customerId: z.number().int().positive(),
  })
  .strict();

export type WhatsAppConversationListItemDto = z.infer<typeof WhatsAppConversationListItemSchema>;
export type WhatsAppConversationDetailDto = z.infer<typeof WhatsAppConversationDetailSchema>;
export type WhatsAppMessageDto = z.infer<typeof WhatsAppMessageSchema>;
export type ListWhatsAppConversationsQuery = z.infer<typeof ListWhatsAppConversationsQuerySchema>;
export type ListWhatsAppMessagesQuery = z.infer<typeof ListWhatsAppMessagesQuerySchema>;
export type WhatsAppTemplateDto = z.infer<typeof WhatsAppTemplateSchema>;
export type WhatsAppSendTemplateBody = z.infer<typeof WhatsAppSendTemplateBodySchema>;
export type WhatsAppCustomerMatchDto = z.infer<typeof WhatsAppCustomerMatchSchema>;
