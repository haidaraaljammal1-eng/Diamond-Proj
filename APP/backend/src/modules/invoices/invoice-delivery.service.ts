import type { FastifyInstance } from "fastify";
import type { AuthUser } from "src/lib/context/auth-context";
import { AppError } from "src/lib/errors/app-error";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { withTransaction } from "src/lib/db/transaction";
import { createInvoiceIssuanceService } from "src/modules/invoices/invoice-issuance.service";
import { createInvoicePdfService } from "src/modules/invoices/invoice-pdf.service";
import { mapInvoiceDeliveryFromWhatsAppMessage } from "src/modules/invoices/invoice-delivery-whatsapp-map";
import { buildInvoiceWhatsAppMessage } from "src/modules/invoices/invoice-whatsapp-message";
import { findOperationalWhatsAppConnection } from "src/modules/invoices/invoice-whatsapp-connection";
import { resolveInvoiceWhatsAppConversation } from "src/modules/invoices/invoice-whatsapp-conversation";
import {
  invoiceDeliveryIdempotencyMismatchError,
  invoiceWhatsAppDeliveryInFlightError,
  invoiceWhatsAppDeliveryUncertainError,
  invoiceNotFoundError,
  invoiceNotIssuedError,
  invoiceSupersededError,
  whatsAppProviderUnconfiguredError,
} from "src/modules/invoices/invoices.errors";
import { createWhatsAppProvider } from "src/modules/whatsapp/whatsapp.provider";
import { createWhatsAppSendService } from "src/modules/whatsapp/whatsapp.send.service";
const INVOICE_WHATSAPP_DELIVERY_LOCK_NS = "invoice_whatsapp_delivery";

function failureContextFromAppError(err: AppError): { failureCode: string; failureMessage: string } {
  const reason =
    typeof err.context?.reason === "string" ? err.context.reason : err.code ?? "DELIVERY_FAILED";
  return {
    failureCode: reason,
    failureMessage: err.message.slice(0, 240),
  };
}

export function createInvoiceDeliveryService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const pdf = createInvoicePdfService(fastify);
  const issuance = createInvoiceIssuanceService(fastify);
  const whatsappSend = createWhatsAppSendService(fastify);

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
      if (!invoice.isCurrent) throw invoiceSupersededError();

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

      const guard = await withTransaction(prisma, async (tx) => {
        await acquireAdvisoryLock(tx, INVOICE_WHATSAPP_DELIVERY_LOCK_NS, invoiceId);
        const uncertain = await tx.invoiceDelivery.findFirst({
          where: {
            invoiceId,
            channel: "WHATSAPP",
            status: "SENDING",
            failureCode: "SEND_UNKNOWN",
          },
        });
        if (idempotencyKey) {
          const existing = await tx.invoiceDelivery.findUnique({
            where: { idempotencyKey },
          });
          if (existing) {
            if (existing.invoiceId !== invoiceId) throw invoiceDeliveryIdempotencyMismatchError();
            return { action: "return" as const, delivery: existing };
          }
        }
        if (uncertain) throw invoiceWhatsAppDeliveryUncertainError();
        const inFlightRows = await tx.invoiceDelivery.findMany({
          where: {
            invoiceId,
            channel: "WHATSAPP",
            status: { in: ["PENDING", "SENDING"] },
          },
          select: { id: true, failureCode: true },
        });
        const inFlight = inFlightRows.find((row) => row.failureCode !== "SEND_UNKNOWN");
        if (inFlight) throw invoiceWhatsAppDeliveryInFlightError();
        const delivery = await tx.invoiceDelivery.create({
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
        return { action: "continue" as const, delivery };
      });
      if (guard.action === "return") return guard.delivery;

      const delivery = guard.delivery;

      const providerName = createWhatsAppProvider().name;
      const sendIdempotencyKey = idempotencyKey ?? `invoice-delivery:${delivery.id}`;

      const markFailed = async (failureCode: string, failureMessage: string) =>
        prisma.invoiceDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "FAILED",
            failedAt: new Date(),
            failureCode,
            failureMessage,
            provider: providerName,
          },
        });

      try {
        const connection = await findOperationalWhatsAppConnection(prisma);
        if (!connection) throw whatsAppProviderUnconfiguredError();

        const { buffer, filename } = await pdf.generateInvoicePdf(invoiceId);
        await prisma.invoiceDelivery.update({
          where: { id: delivery.id },
          data: { status: "SENDING" },
        });

        const { conversationId } = await resolveInvoiceWhatsAppConversation(prisma, {
          connectionId: connection.id,
          customerId: invoice.customerId,
          mobile: phone,
        });

        const sendResult = await whatsappSend.sendMedia({
          conversationId,
          bytes: buffer,
          declaredMime: "application/pdf",
          filename,
          requestedKind: "DOCUMENT",
          caption: message,
          actorUserId: actor.id,
          idempotencyKey: sendIdempotencyKey,
          audit: () => {},
        });

        const persisted = await prisma.whatsAppMessage.findUnique({
          where: { id: sendResult.message.id },
          select: { providerMessageId: true },
        });
        const patch = mapInvoiceDeliveryFromWhatsAppMessage(
          sendResult.message,
          persisted?.providerMessageId ?? null,
        );
        return prisma.invoiceDelivery.update({
          where: { id: delivery.id },
          data: {
            ...patch,
            provider: providerName,
          },
        });
      } catch (err) {
        if (err instanceof AppError) {
          const { failureCode, failureMessage } = failureContextFromAppError(err);
          await markFailed(failureCode, failureMessage);
          throw err;
        }
        if (isUniqueViolation(err) && idempotencyKey) {
          const raced = await prisma.invoiceDelivery.findUnique({ where: { idempotencyKey } });
          if (raced) {
            if (raced.invoiceId !== invoiceId) throw invoiceDeliveryIdempotencyMismatchError();
            return raced;
          }
        }
        const code =
          err instanceof Error && "code" in err ? String((err as { code?: string }).code) : "DELIVERY_FAILED";
        return markFailed(code, err instanceof Error ? err.message.slice(0, 240) : "Delivery failed");
      }
    },
  };
}
