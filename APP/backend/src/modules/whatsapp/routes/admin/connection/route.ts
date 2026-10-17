import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { PERMISSIONS } from "src/constants/permissions";
import { requireAuth } from "src/lib/context/auth-context";
import { UuidIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { sensitiveMutationRateLimit } from "src/plugins/rate-limit";
import { createWhatsAppConnectionService } from "src/modules/whatsapp/whatsapp.service";
import {
  WhatsAppAuthorizeBodySchema,
  WhatsAppAuthorizeResponseSchema,
  WhatsAppConnectionAttemptStartSchema,
  WhatsAppConnectionSchema,
  WhatsAppQrSchema,
  WhatsAppSelectBodySchema,
  WhatsAppWhapiConfigureBodySchema,
  WhatsAppHistorySyncStatusSchema,
  WhatsAppHistorySyncStartBodySchema,
} from "src/modules/whatsapp/whatsapp.schema";
import { createWhatsAppHistorySyncService } from "src/modules/whatsapp/whatsapp.history-sync.service";

const T = ["WhatsApp"];

export default async function whatsappConnectionRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const whatsapp = createWhatsAppConnectionService(fastify);
  const historySync = createWhatsAppHistorySyncService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "Current office WhatsApp connection (sanitized; not messaging-ready)",
        operationId: "getWhatsAppConnection",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_READ, PERMISSIONS.WHATSAPP_MANAGE_CONNECTION],
        response: {
          200: dataResponse(WhatsAppConnectionSchema),
          ...commonErrorResponses,
        },
      },
    },
    async () => ({ data: await whatsapp.getConnection() }),
  );

  app.get(
    "/qr",
    {
      schema: {
        summary: "WhatsApp QR representation for session authentication",
        operationId: "getWhatsAppConnectionQr",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_MANAGE_CONNECTION],
        response: {
          200: dataResponse(WhatsAppQrSchema),
          ...commonErrorResponses,
        },
      },
    },
    async () => ({ data: await whatsapp.getQr() }),
  );

  app.post(
    "/whapi",
    {
      config: sensitiveMutationRateLimit(),
      schema: {
        summary: "Validate and activate the office Whapi channel",
        operationId: "configureWhapiConnection",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_MANAGE_CONNECTION],
        body: WhatsAppWhapiConfigureBodySchema,
        response: {
          200: dataResponse(WhatsAppConnectionSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      const data = await whatsapp.configureWhapi(identity.id, request.body, (partial) =>
        request.setAudit(partial),
      );
      return { data };
    },
  );

  app.post(
    "/bootstrap",
    {
      config: sensitiveMutationRateLimit(),
      schema: {
        summary: "Configure the office WhatsApp connection from server-side provider credentials",
        operationId: "bootstrapWhatsAppConnection",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_MANAGE_CONNECTION],
        response: {
          200: dataResponse(WhatsAppConnectionSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      const data = await whatsapp.bootstrap(identity.id, (partial) => request.setAudit(partial));
      return { data };
    },
  );

  app.post(
    "/attempts",
    {
      config: sensitiveMutationRateLimit(),
      schema: {
        summary: "Start a short-lived WhatsApp connection attempt",
        operationId: "startWhatsAppConnectionAttempt",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_MANAGE_CONNECTION],
        response: {
          200: dataResponse(WhatsAppConnectionAttemptStartSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      const data = await whatsapp.startAttempt(identity.id, (partial) =>
        request.setAudit(partial),
      );
      return { data };
    },
  );

  app.post(
    "/attempts/:id/authorize",
    {
      config: sensitiveMutationRateLimit(),
      schema: {
        summary: "Exchange a Meta authorization code server-side and list granted numbers",
        operationId: "authorizeWhatsAppConnectionAttempt",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_MANAGE_CONNECTION],
        params: UuidIdParam,
        body: WhatsAppAuthorizeBodySchema,
        response: {
          200: dataResponse(WhatsAppAuthorizeResponseSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      const data = await whatsapp.authorize(
        identity.id,
        request.params.id,
        request.body,
        (partial) => request.setAudit(partial),
      );
      return { data };
    },
  );

  app.post(
    "/attempts/:id/select",
    {
      config: sensitiveMutationRateLimit(),
      schema: {
        summary: "Select a server-validated WABA and phone number as the office connection",
        operationId: "selectWhatsAppConnection",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_MANAGE_CONNECTION],
        params: UuidIdParam,
        body: WhatsAppSelectBodySchema,
        response: {
          200: dataResponse(WhatsAppConnectionSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      const data = await whatsapp.select(
        identity.id,
        request.params.id,
        request.body,
        (partial) => request.setAudit(partial),
      );
      return { data };
    },
  );

  app.post(
    "/disconnect",
    {
      config: sensitiveMutationRateLimit(),
      schema: {
        summary: "Disconnect the office WhatsApp connection locally (does not change Meta)",
        operationId: "disconnectWhatsAppConnection",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_MANAGE_CONNECTION],
        response: {
          200: dataResponse(WhatsAppConnectionSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      const data = await whatsapp.disconnect(identity.id, (partial) =>
        request.setAudit(partial),
      );
      return { data };
    },
  );

  app.get(
    "/history-sync",
    {
      schema: {
        summary: "Whapi history import status for the current office connection",
        operationId: "getWhatsAppHistorySyncStatus",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_READ, PERMISSIONS.WHATSAPP_MANAGE_CONNECTION],
        response: {
          200: dataResponse(WhatsAppHistorySyncStatusSchema),
          ...commonErrorResponses,
        },
      },
    },
    async () => ({ data: await historySync.getStatus() }),
  );

  app.post(
    "/history-sync/start",
    {
      config: sensitiveMutationRateLimit(),
      schema: {
        summary: "Queue or run Whapi 1:1 history import for the current connection",
        operationId: "startWhatsAppHistorySync",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_MANAGE_CONNECTION],
        body: WhatsAppHistorySyncStartBodySchema,
        response: {
          200: dataResponse(WhatsAppHistorySyncStatusSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      request.setAudit({
        action: "WHATSAPP_HISTORY_SYNC_STARTED",
        entityType: "WhatsAppConnection",
        metadata: {
          execute: request.body.execute ?? true,
          mode: request.body.mode ?? "auto",
        },
      });
      const data = await historySync.start(
        identity.id,
        request.body.execute ?? true,
        request.body.mode,
      );
      return { data };
    },
  );

  app.post(
    "/history-sync/cancel",
    {
      config: sensitiveMutationRateLimit(),
      schema: {
        summary: "Request cancellation of an in-flight Whapi history import",
        operationId: "cancelWhatsAppHistorySync",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_MANAGE_CONNECTION],
        response: {
          200: dataResponse(WhatsAppHistorySyncStatusSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      const data = await historySync.cancel(identity.id);
      return { data };
    },
  );

  app.post(
    "/webhook/activate",
    {
      config: sensitiveMutationRateLimit(),
      schema: {
        summary: "Subscribe the linked WABA to this Meta app and verify webhook subscription",
        operationId: "activateWhatsAppWebhook",
        tags: T,
        permissions: [PERMISSIONS.WHATSAPP_MANAGE_CONNECTION],
        response: {
          200: dataResponse(WhatsAppConnectionSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const identity = requireAuth(request);
      const data = await whatsapp.activateWebhook(identity.id, (partial) =>
        request.setAudit(partial),
      );
      return { data };
    },
  );
}
