import type { FastifyInstance } from "fastify";
import { PERMISSIONS } from "src/constants/permissions";
import { AppError } from "src/lib/errors/app-error";
import { hasPermission, type AuthUser } from "src/lib/context/auth-context";
import { withTransaction } from "src/lib/db/transaction";
import {
  assertCustomerVisible,
} from "src/modules/customers/customer-scope";
import { WHATSAPP_AUDIT } from "src/modules/whatsapp/whatsapp.constants";
import {
  classifyExactPhoneMatches,
  phoneDigitsForMatch,
} from "src/modules/whatsapp/whatsapp.customer-match";
import { whatsappError } from "src/modules/whatsapp/whatsapp.errors";
import { toConversationDetail } from "src/modules/whatsapp/whatsapp.mapper";
import { writeWhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime-outbox";
import { publishWhatsAppRealtime } from "src/modules/whatsapp/whatsapp.realtime-publisher";
import { createWhatsAppConversationService } from "src/modules/whatsapp/whatsapp.conversation.service";
import type { AuditContext } from "src/types/fastify";

type AuditWrite = (partial: Partial<AuditContext>) => void;

export function createWhatsAppCustomerService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const conversations = createWhatsAppConversationService(fastify);

  async function match(conversationId: string, auth: AuthUser) {
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, customerWaId: true },
    });
    if (!conversation) throw whatsappError.conversationNotFound();
    const waDigits = phoneDigitsForMatch(conversation.customerWaId);
    if (!waDigits) {
      return { state: "NO_SAFE_MATCH" as const, customer: null };
    }
    const mobileVariants = [
      conversation.customerWaId,
      `+${conversation.customerWaId.replace(/^\+/, "")}`,
      waDigits,
      `+${waDigits}`,
    ];
    const canReadCustomers = hasPermission(auth, PERMISSIONS.CUSTOMERS_READ);
    const rows = await prisma.customer.findMany({
      where: { mobile: { in: [...new Set(mobileVariants)] } },
      select: { id: true, name: true, mobile: true, externalId: true },
    });
    const matches = rows.filter((row) => phoneDigitsForMatch(row.mobile) === waDigits);
    const state = classifyExactPhoneMatches(matches.length);
    if (state !== "ONE_MATCH") {
      return { state, customer: null };
    }
    const row = matches[0]!;
    if (!canReadCustomers) {
      return { state, customer: null };
    }
    try {
      await assertCustomerVisible(prisma, row.id, auth);
    } catch {
      return { state, customer: null };
    }
    return {
      state,
      customer: {
        id: row.id,
        name: row.name,
        mobile: row.mobile,
        externalId: row.externalId,
      },
    };
  }

  async function link(
    conversationId: string,
    customerId: number,
    auth: AuthUser,
    audit: AuditWrite,
  ) {
    if (!hasPermission(auth, PERMISSIONS.CUSTOMERS_READ)) {
      throw AppError.forbidden();
    }
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    });
    if (!conversation) throw whatsappError.conversationNotFound();
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) throw whatsappError.customerNotFound();
    await assertCustomerVisible(prisma, customerId, auth);

    const events = await withTransaction(prisma, async (tx) => {
      await tx.whatsAppConversation.update({
        where: { id: conversationId },
        data: {
          customerId,
          customerLinkedAt: new Date(),
          customerLinkedByUserId: auth.id,
        },
      });
      const event = await writeWhatsAppRealtimeEvent(tx, {
        type: "whatsapp.conversation.updated",
        dedupeKey: `whatsapp.conversation.updated:${conversationId}:customer-link`,
        conversationId,
      });
      return event ? [event] : [];
    });
    publishWhatsAppRealtime(events);
    audit({
      action: WHATSAPP_AUDIT.CUSTOMER_LINKED,
      entityType: "WhatsAppConversation",
      entityId: conversationId,
      metadata: { conversationId, customerId, actorUserId: auth.id },
    });
    return conversations.getById(conversationId, auth);
  }

  async function unlink(conversationId: string, auth: AuthUser, audit: AuditWrite) {
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, customerId: true },
    });
    if (!conversation) throw whatsappError.conversationNotFound();
    const previousCustomerId = conversation.customerId;
    const events = await withTransaction(prisma, async (tx) => {
      await tx.whatsAppConversation.update({
        where: { id: conversationId },
        data: {
          customerId: null,
          customerLinkedAt: null,
          customerLinkedByUserId: null,
        },
      });
      const event = await writeWhatsAppRealtimeEvent(tx, {
        type: "whatsapp.conversation.updated",
        dedupeKey: `whatsapp.conversation.updated:${conversationId}:customer-unlink`,
        conversationId,
      });
      return event ? [event] : [];
    });
    publishWhatsAppRealtime(events);
    audit({
      action: WHATSAPP_AUDIT.CUSTOMER_UNLINKED,
      entityType: "WhatsAppConversation",
      entityId: conversationId,
      metadata: {
        conversationId,
        customerId: previousCustomerId,
        actorUserId: auth.id,
      },
    });
    return conversations.getById(conversationId, auth);
  }

  return { match, link, unlink };
}
