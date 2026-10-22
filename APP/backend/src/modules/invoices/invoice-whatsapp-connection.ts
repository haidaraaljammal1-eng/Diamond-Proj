import type { PrismaClient } from "@prisma/client";
import { createWhatsAppProvider } from "src/modules/whatsapp/whatsapp.provider";
import { WHATSAPP_CURRENT_STATUSES } from "src/modules/whatsapp/whatsapp.constants";
import {
  isWhatsAppConnectionOperational,
  type WhatsAppConnectionOperationalRow,
} from "src/modules/whatsapp/whatsapp.connection-operational";

export type OperationalWhatsAppConnection = WhatsAppConnectionOperationalRow & { id: string };

export async function findOperationalWhatsAppConnection(
  prisma: PrismaClient,
): Promise<OperationalWhatsAppConnection | null> {
  const provider = createWhatsAppProvider();
  if (!provider.configured) return null;

  const connection = await prisma.whatsAppConnection.findFirst({
    where: { status: { in: [...WHATSAPP_CURRENT_STATUSES] } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      provider: true,
      status: true,
      credentialCiphertext: true,
      phoneNumberId: true,
      wabaId: true,
      providerInstanceId: true,
      providerSessionStatus: true,
    },
  });
  if (!isWhatsAppConnectionOperational(connection, provider.capabilities())) return null;
  return connection;
}
