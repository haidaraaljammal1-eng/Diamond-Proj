import { env } from "src/config/env";
import {
  WHAPI_BASE64_MAX_LENGTH,
  WHAPI_DOCUMENT_FILENAME_MAX,
  WHAPI_MEDIA_MAX_BYTES,
  whapiRuntimeConfig,
  whapiWebhookSecretHeaderName,
} from "src/modules/whatsapp/whapi.config";
import { mapWhapiHealthStatus } from "src/modules/whatsapp/whapi.status";
import { WHAPI_CAPABILITIES } from "src/modules/whatsapp/whatsapp.capabilities";
import {
  mapWhapiHttpFailure,
  WhapiClient,
  WhapiHttpError,
} from "src/modules/whatsapp/providers/whapi.client";
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

function asBool(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "on" || v === "1";
  }
  return false;
}

function parseSendAccepted(json: unknown): WhatsAppSendTextAccepted | null {
  const body = asRecord(json);
  if (!body) return null;
  const message = asRecord(body.message) ?? body;
  const id = asString(message.id) ?? asString(body.id);
  if (id) return { providerMessageId: id };
  return { providerMessageId: "" };
}

function whapiWebhookEventEnabled(
  webhooks: unknown,
  eventType: string,
  method = "post",
): boolean {
  if (!Array.isArray(webhooks)) return false;
  for (const entry of webhooks) {
    const hook = asRecord(entry);
    const url = asString(hook?.url);
    if (!url) continue;
    const events = hook?.events;
    if (!Array.isArray(events)) continue;
    for (const ev of events) {
      const row = asRecord(ev);
      if (!row) continue;
      const type = asString(row.type)?.toLowerCase();
      const evMethod = asString(row.method)?.toLowerCase() ?? "post";
      if (type === eventType.toLowerCase() && evMethod === method.toLowerCase()) return true;
    }
  }
  return false;
}

function parseWhapiSettings(json: unknown): WhatsAppInstanceSettings {
  const body = asRecord(json) ?? {};
  const webhookList = Array.isArray(body.webhooks) ? body.webhooks : null;
  const firstHook = webhookList?.length ? asRecord(webhookList[0]) : null;
  const webhookUrl =
    asString(firstHook?.url) ?? asString(body.webhook_url) ?? asString(body.webhookUrl);
  const messagesFromHooks = whapiWebhookEventEnabled(webhookList, "messages");
  const statusesFromHooks = whapiWebhookEventEnabled(webhookList, "statuses");
  const events = asRecord(body.webhooks) ?? asRecord(body.events) ?? body;
  const messages =
    messagesFromHooks ||
    asBool(events.messages) ||
    asBool(events.message) ||
    asBool(body.webhook_messages) ||
    asBool(body.messages);
  const statuses =
    statusesFromHooks ||
    asBool(events.statuses) ||
    asBool(events.status) ||
    asBool(body.webhook_statuses) ||
    asBool(body.statuses);
  const media = asRecord(body.media);
  const autoDownload = media?.auto_download;
  const downloadDisabled =
    autoDownload === undefined ||
    autoDownload === false ||
    (Array.isArray(autoDownload) && autoDownload.length === 0);
  return {
    sendDelay: 0,
    sendDelayMax: 0,
    webhookUrl,
    webhookMessageReceived: messages,
    webhookMessageCreate: messages,
    webhookMessageAck: statuses,
    webhookMessageDownloadMedia: !downloadDisabled,
  };
}

function mediaPath(kind: WhatsAppSendOutboundMediaInput["kind"]): string {
  switch (kind) {
    case "IMAGE":
      return "/messages/image";
    case "DOCUMENT":
      return "/messages/document";
    case "AUDIO":
      return "/messages/audio";
    case "VIDEO":
      return "/messages/video";
    default:
      return "/messages/document";
  }
}

function mediaMaxBytes(kind: WhatsAppSendOutboundMediaInput["kind"]): number {
  switch (kind) {
    case "IMAGE":
      return WHAPI_MEDIA_MAX_BYTES.IMAGE;
    case "AUDIO":
      return WHAPI_MEDIA_MAX_BYTES.AUDIO;
    case "VIDEO":
      return WHAPI_MEDIA_MAX_BYTES.VIDEO;
    default:
      return WHAPI_MEDIA_MAX_BYTES.DOCUMENT;
  }
}

export class WhapiWhatsAppProvider implements WhatsAppProvider {
  readonly name = "whapi";
  readonly configured = true;

  constructor(
    private readonly apiUrl: string,
    private readonly fetchImpl?: typeof fetch,
  ) {}

  capabilities() {
    return WHAPI_CAPABILITIES;
  }

  private client(token: string): WhapiClient {
    return new WhapiClient({ apiUrl: this.apiUrl, token, fetchImpl: this.fetchImpl });
  }

  async getSession(accessToken: string): Promise<WhatsAppProviderResult<WhatsAppSessionSnapshot>> {
    try {
      const { status, json } = await this.client(accessToken).getJson("/health");
      if (status < 200 || status >= 300) return { ok: false, code: mapWhapiHttpFailure(status, json) };
      const mapped = mapWhapiHealthStatus(json);
      const raw = asString(asRecord(asRecord(json)?.status)?.text) ?? "unknown";
      return { ok: true, value: { status: mapped, rawStatus: raw } };
    } catch (error) {
      return { ok: false, code: error instanceof WhapiHttpError ? error.code : "SEND_UNKNOWN" };
    }
  }

  async getInstanceIdentity(
    accessToken: string,
  ): Promise<WhatsAppProviderResult<WhatsAppInstanceIdentity>> {
    try {
      const health = await this.client(accessToken).getJson("/health");
      if (health.status < 200 || health.status >= 300) {
        return { ok: false, code: mapWhapiHttpFailure(health.status, health.json) };
      }
      const body = asRecord(health.json) ?? {};
      const user = asRecord(body.user) ?? asRecord(body.me) ?? body;
      const chatId = asString(user.id) ?? asString(user.chat_id) ?? asString(body.channel_id);
      const displayName = asString(user.name) ?? asString(user.pushname);
      const displayPhone =
        asString(user.phone) ??
        asString(body.phone) ??
        (chatId && chatId.includes("@") ? chatId.split("@")[0] : chatId) ??
        null;
      return { ok: true, value: { chatId, displayPhone, displayName } };
    } catch (error) {
      return { ok: false, code: error instanceof WhapiHttpError ? error.code : "SEND_UNKNOWN" };
    }
  }

  async getInstanceSettings(
    accessToken: string,
  ): Promise<WhatsAppProviderResult<WhatsAppInstanceSettings>> {
    try {
      const { status, json } = await this.client(accessToken).getJson("/settings");
      if (status < 200 || status >= 300) return { ok: false, code: mapWhapiHttpFailure(status, json) };
      return { ok: true, value: parseWhapiSettings(json) };
    } catch (error) {
      return { ok: false, code: error instanceof WhapiHttpError ? error.code : "SEND_UNKNOWN" };
    }
  }

  async getQr(accessToken: string): Promise<WhatsAppProviderResult<WhatsAppQrPayload>> {
    try {
      const client = this.client(accessToken);
      const jsonResult = await client.getJson("/users/login");
      if (jsonResult.status >= 200 && jsonResult.status < 300) {
        const body = asRecord(jsonResult.json) ?? {};
        const qrCode = asString(body.qr) ?? asString(body.code);
        const image = asString(body.base64) ?? asString(body.image);
        if (qrCode || image) {
          return {
            ok: true,
            value: {
              qrCode,
              imageDataUrl:
                image && image.startsWith("data:")
                  ? image
                  : image
                    ? `data:image/png;base64,${image}`
                    : null,
            },
          };
        }
      }
      const image = await client.getBinary("/users/login/qr");
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
      return { ok: false, code: error instanceof WhapiHttpError ? error.code : "SEND_UNKNOWN" };
    }
  }

  async applyWebhookSettings(
    accessToken: string,
    settings: WhatsAppInstanceSettings,
  ): Promise<WhatsAppProviderResult<WhatsAppInstanceSettings>> {
    if (!env.WHAPI_CONFIGURE_WEBHOOK) {
      return { ok: false, code: "NOT_CONFIGURED" };
    }
    const secret = env.WHAPI_WEBHOOK_SECRET.trim();
    if (!secret) return { ok: false, code: "NOT_CONFIGURED" };
    try {
      const events: { type: string; method: string }[] = [];
      if (settings.webhookMessageReceived || settings.webhookMessageCreate) {
        events.push({ type: "messages", method: "post" });
      }
      if (settings.webhookMessageAck) {
        events.push({ type: "statuses", method: "post" });
      }
      const patchBody: Record<string, unknown> = {
        webhooks: [
          {
            url: settings.webhookUrl ?? "",
            mode: "body",
            headers: {
              [whapiWebhookSecretHeaderName()]: secret,
            },
            events,
          },
        ],
        media: { auto_download: [] },
      };
      const { status, json } = await this.client(accessToken).patchJson("/settings", patchBody);
      if (status < 200 || status >= 300) return { ok: false, code: mapWhapiHttpFailure(status, json) };
      return this.getInstanceSettings(accessToken);
    } catch (error) {
      return { ok: false, code: error instanceof WhapiHttpError ? error.code : "SEND_UNKNOWN" };
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
    const to = input.toWaId.trim();
    if (!to) return { ok: false, code: "VALIDATION_FAILED" };
    try {
      const { status, json } = await this.client(input.accessToken).postJson("/messages/text", {
        to,
        body: input.text,
      });
      if (status < 200 || status >= 300) return { ok: false, code: mapWhapiHttpFailure(status, json) };
      const accepted = parseSendAccepted(json);
      if (!accepted) return { ok: false, code: "SEND_REJECTED" };
      return { ok: true, value: accepted };
    } catch (error) {
      return { ok: false, code: error instanceof WhapiHttpError ? error.code : "SEND_UNKNOWN" };
    }
  }

  async sendOutboundMedia(
    input: WhatsAppSendOutboundMediaInput,
  ): Promise<WhatsAppProviderResult<WhatsAppSendTextAccepted>> {
    const ready = await this.assertAuthenticated(input.accessToken);
    if (!ready.ok) return ready;
    if (input.bytes.length > mediaMaxBytes(input.kind)) return { ok: false, code: "VALIDATION_FAILED" };
    const encoded = input.bytes.toString("base64");
    if (encoded.length > WHAPI_BASE64_MAX_LENGTH) return { ok: false, code: "VALIDATION_FAILED" };
    const dataUri = `data:${input.mimeType};base64,${encoded}`;
    const body: Record<string, unknown> = {
      to: input.toChatId,
      media: dataUri,
      mime_type: input.mimeType,
    };
    if (input.kind === "DOCUMENT") {
      body.filename = input.filename.slice(0, WHAPI_DOCUMENT_FILENAME_MAX);
    }
    if (input.kind !== "AUDIO" && input.caption) {
      body.caption = input.caption.slice(0, 1024);
    }
    try {
      const { status, json } = await this.client(input.accessToken).postJson(mediaPath(input.kind), body);
      if (status < 200 || status >= 300) return { ok: false, code: mapWhapiHttpFailure(status, json) };
      const accepted = parseSendAccepted(json);
      if (!accepted) return { ok: false, code: "SEND_REJECTED" };
      return { ok: true, value: accepted };
    } catch (error) {
      return { ok: false, code: error instanceof WhapiHttpError ? error.code : "SEND_UNKNOWN" };
    }
  }

  /** Provider read receipt (WHAPI-2 may wire from conversation read). */
  async markProviderMessageRead(
    accessToken: string,
    providerMessageId: string,
  ): Promise<WhatsAppProviderResult<{ success: boolean }>> {
    const id = providerMessageId.trim();
    if (!id) return { ok: false, code: "VALIDATION_FAILED" };
    try {
      const { status, json } = await this.client(accessToken).putJson(`/messages/${encodeURIComponent(id)}`, {});
      if (status < 200 || status >= 300) return { ok: false, code: mapWhapiHttpFailure(status, json) };
      return { ok: true, value: { success: true } };
    } catch (error) {
      return { ok: false, code: error instanceof WhapiHttpError ? error.code : "SEND_UNKNOWN" };
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
  async downloadMedia(): Promise<WhatsAppProviderResult<WhatsAppMediaBytes>> {
    return { ok: false, code: "NOT_CONFIGURED" };
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

export function createWhapiWhatsAppProvider(fetchImpl?: typeof fetch): WhapiWhatsAppProvider {
  const cfg = whapiRuntimeConfig();
  return new WhapiWhatsAppProvider(cfg.apiUrl, fetchImpl);
}
