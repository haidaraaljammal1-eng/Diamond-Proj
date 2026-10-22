import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { paginate } from "src/lib/http/pagination";
import { WHATSAPP_CURRENT_STATUSES } from "src/modules/whatsapp/whatsapp.constants";
import {
  customerWaIdFromWhapiChatId,
  isWhapiGroupChatId,
} from "src/modules/whatsapp/whapi.chat-id";

export type ListWhatsAppContactProfilesQuery = {
  search?: string;
  page?: number;
  pageSize?: number;
};

export function createWhatsAppContactProfileService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function list(query: ListWhatsAppContactProfilesQuery) {
    const connection = await prisma.whatsAppConnection.findFirst({
      where: { status: { in: [...WHATSAPP_CURRENT_STATUSES] } },
      select: { id: true },
    });
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 50);

    if (!connection) {
      return { data: [], meta: { page, pageSize, total: 0, totalPages: 1 } };
    }

    const where: Prisma.WhatsAppContactProfileWhereInput = {
      connectionId: connection.id,
      NOT: {
        OR: [
          { providerContactId: { endsWith: "@g.us" } },
          { providerContactId: { contains: "@g.us", mode: "insensitive" } },
        ],
      },
    };

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { whapiDisplayName: { contains: term, mode: "insensitive" } },
        { providerContactId: { contains: term, mode: "insensitive" } },
      ];
    }

    return paginate({
      page,
      pageSize,
      count: () => prisma.whatsAppContactProfile.count({ where }),
      findMany: async (skip, take) => {
        const rows = await prisma.whatsAppContactProfile.findMany({
          where,
          orderBy: [{ whapiDisplayName: "asc" }, { providerContactId: "asc" }],
          skip,
          take,
          select: {
            id: true,
            providerContactId: true,
            whapiDisplayName: true,
            hasProfilePicture: true,
          },
        });
        return rows.filter((row) => !isWhapiGroupChatId(row.providerContactId));
      },
    }).then(async (pageResult) => {
      const filtered = pageResult.data;

    const waIds = filtered.map((row) => customerWaIdFromWhapiChatId(row.providerContactId)).filter(Boolean);
    const providerIds = filtered.map((row) => row.providerContactId);

    const conversations = await prisma.whatsAppConversation.findMany({
      where: {
        connectionId: connection.id,
        kind: "DIRECT",
        OR: [
          { providerChatId: { in: providerIds } },
          ...(waIds.length > 0 ? [{ customerWaId: { in: waIds as string[] } }] : []),
        ],
      },
      select: { id: true, customerWaId: true, providerChatId: true },
    });

    const conversationByProvider = new Map<string, string>();
    for (const convo of conversations) {
      if (convo.providerChatId) conversationByProvider.set(convo.providerChatId, convo.id);
      conversationByProvider.set(convo.customerWaId, convo.id);
    }

      const items = filtered.map((row) => {
        const waId = customerWaIdFromWhapiChatId(row.providerContactId);
        const conversationId =
          conversationByProvider.get(row.providerContactId) ??
          (waId ? conversationByProvider.get(waId) : undefined) ??
          null;
        return {
          id: row.id,
          providerContactId: row.providerContactId,
          displayName: row.whapiDisplayName?.trim() || null,
          hasProfilePicture: row.hasProfilePicture,
          conversationId,
        };
      });

      return { data: items, meta: pageResult.meta };
    });
  }

  return { list };
}
