import {
  ULTRAMSG_BASE64_MAX_LENGTH,
  ultramsgRuntimeConfig,
} from "src/modules/whatsapp/ultramsg.config";
import { extractUltraMsgAccountStatus, mapUltraMsgAccountStatus } from "src/modules/whatsapp/ultramsg.status";
import { ULTRAMSG_CAPABILITIES } from "src/modules/whatsapp/whatsapp.capabilities";
import {
  mapUltraMsgHttpFailure,
  UltraMsgClient,
  UltraMsgHttpError,
} from "src/modules/whatsapp/providers/ultramsg.client";
import type {
  WhatsAppAccessCredential,
  WhatsAppGrantedPhone,
  WhatsAppGrantedWaba,
  WhatsAppInspectedAccess,
  WhatsAppInstanceIdentity,
  WhatsAppInstanceSettings,
  WhatsAppMediaBytes,
  WhatsAppMediaMetadata,
  WhatsAppProvider,
  WhatsAppProviderResult,
  WhatsAppProviderTemplate,
  WhatsAppQrPayload,
  WhatsAppSendMediaInput,
  WhatsAppSendOutboundMediaInput,
  WhatsAppSendTemplateInput,
  WhatsAppSendTextAccepted,
  WhatsAppSendTextInput,
  WhatsAppSessionSnapshot,
  WhatsAppUploadMediaInput,
} from "src/modules/whatsapp/whatsapp.types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asBool(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "on" || v === "1";
  }
  return false;
}

function parseSettings(json: unknown): WhatsAppInstanceSettings | null {
  const body = asRecord(json);
  if (!body) return null;
  const sendDelay = asNumber(body.sendDelay);
  const sendDelayMax = asNumber(body.sendDelayMax);
  if (sendDelay == null || sendDelayMax == null) return null;
  return {
    sendDelay,
    sendDelayMax,
    webhookUrl: asString(body.webhook_url),
    webhookMessageReceived: asBool(body.webhook_message_received),
    webhookMessageCreate: asBool(body.webhook_message_create),
    webhookMessageAck: asBool(body.webhook_message_ack),
    webhookMessageDownloadMedia: asBool(body.webhook_message_download_media),
  };
}

function parseSendAccepted(json: unknown): WhatsAppSendTextAccepted | null {
  const body = asRecord(json);
  if (!body) return null;
  if (body.error != null && String(body.error).trim()) return null;
  if (body.sent === false || body.sent === "false") return null;
  const id = body.id ?? body.messageId ?? body.msgId;
  if (typeof id === "number" && Number.isFinite(id)) return { providerMessageId: String(id) };
  if (typeof id === "string" && id.trim()) return { providerMessageId: id.trim() };
  return { providerMessageId: "" };
}

export class UltraMsgWhatsAppProvider implements WhatsAppProvider {
  readonly name = "ultramsg";
  readonly configured = true;

  constructor(
    private readonly instanceId: string,
    private readonly apiUrl: string,
    private readonly fetchImpl?: typeof fetch,
  ) {}

  capabilities() {
    return ULTRAMSG_CAPABILITIES;
  }

  private client(token: string): UltraMsgClient {
    return new UltraMsgClient({
      apiUrl: this.apiUrl,
      instanceId: this.instanceId,
      token,
      fetchImpl: this.fetchImpl,
    });
  }

  async getSession(accessToken: string): Promise<WhatsAppProviderResult<WhatsAppSessionSnapshot>> {
    try {
      const { status, json } = await this.client(accessToken).getJson("/instance/status");
      if (status < 200 || status >= 300) return { ok: false, code: mapUltraMsgHttpFailure(status, json) };
      const raw = extractUltraMsgAccountStatus(json);
      return { ok: true, value: { status: mapUltraMsgAccountStatus(raw), rawStatus: raw } };
    } catch (error) {
      return { ok: false, code: error instanceof UltraMsgHttpError ? error.code : "SEND_UNKNOWN" };
    }
  }

  async getInstanceIdentity(
    accessToken: string,
  ): Promise<WhatsAppProviderResult<WhatsAppInstanceIdentity>> {
    try {
      const { status, json } = await this.client(accessToken).getJson("/instance/me");
      if (status < 200 || status >= 300) return { ok: false, code: mapUltraMsgHttpFailure(status, json) };
      const body = asRecord(json) ?? {};
      const chatId = asString(body.id) ?? asString(body.wid);
      const displayName = asString(body.pushname) ?? asString(body.pushName) ?? asString(body.name);
      const displayPhone =
        asString(body.phone) ??
        (chatId && chatId.toLowerCase().endsWith("@c.us") ? chatId.slice(0, -5) : chatId);
      return { ok: true, value: { chatId, displayPhone, displayName } };
    } catch (error) {
      return { ok: false, code: error instanceof UltraMsgHttpError ? error.code : "SEND_UNKNOWN" };
    }
  }

  async getInstanceSettings(
    accessToken: string,
  ): Promise<WhatsAppProviderResult<WhatsAppInstanceSettings>> {
    try {
      const { status, json } = await this.client(accessToken).getJson("/instance/settings");
      if (status < 200 || status >= 300) return { ok: false, code: mapUltraMsgHttpFailure(status, json) };
      const settings = parseSettings(json);
      if (!settings) return { ok: false, code: "INVALID_RESPONSE" };
      return { ok: true, value: settings };
    } catch (error) {
      return { ok: false, code: error instanceof UltraMsgHttpError ? error.code : "SEND_UNKNOWN" };
    }
  }

  async getQr(accessToken: string): Promise<WhatsAppProviderResult<WhatsAppQrPayload>> {
    try {
      const client = this.client(accessToken);
      const coded = await client.getJson("/instance/qrCode");
      if (coded.status >= 200 && coded.status < 300) {
        const body = asRecord(coded.json) ?? {};
        const qrCode = asString(body.qrCode) ?? asString(body.qr) ?? asString(body.code);
        const image = asString(body.qrImage) ?? asString(body.image);
        if (qrCode || image) {
          return {
            ok: true,
            value: {
              qrCode,
              imageDataUrl: image && image.startsWith("data:") ? image : image ? `data:image/png;base64,${image}` : null,
            },
          };
        }
      }
      const image = await client.getBinary("/instance/qr");
      if (image.status < 200 || image.status >= 300 || image.body.length === 0) {
        return { ok: false, code: "INVALID_RESPONSE" };
      }
      const mime = image.contentType?.startsWith("image/") ? image.contentType.split(";")[0] : "image/png";
      return {
        ok: true,
        value: {
          qrCode: null,
          imageDataUrl: `data:${mime};base64,${image.body.toString("base64")}`,
        },
      };
    } catch (error) {
      return { ok: false, code: error instanceof UltraMsgHttpError ? error.code : "SEND_UNKNOWN" };
    }
  }

  async applyWebhookSettings(
    accessToken: string,
    settings: WhatsAppInstanceSettings,
  ): Promise<WhatsAppProviderResult<WhatsAppInstanceSettings>> {
    try {
      const { status, json } = await this.client(accessToken).postForm("/instance/settings", {
        sendDelay: String(settings.sendDelay),
        sendDelayMax: String(settings.sendDelayMax),
        webhook_url: settings.webhookUrl ?? "",
        webhook_message_received: settings.webhookMessageReceived ? "true" : "false",
        webhook_message_create: settings.webhookMessageCreate ? "true" : "false",
        webhook_message_ack: settings.webhookMessageAck ? "true" : "false",
        webhook_message_download_media: settings.webhookMessageDownloadMedia ? "true" : "false",
      });
      if (status < 200 || status >= 300) return { ok: false, code: mapUltraMsgHttpFailure(status, json) };
      return this.getInstanceSettings(accessToken);
    } catch (error) {
      return { ok: false, code: error instanceof UltraMsgHttpError ? error.code : "SEND_UNKNOWN" };
    }
  }

  async assertAuthenticated(accessToken: string): Promise<WhatsAppProviderResult<true>> {
    const session = await this.getSession(accessToken);
    if (!session.ok) return session;
    if (session.value.status !== "AUTHENTICATED") return { ok: false, code: "NOT_AUTHENTICATED" };
    return { ok: true, value: true };
  }

  async sendTextMessage(
    input: WhatsAppSendTextInput,
  ): Promise<WhatsAppProviderResult<WhatsAppSendTextAccepted>> {
    const ready = await this.assertAuthenticated(input.accessToken);
    if (!ready.ok) return ready;
    try {
      const { status, json } = await this.client(input.accessToken).postForm("/messages/chat", {
        to: input.toWaId,
        body: input.text,
      });
      if (status < 200 || status >= 300) return { ok: false, code: mapUltraMsgHttpFailure(status, json) };
      const accepted = parseSendAccepted(json);
      if (!accepted) return { ok: false, code: "SEND_REJECTED" };
      return { ok: true, value: accepted };
    } catch (error) {
      return { ok: false, code: error instanceof UltraMsgHttpError ? error.code : "SEND_UNKNOWN" };
    }
  }

  async sendOutboundMedia(
    input: WhatsAppSendOutboundMediaInput,
  ): Promise<WhatsAppProviderResult<WhatsAppSendTextAccepted>> {
    const ready = await this.assertAuthenticated(input.accessToken);
    if (!ready.ok) return ready;
    const encoded = input.bytes.toString("base64");
    if (encoded.length > ULTRAMSG_BASE64_MAX_LENGTH) return { ok: false, code: "VALIDATION_FAILED" };
    const path =
      input.kind === "IMAGE"
        ? "/messages/image"
        : input.kind === "DOCUMENT"
          ? "/messages/document"
          : input.kind === "AUDIO"
            ? "/messages/audio"
            : "/messages/video";
    const field =
      input.kind === "IMAGE"
        ? "image"
        : input.kind === "DOCUMENT"
          ? "document"
          : input.kind === "AUDIO"
            ? "audio"
            : "video";
    const fields: Record<string, string> = {
      to: input.toChatId,
      [field]: encoded,
    };
    if (input.kind === "DOCUMENT") fields.filename = input.filename.slice(0, 255);
    if (input.kind !== "AUDIO") fields.caption = input.caption ?? "";
    try {
      const { status, json } = await this.client(input.accessToken).postForm(path, fields);
      if (status < 200 || status >= 300) return { ok: false, code: mapUltraMsgHttpFailure(status, json) };
      const accepted = parseSendAccepted(json);
      if (!accepted) return { ok: false, code: "SEND_REJECTED" };
      return { ok: true, value: accepted };
    } catch (error) {
      return { ok: false, code: error instanceof UltraMsgHttpError ? error.code : "SEND_UNKNOWN" };
    }
  }

  async exchangeAuthorizationCode(): Promise<WhatsAppProviderResult<WhatsAppAccessCredential>> {
    return { ok: false, code: "NOT_CONFIGURED" };
  }
  async inspectGrantedBusinessAccess(): Promise<WhatsAppProviderResult<WhatsAppInspectedAccess>> {
    return { ok: false, code: "NOT_CONFIGURED" };
  }
  async listGrantedWhatsAppBusinessAccounts(): Promise<WhatsAppProviderResult<WhatsAppGrantedWaba[]>> {
    return { ok: false, code: "NOT_CONFIGURED" };
  }
  async listGrantedPhoneNumbers(): Promise<WhatsAppProviderResult<WhatsAppGrantedPhone[]>> {
    return { ok: false, code: "NOT_CONFIGURED" };
  }
  async validatePhoneNumberAccess(): Promise<WhatsAppProviderResult<WhatsAppGrantedPhone>> {
    return { ok: false, code: "NOT_CONFIGURED" };
  }
  async validateCredential(accessToken: string): Promise<WhatsAppProviderResult<{ isValid: boolean }>> {
    const session = await this.getSession(accessToken);
    if (!session.ok) return { ok: false, code: session.code };
    return { ok: true, value: { isValid: session.value.status === "AUTHENTICATED" } };
  }
  async subscribeWaba(): Promise<WhatsAppProviderResult<{ success: boolean }>> {
    return { ok: false, code: "NOT_CONFIGURED" };
  }
  async getWebhookSubscriptionStatus(): Promise<WhatsAppProviderResult<{ subscribed: boolean }>> {
    return { ok: false, code: "NOT_CONFIGURED" };
  }
  async listMessageTemplates(): Promise<WhatsAppProviderResult<WhatsAppProviderTemplate[]>> {
    return { ok: true, value: [] };
  }
  async sendTemplateMessage(): Promise<WhatsAppProviderResult<WhatsAppSendTextAccepted>> {
    return { ok: false, code: "NOT_CONFIGURED" };
  }
  async getMediaMetadata(): Promise<WhatsAppProviderResult<WhatsAppMediaMetadata>> {
    return { ok: false, code: "NOT_CONFIGURED" };
  }
  async downloadMedia(
    _accessToken: string,
    url: string,
  ): Promise<WhatsAppProviderResult<WhatsAppMediaBytes>> {
    if (!url.startsWith("https://") && !url.startsWith("http://")) {
      return { ok: false, code: "VALIDATION_FAILED" };
    }
    try {
      const response = await (this.fetchImpl ?? fetch)(url, { redirect: "error" });
      if (response.status < 200 || response.status >= 300) return { ok: false, code: "INVALID_RESPONSE" };
      const body = Buffer.from(await response.arrayBuffer());
      return { ok: true, value: { body, contentType: response.headers.get("content-type") } };
    } catch {
      return { ok: false, code: "SEND_UNKNOWN" };
    }
  }
  async uploadMedia(): Promise<WhatsAppProviderResult<{ mediaId: string }>> {
    return { ok: false, code: "NOT_CONFIGURED" };
  }
  async sendMediaMessage(
    _input: WhatsAppSendMediaInput,
  ): Promise<WhatsAppProviderResult<WhatsAppSendTextAccepted>> {
    return { ok: false, code: "NOT_CONFIGURED" };
  }
}

export function createUltraMsgWhatsAppProvider(fetchImpl?: typeof fetch): UltraMsgWhatsAppProvider {
  const cfg = ultramsgRuntimeConfig();
  return new UltraMsgWhatsAppProvider(cfg.instanceId, cfg.apiUrl, fetchImpl);
}
