import type { WhatsAppMessageProviderStatus } from "@prisma/client";

const SUCCESS_RANK: Record<string, number> = {
  PENDING: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
};

/**
 * Monotonic outbound providerStatus. Never regresses READ→DELIVERED→SENT.
 * FAILED does not overwrite a later successful delivery/read.
 * A FAILED row is not resurrected by an older SENT.
 */
export function nextProviderStatus(
  current: WhatsAppMessageProviderStatus | null,
  incoming: WhatsAppMessageProviderStatus,
): WhatsAppMessageProviderStatus {
  if (!current || current === incoming) return incoming;
  if (current === "FAILED") return "FAILED";
  if (incoming === "FAILED") {
    if (current === "DELIVERED" || current === "READ") return current;
    return "FAILED";
  }
  const currentRank = SUCCESS_RANK[current] ?? -1;
  const incomingRank = SUCCESS_RANK[incoming] ?? -1;
  return incomingRank >= currentRank ? incoming : current;
}
