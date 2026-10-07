import type { WhatsAppMessageProviderStatus } from "@prisma/client";

export function mapWhapiDeliveryStatus(
  raw: string | null | undefined,
): WhatsAppMessageProviderStatus | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value === "sent" || value === "server") return "SENT";
  if (value === "delivered" || value === "device") return "DELIVERED";
  if (value === "read" || value === "played") return "READ";
  if (value === "failed" || value === "error" || value === "undelivered") return "FAILED";
  if (value === "pending") return "PENDING";
  return null;
}
