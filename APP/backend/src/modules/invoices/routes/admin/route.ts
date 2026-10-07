import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { UuidIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { requireAuth } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";
import { createInvoiceService } from "src/modules/invoices/invoice.service";
import { createInvoicePdfService } from "src/modules/invoices/invoice-pdf.service";
import { createInvoiceDeliveryService } from "src/modules/invoices/invoice-delivery.service";
import {
  InvoiceDeliverySchema,
  InvoiceDetailSchema,
  InvoiceListItemSchema,
  InvoiceListQuerySchema,
  WhatsAppDeliveryRequestSchema,
} from "src/modules/invoices/invoices.schema";
import { z } from "zod";

const T = ["Invoices"];

export default async function invoiceRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const invoices = createInvoiceService(fastify);
  const pdf = createInvoicePdfService(fastify);
  const deliveries = createInvoiceDeliveryService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List customer invoices",
        operationId: "listInvoices",
        tags: T,
        permissions: [PERMISSIONS.INVOICES_READ],
        querystring: InvoiceListQuerySchema,
        response: {
          200: listResponse(InvoiceListItemSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => invoices.list(request.query),
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Invoice detail",
        operationId: "getInvoice",
        tags: T,
        permissions: [PERMISSIONS.INVOICES_READ],
        params: UuidIdParam,
        response: {
          200: dataResponse(InvoiceDetailSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await invoices.getDetail(request.params.id) }),
  );

  app.get(
    "/:id/pdf",
    {
      schema: {
        summary: "Download invoice PDF",
        operationId: "getInvoicePdf",
        tags: T,
        permissions: [PERMISSIONS.INVOICES_READ],
        params: UuidIdParam,
        querystring: z.object({ download: z.coerce.boolean().optional() }),
      },
    },
    async (request, reply) => {
      const { buffer, filename } = await pdf.generateInvoicePdf(request.params.id);
      const disposition = request.query.download ? "attachment" : "inline";
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `${disposition}; filename="${filename}"`)
        .send(buffer);
    },
  );

  app.get(
    "/:id/deliveries",
    {
      schema: {
        summary: "Invoice delivery history",
        operationId: "listInvoiceDeliveries",
        tags: T,
        permissions: [PERMISSIONS.INVOICES_READ],
        params: UuidIdParam,
        response: {
          200: dataResponse(z.array(InvoiceDeliverySchema)),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({
      data: await deliveries.listDeliveries(request.params.id),
    }),
  );

  app.post(
    "/:id/deliveries/whatsapp",
    {
      schema: {
        summary: "Send invoice PDF via WhatsApp",
        operationId: "sendInvoiceWhatsApp",
        tags: T,
        permissions: [PERMISSIONS.INVOICES_SEND_WHATSAPP],
        params: UuidIdParam,
        body: WhatsAppDeliveryRequestSchema,
        response: {
          200: dataResponse(InvoiceDeliverySchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      request.setAudit?.({
        action: "INVOICE_WHATSAPP_SEND_REQUESTED",
        entityType: "invoice",
        entityId: request.params.id,
      });
      const headerKey = request.headers["idempotency-key"];
      const idempotencyKey =
        request.body.idempotencyKey ??
        (typeof headerKey === "string" ? headerKey : undefined);
      const row = await deliveries.requestWhatsAppDelivery(
        request.params.id,
        actor,
        idempotencyKey,
      );
      return { data: row };
    },
  );
}
