import type { WhatsAppProviderCapabilities } from "src/modules/whatsapp/whatsapp.capabilities";

export type WhatsAppProviderKey = "META_CLOUD_API" | "ULTRAMSG";

export type WhatsAppProviderFailureCode =
  | "NOT_CONFIGURED"
  | "AUTH_FAILED"
  | "VALIDATION_FAILED"
  | "INVALID_RESPONSE"
  | "WABA_NOT_GRANTED"
  | "PHONE_NOT_GRANTED"
  | "SEND_REJECTED"
  | "SEND_RATE_LIMITED"
  | "SEND_AUTH_FAILED"
  | "SEND_UNKNOWN"
  | "NOT_AUTHENTICATED";

export interface WhatsAppProviderFailure {
  ok: false;
  code: WhatsAppProviderFailureCode;
  /** Sanitized Graph numeric/type code such as `graph:190`. Never a token. */
  providerErrorCode?: string;
  /** Meta fbtrace_id when present — correlation only, no secrets. */
  fbtraceId?: string;
}

export interface WhatsAppAccessCredential {
  accessToken: string;
  expiresAt: Date | null;
}

export interface WhatsAppGrantedWaba {
  wabaId: string;
  businessName: string | null;
}

export interface WhatsAppGrantedPhone {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string | null;
}

export interface WhatsAppGrantMetadata {
  wabas: WhatsAppGrantedWaba[];
  phones: WhatsAppGrantedPhone[];
}

export interface WhatsAppInspectedAccess {
  isValid: boolean;
  expiresAt: Date | null;
  wabaIds: string[];
  appId: string | null;
}

export interface WhatsAppWebhookSubscription {
  subscribed: boolean;
}

export type WhatsAppProviderResult<T> = { ok: true; value: T } | WhatsAppProviderFailure;

export interface WhatsAppSendTextInput {
  accessToken: string;
  phoneNumberId: string;
  toWaId: string;
  text: string;
}

export interface WhatsAppSendTextAccepted {
  providerMessageId: string;
}

export type WhatsAppOutboundMediaKind = "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO";

export type WhatsAppTemplateStatus =
  | "APPROVED"
  | "PENDING"
  | "REJECTED"
  | "PAUSED"
  | "DISABLED"
  | "OTHER";

export interface WhatsAppTemplateComponentParameter {
  type: "text";
  text: string;
}

export interface WhatsAppTemplateSendComponent {
  type: "header" | "body";
  parameters: WhatsAppTemplateComponentParameter[];
}

export interface WhatsAppProviderTemplate {
  providerTemplateId: string;
  name: string;
  language: string;
  status: WhatsAppTemplateStatus;
  category: string | null;
  sendable: boolean;
  bodyText: string | null;
  headerText: string | null;
  footerText: string | null;
  bodyVariableCount: number;
  headerVariableCount: number;
}

export interface WhatsAppSendTemplateInput {
  accessToken: string;
  phoneNumberId: string;
  toWaId: string;
  name: string;
  language: string;
  components: WhatsAppTemplateSendComponent[];
}

export interface WhatsAppMediaMetadata {
  mediaId: string;
  mimeType: string | null;
  fileSize: number | null;
  sha256: string | null;
  url: string;
}

export interface WhatsAppMediaBytes {
  body: Buffer;
  contentType: string | null;
}

export interface WhatsAppUploadMediaInput {
  accessToken: string;
  phoneNumberId: string;
  bytes: Buffer;
  mimeType: string;
  filename: string;
}

export interface WhatsAppSendMediaInput {
  accessToken: string;
  phoneNumberId: string;
  toWaId: string;
  kind: WhatsAppOutboundMediaKind;
  mediaId: string;
  caption?: string;
}

export type WhatsAppProviderSessionStatusName =
  | "INITIALIZING"
  | "QR_REQUIRED"
  | "RETRYING"
  | "LOADING"
  | "AUTHENTICATED"
  | "DISCONNECTED"
  | "STANDBY"
  | "UNKNOWN";

export interface WhatsAppSessionSnapshot {
  status: WhatsAppProviderSessionStatusName;
  rawStatus: string | null;
}

export interface WhatsAppInstanceIdentity {
  chatId: string | null;
  displayPhone: string | null;
  displayName: string | null;
}

export interface WhatsAppInstanceSettings {
  sendDelay: number;
  sendDelayMax: number;
  webhookUrl: string | null;
  webhookMessageReceived: boolean;
  webhookMessageCreate: boolean;
  webhookMessageAck: boolean;
  webhookMessageDownloadMedia: boolean;
}

export interface WhatsAppQrPayload {
  imageDataUrl: string | null;
  qrCode: string | null;
}

export interface WhatsAppSendOutboundMediaInput {
  accessToken: string;
  toChatId: string;
  phoneNumberId: string;
  kind: WhatsAppOutboundMediaKind;
  bytes: Buffer;
  mimeType: string;
  filename: string;
  caption?: string;
}

/**
 * Provider operations used by Diamond WhatsApp.
 * Phone registration / migration / PIN / number takeover are not implemented.
 * Implementations MUST NOT call /instance/clear, logout, or restart.
 */
export interface WhatsAppProvider {
  readonly name: string;
  readonly configured: boolean;
  capabilities(): WhatsAppProviderCapabilities;
  getSession(accessToken: string): Promise<WhatsAppProviderResult<WhatsAppSessionSnapshot>>;
  getInstanceIdentity(accessToken: string): Promise<WhatsAppProviderResult<WhatsAppInstanceIdentity>>;
  getInstanceSettings(accessToken: string): Promise<WhatsAppProviderResult<WhatsAppInstanceSettings>>;
  getQr(accessToken: string): Promise<WhatsAppProviderResult<WhatsAppQrPayload>>;
  applyWebhookSettings(
    accessToken: string,
    settings: WhatsAppInstanceSettings,
  ): Promise<WhatsAppProviderResult<WhatsAppInstanceSettings>>;
  sendOutboundMedia(
    input: WhatsAppSendOutboundMediaInput,
  ): Promise<WhatsAppProviderResult<WhatsAppSendTextAccepted>>;
  exchangeAuthorizationCode(
    code: string,
  ): Promise<WhatsAppProviderResult<WhatsAppAccessCredential>>;
  inspectGrantedBusinessAccess(
    accessToken: string,
  ): Promise<WhatsAppProviderResult<WhatsAppInspectedAccess>>;
  listGrantedWhatsAppBusinessAccounts(
    accessToken: string,
    wabaIds: string[],
  ): Promise<WhatsAppProviderResult<WhatsAppGrantedWaba[]>>;
  listGrantedPhoneNumbers(
    accessToken: string,
    wabaId: string,
  ): Promise<WhatsAppProviderResult<WhatsAppGrantedPhone[]>>;
  validatePhoneNumberAccess(
    accessToken: string,
    wabaId: string,
    phoneNumberId: string,
  ): Promise<WhatsAppProviderResult<WhatsAppGrantedPhone>>;
  validateCredential(accessToken: string): Promise<WhatsAppProviderResult<{ isValid: boolean }>>;
  /** POST /{waba-id}/subscribed_apps — never called automatically in Phase 2. */
  subscribeWaba(
    accessToken: string,
    wabaId: string,
  ): Promise<WhatsAppProviderResult<{ success: boolean }>>;
  /** GET /{waba-id}/subscribed_apps */
  getWebhookSubscriptionStatus(
    accessToken: string,
    wabaId: string,
  ): Promise<WhatsAppProviderResult<WhatsAppWebhookSubscription>>;
  /**
   * POST /{phone-number-id}/messages — text only.
   * Implementations MUST NOT retry this HTTP POST.
   */
  sendTextMessage(
    input: WhatsAppSendTextInput,
  ): Promise<WhatsAppProviderResult<WhatsAppSendTextAccepted>>;
  listMessageTemplates(
    accessToken: string,
    wabaId: string,
  ): Promise<WhatsAppProviderResult<WhatsAppProviderTemplate[]>>;
  sendTemplateMessage(
    input: WhatsAppSendTemplateInput,
  ): Promise<WhatsAppProviderResult<WhatsAppSendTextAccepted>>;
  getMediaMetadata(
    accessToken: string,
    mediaId: string,
  ): Promise<WhatsAppProviderResult<WhatsAppMediaMetadata>>;
  downloadMedia(
    accessToken: string,
    url: string,
  ): Promise<WhatsAppProviderResult<WhatsAppMediaBytes>>;
  uploadMedia(
    input: WhatsAppUploadMediaInput,
  ): Promise<WhatsAppProviderResult<{ mediaId: string }>>;
  sendMediaMessage(
    input: WhatsAppSendMediaInput,
  ): Promise<WhatsAppProviderResult<WhatsAppSendTextAccepted>>;
}

export interface WhatsAppMetaRuntimeConfig {
  appId: string;
  appSecret: string;
  graphApiVersion: string;
  configId: string;
}

export interface WhatsAppWebhookSecrets {
  appSecret: string;
  verifyToken: string;
}

export interface GraphHttp {
  getJson(
    url: string,
    headers: Record<string, string>,
  ): Promise<{ status: number; json: unknown }>;
  postJson?(
    url: string,
    headers: Record<string, string>,
    body?: string,
  ): Promise<{ status: number; json: unknown }>;
  postMultipart?(
    url: string,
    headers: Record<string, string>,
    body: FormData,
  ): Promise<{ status: number; json: unknown }>;
  getBinary?(
    url: string,
    headers: Record<string, string>,
  ): Promise<{ status: number; contentType: string | null; body: Buffer }>;
}
