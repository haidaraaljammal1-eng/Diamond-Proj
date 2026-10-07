export type WhatsAppCapabilityProvider = "META_CLOUD" | "ULTRAMSG" | "WHAPI";

export type WhatsAppRecipientAddressingMode = "WA_ID" | "PROVIDER_CHAT_ID";

export interface WhatsAppProviderCapabilities {
  provider: WhatsAppCapabilityProvider;
  supportsQrAuthentication: boolean;
  /** Direct bytes/document send via sendOutboundMedia (no Meta media id upload phase). */
  supportsDirectOutboundMedia: boolean;
  recipientAddressing: WhatsAppRecipientAddressingMode;
  supportsEmbeddedSignup: boolean;
  supportsFreeText: boolean;
  supportsTemplates: boolean;
  requiresCustomerServiceWindow: boolean;
  supportsImage: boolean;
  supportsDocument: boolean;
  supportsAudio: boolean;
  supportsVideo: boolean;
  supportsProviderReadReceipt: boolean;
  supportsWebhookReceived: boolean;
  supportsWebhookCreate: boolean;
  supportsWebhookAck: boolean;
}

export const META_CLOUD_CAPABILITIES: WhatsAppProviderCapabilities = {
  provider: "META_CLOUD",
  supportsQrAuthentication: false,
  supportsDirectOutboundMedia: false,
  recipientAddressing: "WA_ID",
  supportsEmbeddedSignup: true,
  supportsFreeText: true,
  supportsTemplates: true,
  requiresCustomerServiceWindow: true,
  supportsImage: true,
  supportsDocument: true,
  supportsAudio: true,
  supportsVideo: true,
  supportsProviderReadReceipt: false,
  supportsWebhookReceived: true,
  supportsWebhookCreate: false,
  supportsWebhookAck: true,
};

export const WHAPI_CAPABILITIES: WhatsAppProviderCapabilities = {
  provider: "WHAPI",
  supportsQrAuthentication: true,
  supportsDirectOutboundMedia: true,
  recipientAddressing: "PROVIDER_CHAT_ID",
  supportsEmbeddedSignup: false,
  supportsFreeText: true,
  supportsTemplates: false,
  requiresCustomerServiceWindow: false,
  supportsImage: true,
  supportsDocument: true,
  supportsAudio: true,
  supportsVideo: true,
  supportsProviderReadReceipt: true,
  supportsWebhookReceived: true,
  supportsWebhookCreate: true,
  supportsWebhookAck: true,
};

export const ULTRAMSG_CAPABILITIES: WhatsAppProviderCapabilities = {
  provider: "ULTRAMSG",
  supportsQrAuthentication: true,
  supportsDirectOutboundMedia: true,
  recipientAddressing: "PROVIDER_CHAT_ID",
  supportsEmbeddedSignup: false,
  supportsFreeText: true,
  supportsTemplates: false,
  requiresCustomerServiceWindow: false,
  supportsImage: true,
  supportsDocument: true,
  supportsAudio: true,
  supportsVideo: true,
  supportsProviderReadReceipt: false,
  supportsWebhookReceived: true,
  supportsWebhookCreate: true,
  supportsWebhookAck: true,
};

export const UNCONFIGURED_CAPABILITIES: WhatsAppProviderCapabilities = {
  ...META_CLOUD_CAPABILITIES,
  supportsEmbeddedSignup: false,
  supportsTemplates: false,
  supportsFreeText: false,
  supportsImage: false,
  supportsDocument: false,
  supportsAudio: false,
  supportsVideo: false,
  supportsWebhookReceived: false,
  supportsWebhookAck: false,
};
