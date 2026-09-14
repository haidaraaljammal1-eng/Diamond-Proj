import {
  WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS,
} from "src/modules/whatsapp/whatsapp.constants";
import type { WhatsAppConnectionStatus, WhatsAppConnectionWebhookStatus } from "@prisma/client";

export type WhatsAppMessagingEligibilityReason =
  | "READY"
  | "NO_ACTIVE_CONNECTION"
  | "CONNECTION_INACTIVE"
  | "WEBHOOK_NOT_ACTIVE"
  | "CUSTOMER_SERVICE_WINDOW_CLOSED"
  | "CUSTOMER_SERVICE_WINDOW_UNKNOWN"
  | "PROVIDER_NOT_CONFIGURED";

export interface WhatsAppMessagingEligibility {
  canSendText: boolean;
  canSendMedia: boolean;
  canSendTemplate: boolean;
  reason: WhatsAppMessagingEligibilityReason;
  windowExpiresAt: Date | null;
}

export interface WhatsAppEligibilityInput {
  conversationConnectionId: string;
  lastInboundAt: Date | null;
  currentConnection: {
    id: string;
    status: WhatsAppConnectionStatus;
    webhookStatus: WhatsAppConnectionWebhookStatus;
    hasCredential: boolean;
  } | null;
  providerConfigured: boolean;
  now: Date;
}

export function customerServiceWindowExpiresAt(lastInboundAt: Date): Date {
  return new Date(lastInboundAt.getTime() + WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS);
}

/** Open only while now < lastInboundAt + 24h. Equal-to-boundary is closed. */
export function isCustomerServiceWindowOpen(lastInboundAt: Date, now: Date): boolean {
  return now.getTime() < customerServiceWindowExpiresAt(lastInboundAt).getTime();
}

function blocked(
  reason: WhatsAppMessagingEligibilityReason,
  windowExpiresAt: Date | null = null,
): WhatsAppMessagingEligibility {
  return {
    canSendText: false,
    canSendMedia: false,
    canSendTemplate: false,
    reason,
    windowExpiresAt,
  };
}

/**
 * Connection must be the active LINKED office connection with webhook ACTIVE
 * and stored credentials. Template send may proceed when this gate passes even
 * if the 24-hour free-form window is closed. Free-form text/media may not.
 */
export function evaluateMessagingEligibility(
  input: WhatsAppEligibilityInput,
): WhatsAppMessagingEligibility {
  if (!input.providerConfigured) {
    return blocked("PROVIDER_NOT_CONFIGURED");
  }
  if (!input.currentConnection) {
    return blocked("NO_ACTIVE_CONNECTION");
  }
  if (
    input.currentConnection.id !== input.conversationConnectionId ||
    input.currentConnection.status !== "LINKED" ||
    !input.currentConnection.hasCredential
  ) {
    return blocked("CONNECTION_INACTIVE");
  }
  if (input.currentConnection.webhookStatus !== "ACTIVE") {
    return blocked("WEBHOOK_NOT_ACTIVE");
  }

  if (!input.lastInboundAt) {
    return {
      canSendText: false,
      canSendMedia: false,
      canSendTemplate: true,
      reason: "CUSTOMER_SERVICE_WINDOW_UNKNOWN",
      windowExpiresAt: null,
    };
  }
  const windowExpiresAt = customerServiceWindowExpiresAt(input.lastInboundAt);
  if (!isCustomerServiceWindowOpen(input.lastInboundAt, input.now)) {
    return {
      canSendText: false,
      canSendMedia: false,
      canSendTemplate: true,
      reason: "CUSTOMER_SERVICE_WINDOW_CLOSED",
      windowExpiresAt,
    };
  }
  return {
    canSendText: true,
    canSendMedia: true,
    canSendTemplate: true,
    reason: "READY",
    windowExpiresAt,
  };
}
