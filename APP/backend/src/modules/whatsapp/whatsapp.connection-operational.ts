import type { WhatsAppProvider, WhatsAppProviderSessionStatus, WhatsAppConnectionStatus } from "@prisma/client";
import type { WhatsAppProviderCapabilities } from "src/modules/whatsapp/whatsapp.capabilities";
import { WHATSAPP_CURRENT_STATUSES } from "src/modules/whatsapp/whatsapp.constants";

export type WhatsAppConnectionOperationalRow = {
  provider: WhatsAppProvider;
  status: WhatsAppConnectionStatus;
  credentialCiphertext: string | null;
  phoneNumberId: string | null;
  wabaId: string | null;
  providerInstanceId: string | null;
  providerSessionStatus: WhatsAppProviderSessionStatus | null;
};

export function isWhatsAppConnectionOperational(
  connection: WhatsAppConnectionOperationalRow | null | undefined,
  _capabilities?: WhatsAppProviderCapabilities,
): boolean {
  if (!connection) return false;
  if (!WHATSAPP_CURRENT_STATUSES.includes(connection.status as (typeof WHATSAPP_CURRENT_STATUSES)[number])) {
    return false;
  }
  if (connection.status !== "LINKED" || !connection.credentialCiphertext) return false;

  switch (connection.provider) {
    case "META_CLOUD_API":
      return Boolean(connection.phoneNumberId && connection.wabaId);
    case "ULTRAMSG":
      return (
        Boolean(connection.providerInstanceId) &&
        connection.providerSessionStatus === "AUTHENTICATED"
      );
    case "WHAPI":
      return (
        Boolean(connection.providerInstanceId) &&
        connection.providerSessionStatus === "AUTHENTICATED"
      );
    default:
      return false;
  }
}
