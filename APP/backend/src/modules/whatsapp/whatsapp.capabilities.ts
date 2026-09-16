export type WhatsAppCapabilityProvider = "META_CLOUD" | "ULTRAMSG";

export interface WhatsAppProviderCapabilities {
  provider: WhatsAppCapabilityProvider;
  supportsQrAuthentication: boolean;
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

export const ULTRAMSG_CAPABILITIES: WhatsAppProviderCapabilities = {
  provider: "ULTRAMSG",
  supportsQrAuthentication: true,
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
