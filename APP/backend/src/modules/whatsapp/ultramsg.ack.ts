import type { WhatsAppMessageProviderStatus } from "@prisma/client";

const ACK_MAP: Record<string, WhatsAppMessageProviderStatus> = {
  pending: "PENDING",
  server: "SENT",
  device: "DELIVERED",
  read: "READ",
  played: "READ",
};

/** Official UltraMsg ACK strings. Unknown ACK does not invent FAILED. */
export function mapUltraMsgAck(raw: string | null | undefined): WhatsAppMessageProviderStatus | null {
  if (!raw) return null;
  return ACK_MAP[raw.trim().toLowerCase()] ?? null;
}
