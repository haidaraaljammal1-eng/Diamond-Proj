import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { PERMISSIONS } from "src/constants/permissions";
import { requireAuth } from "src/lib/context/auth-context";
import { UuidIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { whatsappSendRateLimit } from "src/plugins/rate-limit";
import { AppError } from "src/lib/errors/app-error";
import { createWhatsAppConversationService } from "src/modules/whatsapp/whatsapp.conversation.service";
import { createWhatsAppCustomerService } from "src/modules/whatsapp/whatsapp.customer.service";
import { createWhatsAppSendService } from "src/modules/whatsapp/whatsapp.send.service";
import {
  ListWhatsAppConversationsQuerySchema,
  ListWhatsAppMessagesQuerySchema,
  WhatsAppConversationDetailSchema,
  WhatsAppConversationListItemSchema,
  WhatsAppCustomerLinkBodySchema,
  WhatsAppCustomerMatchSchema,
  WhatsAppIdempotencyHeadersSchema,
  WhatsAppMessageSchema,
  WhatsAppSendMessageResponseSchema,
  WhatsAppSendTemplateBodySchema,
  WhatsAppSendTextBodySchema,
} from "src/modules/whatsapp/whatsapp.schema";

const T = ["WhatsApp"];

export default async function whatsappConversationRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const conversations = createWhatsAppConversationService(fastify);
  const send = createWhatsAppSendService(fastify);
  const customers = createWhatsAppCustomerService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List WhatsApp conversations (office unread, sanitized)",
        operationId: "listWhatsAppConversations",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_READ],
        querystring: ListWhatsAppConversationsQuerySchema,
        response: {
          200: listResponse(WhatsAppConversationListItemSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => conversations.list(request.query),
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "WhatsApp conversation detail",
        operationId: "getWhatsAppConversation",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_READ],
        params: UuidIdParam,
        response: {
          200: dataResponse(WhatsAppConversationDetailSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await conversations.getById(request.params.id, requireAuth(request)) }),
  );

  app.get(
    "/:id/messages",
    {
      schema: {
        summary: "Paginated WhatsApp messages (newest first)",
        operationId: "listWhatsAppMessages",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_READ],
        params: UuidIdParam,
        querystring: ListWhatsAppMessagesQuerySchema,
        response: {
          200: listResponse(WhatsAppMessageSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => conversations.listMessages(request.params.id, request.query),
  );

  app.post(
    "/:id/read",
    {
      schema: {
        summary: "Mark conversation read in Diamond (does not send a Meta read receipt)",
        operationId: "markWhatsAppConversationRead",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_READ],
        params: UuidIdParam,
        response: {
          200: dataResponse(WhatsAppConversationDetailSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      const data = await conversations.markRead(request.params.id, identity.id, (partial) =>
        request.setAudit(partial),
        identity,
      );
      return { data };
    },
  );

  app.post(
    "/:id/messages",
    {
      config: whatsappSendRateLimit(),
      schema: {
        summary: "Send a manual WhatsApp text message (staff only; not a template)",
        operationId: "sendWhatsAppTextMessage",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_SEND],
        params: UuidIdParam,
        headers: WhatsAppIdempotencyHeadersSchema,
        body: WhatsAppSendTextBodySchema,
        response: {
          200: dataResponse(WhatsAppSendMessageResponseSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      const key = request.headers["idempotency-key"];
      const data = await send.sendText({
        conversationId: request.params.id,
        text: request.body.text,
        actorUserId: identity.id,
        idempotencyKey: typeof key === "string" ? key : undefined,
        audit: (partial) => request.setAudit(partial),
      });
      return { data };
    },
  );

  app.post(
    "/:id/template-messages",
    {
      config: whatsappSendRateLimit(),
      schema: {
        summary: "Send an approved WhatsApp template in an existing conversation",
        operationId: "sendWhatsAppTemplateMessage",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_SEND],
        params: UuidIdParam,
        headers: WhatsAppIdempotencyHeadersSchema,
        body: WhatsAppSendTemplateBodySchema,
        response: {
          200: dataResponse(WhatsAppSendMessageResponseSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      const key = request.headers["idempotency-key"];
      const data = await send.sendTemplate({
        conversationId: request.params.id,
        name: request.body.name,
        language: request.body.language,
        headerParameters: request.body.headerParameters ?? [],
        bodyParameters: request.body.bodyParameters ?? [],
        actorUserId: identity.id,
        idempotencyKey: typeof key === "string" ? key : undefined,
        audit: (partial) => request.setAudit(partial),
      });
      return { data };
    },
  );

  app.post(
    "/:id/media-messages",
    {
      config: whatsappSendRateLimit(),
      schema: {
        summary: "Send WhatsApp image, document, audio, or video in an open 24-hour window",
        operationId: "sendWhatsAppMediaMessage",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_SEND],
        params: UuidIdParam,
        headers: WhatsAppIdempotencyHeadersSchema,
        consumes: ["multipart/form-data"],
        response: {
          200: dataResponse(WhatsAppSendMessageResponseSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      const file = await request.file();
      if (!file) throw AppError.validation("A media file is required");
      const bytes = await file.toBuffer();
      const fields = file.fields as Record<string, { value?: string } | undefined>;
      const caption =
        typeof fields?.caption?.value === "string" ? fields.caption.value : null;
      const requestedKind =
        typeof fields?.messageType?.value === "string" ? fields.messageType.value : "IMAGE";
      const key = request.headers["idempotency-key"];
      const data = await send.sendMedia({
        conversationId: request.params.id,
        bytes,
        declaredMime: file.mimetype,
        filename: file.filename,
        requestedKind,
        caption,
        actorUserId: identity.id,
        idempotencyKey: typeof key === "string" ? key : undefined,
        audit: (partial) => request.setAudit(partial),
      });
      return { data };
    },
  );

  app.get(
    "/:id/customer-match",
    {
      schema: {
        summary: "Safe read-only Diamond Customer match suggestion for a WhatsApp conversation",
        operationId: "getWhatsAppCustomerMatch",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_READ],
        params: UuidIdParam,
        response: {
          200: dataResponse(WhatsAppCustomerMatchSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await customers.match(request.params.id, requireAuth(request)) }),
  );

  app.post(
    "/:id/customer-link",
    {
      schema: {
        summary: "Explicitly link a WhatsApp conversation to a Diamond Customer",
        operationId: "linkWhatsAppConversationCustomer",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_LINK_CUSTOMER],
        params: UuidIdParam,
        body: WhatsAppCustomerLinkBodySchema,
        response: {
          200: dataResponse(WhatsAppConversationDetailSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      const data = await customers.link(
        request.params.id,
        request.body.customerId,
        identity,
        (partial) => request.setAudit(partial),
      );
      return { data };
    },
  );

  app.delete(
    "/:id/customer-link",
    {
      schema: {
        summary: "Remove the WhatsApp conversation Customer link (does not mutate Customer)",
        operationId: "unlinkWhatsAppConversationCustomer",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_LINK_CUSTOMER],
        params: UuidIdParam,
        response: {
          200: dataResponse(WhatsAppConversationDetailSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      const data = await customers.unlink(request.params.id, identity, (partial) =>
        request.setAudit(partial),
      );
      return { data };
    },
  );
}
