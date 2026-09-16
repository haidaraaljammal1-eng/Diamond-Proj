import {
  WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS,
} from "src/modules/whatsapp/whatsapp.constants";
import type { WhatsAppProviderCapabilities } from "src/modules/whatsapp/whatsapp.capabilities";
import { META_CLOUD_CAPABILITIES } from "src/modules/whatsapp/whatsapp.capabilities";
import type { WhatsAppConnectionStatus, WhatsAppConnectionWebhookStatus } from "@prisma/client";
import type { WhatsAppProviderSessionStatusName } from "src/modules/whatsapp/whatsapp.types";

export type WhatsAppMessagingEligibilityReason =
  | "READY"
  | "NO_ACTIVE_CONNECTION"
  | "CONNECTION_INACTIVE"
  | "WEBHOOK_NOT_ACTIVE"
  | "CUSTOMER_SERVICE_WINDOW_CLOSED"
  | "CUSTOMER_SERVICE_WINDOW_UNKNOWN"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_NOT_AUTHENTICATED"
  | "QR_REQUIRED";

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
    providerSessionStatus?: WhatsAppProviderSessionStatusName | null;
  } | null;
  providerConfigured: boolean;
  capabilities?: WhatsAppProviderCapabilities;
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
 * Connection must be the active LINKED office connection with stored credentials.
 * Template send (Meta) may proceed when this gate passes even if the 24-hour
 * free-form window is closed. UltraMsg does not use that window.
 */
export function evaluateMessagingEligibility(
  input: WhatsAppEligibilityInput,
): WhatsAppMessagingEligibility {
  const caps = input.capabilities ?? META_CLOUD_CAPABILITIES;
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

  if (caps.supportsQrAuthentication) {
    const session = input.currentConnection.providerSessionStatus ?? "UNKNOWN";
    if (session === "QR_REQUIRED") return blocked("QR_REQUIRED");
    if (session !== "AUTHENTICATED") return blocked("PROVIDER_NOT_AUTHENTICATED");
    return {
      canSendText: caps.supportsFreeText,
      canSendMedia: caps.supportsImage || caps.supportsDocument || caps.supportsAudio || caps.supportsVideo,
      canSendTemplate: false,
      reason: "READY",
      windowExpiresAt: null,
    };
  }

  if (input.currentConnection.webhookStatus !== "ACTIVE") {
    return blocked("WEBHOOK_NOT_ACTIVE");
  }

  if (!caps.requiresCustomerServiceWindow) {
    return {
      canSendText: caps.supportsFreeText,
      canSendMedia: true,
      canSendTemplate: caps.supportsTemplates,
      reason: "READY",
      windowExpiresAt: null,
    };
  }

  if (!input.lastInboundAt) {
    return {
      canSendText: false,
      canSendMedia: false,
      canSendTemplate: caps.supportsTemplates,
      reason: "CUSTOMER_SERVICE_WINDOW_UNKNOWN",
      windowExpiresAt: null,
    };
  }
  const windowExpiresAt = customerServiceWindowExpiresAt(input.lastInboundAt);
  if (!isCustomerServiceWindowOpen(input.lastInboundAt, input.now)) {
    return {
      canSendText: false,
      canSendMedia: false,
      canSendTemplate: caps.supportsTemplates,
      reason: "CUSTOMER_SERVICE_WINDOW_CLOSED",
      windowExpiresAt,
    };
  }
  return {
    canSendText: true,
    canSendMedia: true,
    canSendTemplate: caps.supportsTemplates,
    reason: "READY",
    windowExpiresAt,
  };
}
