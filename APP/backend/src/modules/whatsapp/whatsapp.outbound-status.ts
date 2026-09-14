import type { PrismaClient, WhatsAppMessageProviderStatus } from "@prisma/client";
import { withTransaction } from "src/lib/db/transaction";
import { mapWhatsAppProviderStatus } from "src/modules/whatsapp/whatsapp.message-type";
import { writeWhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime-outbox";
import type { WhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime";
import { nextProviderStatus } from "src/modules/whatsapp/whatsapp.status";

type Db = Pick<PrismaClient, "whatsAppMessage" | "whatsAppWebhookEvent">;

export type ApplyOutboundStatusResult = {
  matched: boolean;
  changed: boolean;
  messageId?: string;
  conversationId?: string;
  providerStatus?: WhatsAppMessageProviderStatus;
};

export async function applyOutboundProviderStatus(
  db: Db,
  params: {
    connectionId: string;
    providerMessageId: string;
    incoming: WhatsAppMessageProviderStatus;
  },
): Promise<ApplyOutboundStatusResult> {
  const row = await db.whatsAppMessage.findFirst({
    where: {
      connectionId: params.connectionId,
      providerMessageId: params.providerMessageId,
      direction: "OUTBOUND",
    },
    select: { id: true, conversationId: true, providerStatus: true },
  });
  if (!row) return { matched: false, changed: false };
  const next = nextProviderStatus(row.providerStatus, params.incoming);
  if (next === row.providerStatus) {
    return {
      matched: true,
      changed: false,
      messageId: row.id,
      conversationId: row.conversationId,
      providerStatus: next,
    };
  }
  await db.whatsAppMessage.update({
    where: { id: row.id },
    data: { providerStatus: next },
  });
  return {
    matched: true,
    changed: true,
    messageId: row.id,
    conversationId: row.conversationId,
    providerStatus: next,
  };
}

/** Apply any MESSAGE_STATUS events already stored for this wamid. */
export async function reconcileOutboundStatusEvents(
  prisma: PrismaClient,
  params: { connectionId: string; providerMessageId: string },
): Promise<WhatsAppRealtimeEvent[]> {
  const events = await prisma.whatsAppWebhookEvent.findMany({
    where: {
      connectionId: params.connectionId,
      providerMessageId: params.providerMessageId,
      eventType: "MESSAGE_STATUS",
    },
    select: { messageType: true, occurredAt: true, receivedAt: true },
    orderBy: [{ occurredAt: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }],
  });
  return withTransaction(prisma, async (tx) => {
    const emitted: WhatsAppRealtimeEvent[] = [];
    for (const event of events) {
      const mapped = mapWhatsAppProviderStatus(event.messageType);
      if (!mapped) continue;
      const applied = await applyOutboundProviderStatus(tx, {
        connectionId: params.connectionId,
        providerMessageId: params.providerMessageId,
        incoming: mapped,
      });
      if (
        !applied.changed ||
        !applied.messageId ||
        !applied.conversationId ||
        !applied.providerStatus ||
        applied.providerStatus === "PENDING"
      ) {
        continue;
      }
      const realtime = await writeWhatsAppRealtimeEvent(tx, {
        type: "whatsapp.message.provider_status_changed",
        dedupeKey: `whatsapp.message.provider_status_changed:${applied.messageId}:${applied.providerStatus}`,
        conversationId: applied.conversationId,
        messageId: applied.messageId,
        connectionId: params.connectionId,
        providerStatus: applied.providerStatus,
      });
      if (realtime) emitted.push(realtime);
    }
    return emitted;
  });
}
