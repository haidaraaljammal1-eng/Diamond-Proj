import type { FastifyInstance } from "fastify";
import type { AuthUser } from "src/lib/context/auth-context";
import { AppError } from "src/lib/errors/app-error";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { createInvoiceIssuanceService } from "src/modules/invoices/invoice-issuance.service";
import { createInvoicePdfService } from "src/modules/invoices/invoice-pdf.service";
import { buildInvoiceWhatsAppMessage } from "src/modules/invoices/invoice-whatsapp-message";
import { sendInvoiceDocumentViaWhatsApp } from "src/modules/invoices/invoice-whatsapp-delivery.port";
import {
  invoiceNotFoundError,
  invoiceNotIssuedError,
  whatsAppProviderUnconfiguredError,
} from "src/modules/invoices/invoices.errors";

export function createInvoiceDeliveryService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const pdf = createInvoicePdfService(fastify);
  const issuance = createInvoiceIssuanceService(fastify);

  return {
    async listDeliveries(invoiceId: string) {
      const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true } });
      if (!invoice) throw invoiceNotFoundError();
      return prisma.invoiceDelivery.findMany({
        where: { invoiceId },
        orderBy: { createdAt: "desc" },
      });
    },

    async requestWhatsAppDelivery(
      invoiceId: string,
      actor: AuthUser,
      idempotencyKey?: string,
    ) {
      const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) throw invoiceNotFoundError();
      if (invoice.status !== "ISSUED") throw invoiceNotIssuedError();

      const phone = await issuance.resolveCustomerPhone(invoice.customerId);
      const customer = await prisma.customer.findUnique({
        where: { id: invoice.customerId },
        select: { name: true },
      });
      const message = buildInvoiceWhatsAppMessage({
        customerName: invoice.customerNameSnapshot,
        invoiceNumber: invoice.invoiceNumber,
        contractNumber: invoice.contractNumberSnapshot,
        totalAmount: invoice.totalAmount,
        companyDisplayName: invoice.companyDisplayNameSnapshot,
      });

      if (idempotencyKey) {
        const existing = await prisma.invoiceDelivery.findUnique({
          where: { idempotencyKey },
        });
        if (existing && existing.invoiceId === invoiceId) return existing;
      }

      const delivery = await prisma.invoiceDelivery.create({
        data: {
          invoiceId,
          channel: "WHATSAPP",
          status: "PENDING",
          recipientPhoneSnapshot: phone,
          recipientNameSnapshot: customer?.name ?? invoice.customerNameSnapshot,
          messageSnapshot: message,
          requestedByUserId: actor.id,
          idempotencyKey: idempotencyKey ?? null,
        },
      });

      try {
        const { buffer, filename } = await pdf.generateInvoicePdf(invoiceId);
        await prisma.invoiceDelivery.update({
          where: { id: delivery.id },
          data: { status: "SENDING" },
        });

        const result = await sendInvoiceDocumentViaWhatsApp(prisma, {
          recipientPhone: phone,
          filename,
          buffer,
          caption: message,
        });

        if (!result.ok) {
          if (result.code === "NOT_CONFIGURED") throw whatsAppProviderUnconfiguredError();
          return prisma.invoiceDelivery.update({
            where: { id: delivery.id },
            data: {
              status: "FAILED",
              failedAt: new Date(),
              failureCode: result.code,
              failureMessage: result.message,
              provider: result.provider ?? null,
            },
          });
        }

        return prisma.invoiceDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
            provider: result.provider,
            providerMessageId: result.providerMessageId ?? null,
          },
        });
      } catch (err) {
        if (err instanceof AppError) throw err;
        if (isUniqueViolation(err) && idempotencyKey) {
          const raced = await prisma.invoiceDelivery.findUnique({ where: { idempotencyKey } });
          if (raced) return raced;
        }
        const code = err instanceof Error && "code" in err ? String((err as { code?: string }).code) : "DELIVERY_FAILED";
        return prisma.invoiceDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "FAILED",
            failedAt: new Date(),
            failureCode: code,
            failureMessage: err instanceof Error ? err.message.slice(0, 240) : "Delivery failed",
          },
        });
      }
    },
  };
}
