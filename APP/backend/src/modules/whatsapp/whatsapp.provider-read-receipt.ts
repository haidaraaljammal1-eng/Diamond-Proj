import type { PrismaClient } from "@prisma/client";
import { decryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { createWhatsAppProvider } from "src/modules/whatsapp/whatsapp.provider";

const MAX_INBOUND_RECEIPTS = 25;

export interface ProviderReadReceiptInput {
  conversationId: string;
  connectionId: string;
  /** Unread count before Diamond mark-read. */
  previousUnreadCount: number;
  /** Conversation read cursor before this mark-read. */
  readBeforeAt: Date | null;
}

/**
 * Best-effort provider read receipts after Diamond internal read succeeds.
 * Never throws; never logs message bodies or tokens.
 */
export async function sendProviderReadReceiptsBestEffort(
  prisma: PrismaClient,
  input: ProviderReadReceiptInput,
): Promise<void> {
  if (input.previousUnreadCount <= 0) return;

  const provider = createWhatsAppProvider();
  const caps = provider.capabilities();
  if (!caps.supportsProviderReadReceipt) return;

  const connection = await prisma.whatsAppConnection.findUnique({
    where: { id: input.connectionId },
    select: { credentialCiphertext: true },
  });
  if (!connection?.credentialCiphertext) return;

  let accessToken: string;
  try {
    accessToken = decryptWhatsAppCredential(connection.credentialCiphertext);
  } catch {
    return;
  }

  const readBefore = input.readBeforeAt;
  const inbound = await prisma.whatsAppMessage.findMany({
    where: {
      conversationId: input.conversationId,
      direction: "INBOUND",
      providerMessageId: { not: null },
      ...(readBefore
        ? {
            OR: [
              { providerOccurredAt: { gt: readBefore } },
              { providerOccurredAt: null, createdAt: { gt: readBefore } },
            ],
          }
        : {}),
    },
    orderBy: [{ providerOccurredAt: "desc" }, { createdAt: "desc" }],
    take: MAX_INBOUND_RECEIPTS,
    select: { providerMessageId: true },
  });

  for (const row of inbound) {
    const id = row.providerMessageId?.trim();
    if (!id) continue;
    try {
      await provider.markProviderMessageRead(accessToken, id);
    } catch {
      /* provider receipt is best-effort */
    }
  }
}
