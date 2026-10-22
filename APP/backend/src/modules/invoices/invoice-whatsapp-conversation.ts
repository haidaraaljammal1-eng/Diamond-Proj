import type { PrismaClient } from "@prisma/client";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { phoneDigitsForMatch } from "src/modules/whatsapp/whatsapp.customer-match";
import {
  invoiceCustomerPhoneMissingError,
  invoiceWhatsAppRecipientAmbiguousError,
} from "src/modules/invoices/invoices.errors";

type ConversationRecipientRow = {
  id: string;
  customerWaId: string;
  customerId: number | null;
  providerChatId: string | null;
};

/**
 * Recipient identity is reliable only when customerWaId normalizes to the same digits as Customer.mobile.
 * Opaque ids (`@lid`, etc.) never prove phone equality — staff link alone is insufficient for invoice send.
 */
export function invoiceConversationRecipientMatchesMobile(
  conversation: Pick<ConversationRecipientRow, "customerWaId" | "providerChatId">,
  mobileDigits: string,
  _staffLinked: boolean,
): boolean {
  const waDigits = phoneDigitsForMatch(conversation.customerWaId);
  if (waDigits) return waDigits === mobileDigits;
  const chatDigits = phoneDigitsForMatch(conversation.providerChatId);
  if (chatDigits) return chatDigits === mobileDigits;
  return false;
}

/**
 * Resolve or create an **unlinked** DIRECT conversation for invoice delivery.
 * Never assigns customerId — staff linking remains a separate inbox action.
 */
export async function resolveInvoiceWhatsAppConversation(
  prisma: PrismaClient,
  input: { connectionId: string; customerId: number; mobile: string },
): Promise<{ conversationId: string }> {
  const mobileDigits = phoneDigitsForMatch(input.mobile);
  if (!mobileDigits) throw invoiceCustomerPhoneMissingError();

  const linkedRows = await prisma.whatsAppConversation.findMany({
    where: {
      connectionId: input.connectionId,
      customerId: input.customerId,
      kind: "DIRECT",
    },
    orderBy: { lastMessageAt: "desc" },
    select: {
      id: true,
      customerWaId: true,
      customerId: true,
      providerChatId: true,
    },
  });

  const linkedMatches = linkedRows.filter((row) =>
    invoiceConversationRecipientMatchesMobile(row, mobileDigits, true),
  );
  if (linkedMatches.length > 1) throw invoiceWhatsAppRecipientAmbiguousError();
  if (linkedMatches.length === 1) {
    return { conversationId: linkedMatches[0]!.id };
  }
  if (linkedRows.length > 0) {
    throw invoiceWhatsAppRecipientAmbiguousError();
  }

  const byWa = await prisma.whatsAppConversation.findMany({
    where: {
      connectionId: input.connectionId,
      kind: "DIRECT",
      customerWaId: mobileDigits,
    },
    select: {
      id: true,
      customerWaId: true,
      customerId: true,
      providerChatId: true,
    },
  });

  if (byWa.length > 1) throw invoiceWhatsAppRecipientAmbiguousError();
  if (byWa.length === 1) {
    const row = byWa[0]!;
    if (row.customerId != null && row.customerId !== input.customerId) {
      throw invoiceWhatsAppRecipientAmbiguousError();
    }
    if (!invoiceConversationRecipientMatchesMobile(row, mobileDigits, row.customerId != null)) {
      throw invoiceWhatsAppRecipientAmbiguousError();
    }
    return { conversationId: row.id };
  }

  try {
    const created = await prisma.whatsAppConversation.create({
      data: {
        connectionId: input.connectionId,
        kind: "DIRECT",
        customerWaId: mobileDigits,
        unreadCount: 0,
      },
      select: { id: true },
    });
    return { conversationId: created.id };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const raced = await prisma.whatsAppConversation.findUnique({
      where: {
        connectionId_customerWaId: {
          connectionId: input.connectionId,
          customerWaId: mobileDigits,
        },
      },
      select: {
        id: true,
        customerWaId: true,
        customerId: true,
        providerChatId: true,
      },
    });
    if (!raced) throw err;
    if (raced.customerId != null && raced.customerId !== input.customerId) {
      throw invoiceWhatsAppRecipientAmbiguousError();
    }
    if (!invoiceConversationRecipientMatchesMobile(raced, mobileDigits, raced.customerId != null)) {
      throw invoiceWhatsAppRecipientAmbiguousError();
    }
    return { conversationId: raced.id };
  }
}
