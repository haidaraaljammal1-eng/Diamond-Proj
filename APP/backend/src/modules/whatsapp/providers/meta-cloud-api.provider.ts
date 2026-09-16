import { WHATSAPP_MAX_PHONE_PAGES, WHATSAPP_MAX_WABAS } from "src/modules/whatsapp/whatsapp.constants";
import { normalizeProviderTemplate } from "src/modules/whatsapp/whatsapp.templates";
import { META_CLOUD_CAPABILITIES } from "src/modules/whatsapp/whatsapp.capabilities";
import type {
  GraphHttp,
  WhatsAppAccessCredential,
  WhatsAppGrantedPhone,
  WhatsAppGrantedWaba,
  WhatsAppInspectedAccess,
  WhatsAppInstanceIdentity,
  WhatsAppInstanceSettings,
  WhatsAppMediaBytes,
  WhatsAppMediaMetadata,
  WhatsAppMetaRuntimeConfig,
  WhatsAppProvider,
  WhatsAppProviderFailure,
  WhatsAppProviderResult,
  WhatsAppProviderTemplate,
  WhatsAppQrPayload,
  WhatsAppSendMediaInput,
  WhatsAppSendOutboundMediaInput,
  WhatsAppSendTemplateInput,
  WhatsAppSendTextAccepted,
  WhatsAppSessionSnapshot,
  WhatsAppUploadMediaInput,
} from "src/modules/whatsapp/whatsapp.types";

const GRAPH_HOST = "https://graph.facebook.com";
const HTTP_TIMEOUT_MS = 15_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function graphId(value: unknown): string | null {
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return value;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return String(Math.trunc(value));
  }
  return null;
}

function graphError(json: unknown): { code?: number; fbtraceId?: string } {
  const root = asRecord(json);
  const err = asRecord(root?.error);
  if (!err) return {};
  return {
    code: typeof err.code === "number" ? err.code : undefined,
    fbtraceId: typeof err.fbtrace_id === "string" ? err.fbtrace_id : undefined,
  };
}

function fail(
  code: WhatsAppProviderFailure["code"],
  json?: unknown,
): WhatsAppProviderFailure {
  const g = graphError(json);
  return {
    ok: false,
    code,
    providerErrorCode: g.code !== undefined ? `graph:${g.code}` : undefined,
    fbtraceId: g.fbtraceId,
  };
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function defaultGetJson(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; json: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "GET", headers, signal: ctrl.signal });
    const text = await res.text();
    if (!text) return { status: res.status, json: null };
    try {
      return { status: res.status, json: JSON.parse(text) as unknown };
    } catch {
      return { status: res.status, json: { error: { code: 0 } } };
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Official Meta Cloud API / Embedded Signup calls only:
 * - GET /{version}/oauth/access_token (code exchange; no redirect_uri)
 * - GET /{version}/debug_token
 * - GET /{version}/{waba-id}?fields=id,name
 * - GET /{version}/{waba-id}/phone_numbers?fields=id,display_phone_number,verified_name
 * - GET /{version}/{phone-number-id}?fields=id,display_phone_number,verified_name
 * - POST /{version}/{phone-number-id}/messages (text, template, media; no HTTP retries)
 * - POST /{version}/{waba-id}/subscribed_apps
 * - GET /{version}/{waba-id}/subscribed_apps
 * - GET /{version}/{waba-id}/message_templates?fields=id,name,language,status,category,components
 * - POST /{version}/{phone-number-id}/media
 * - GET /{version}/{media-id}
 * - GET {temporary media URL} with Bearer (download)
 *
 * Does not register, migrate, deregister, or receive webhooks.
 */
export class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta_cloud_api";
  readonly configured = true;

  constructor(
    private readonly cfg: WhatsAppMetaRuntimeConfig,
    private readonly http: GraphHttp = { getJson: defaultGetJson, postJson: defaultPostJson },
  ) {}

  capabilities() {
    return META_CLOUD_CAPABILITIES;
  }

  async getSession(): Promise<WhatsAppProviderResult<WhatsAppSessionSnapshot>> {
    return { ok: false, code: "NOT_CONFIGURED" };
  }
  async getInstanceIdentity(): Promise<WhatsAppProviderResult<WhatsAppInstanceIdentity>> {
    return { ok: false, code: "NOT_CONFIGURED" };
  }
  async getInstanceSettings(): Promise<WhatsAppProviderResult<WhatsAppInstanceSettings>> {
    return { ok: false, code: "NOT_CONFIGURED" };
  }
  async getQr(): Promise<WhatsAppProviderResult<WhatsAppQrPayload>> {
    return { ok: false, code: "NOT_CONFIGURED" };
  }
  async applyWebhookSettings(): Promise<WhatsAppProviderResult<WhatsAppInstanceSettings>> {
    return { ok: false, code: "NOT_CONFIGURED" };
  }
  async sendOutboundMedia(
    input: WhatsAppSendOutboundMediaInput,
  ): Promise<WhatsAppProviderResult<WhatsAppSendTextAccepted>> {
    const uploaded = await this.uploadMedia({
      accessToken: input.accessToken,
      phoneNumberId: input.phoneNumberId,
      bytes: input.bytes,
      mimeType: input.mimeType,
      filename: input.filename,
    });
    if (!uploaded.ok) return uploaded;
    return this.sendMediaMessage({
      accessToken: input.accessToken,
      phoneNumberId: input.phoneNumberId,
      toWaId: input.toChatId,
      kind: input.kind,
      mediaId: uploaded.value.mediaId,
      caption: input.caption,
    });
  }

  private async getJson(
    url: string,
    headers: Record<string, string>,
  ): Promise<{ status: number; json: unknown }> {
    return this.http.getJson(url, headers);
  }

  private async postJson(
    url: string,
    headers: Record<string, string>,
    body?: string,
  ): Promise<{ status: number; json: unknown }> {
    if (this.http.postJson) return this.http.postJson(url, headers, body);
    return defaultPostJson(url, headers, body);
  }

  private async postMultipart(
    url: string,
    headers: Record<string, string>,
    body: FormData,
  ): Promise<{ status: number; json: unknown }> {
    if (this.http.postMultipart) return this.http.postMultipart(url, headers, body);
    return defaultPostMultipart(url, headers, body);
  }

  private async getBinary(
    url: string,
    headers: Record<string, string>,
  ): Promise<{ status: number; contentType: string | null; body: Buffer }> {
    if (this.http.getBinary) return this.http.getBinary(url, headers);
    return defaultGetBinary(url, headers);
  }

  private graphUrl(pathAndQuery: string): string {
    const path = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
    return `${GRAPH_HOST}/${this.cfg.graphApiVersion}${path}`;
  }

  private appAccessToken(): string {
    return `${this.cfg.appId}|${this.cfg.appSecret}`;
  }

  async exchangeAuthorizationCode(
    code: string,
  ): Promise<WhatsAppProviderResult<WhatsAppAccessCredential>> {
    const params = new URLSearchParams({
      client_id: this.cfg.appId,
      client_secret: this.cfg.appSecret,
      code,
    });
    const url = this.graphUrl(`/oauth/access_token?${params.toString()}`);
    let status = 0;
    let json: unknown;
    try {
      ({ status, json } = await this.http.getJson(url, {}));
    } catch {
      return { ok: false, code: "AUTH_FAILED" };
    }
    if (status < 200 || status >= 300) return fail("AUTH_FAILED", json);
    const body = asRecord(json);
    const accessToken = typeof body?.access_token === "string" ? body.access_token : "";
    if (!accessToken) return fail("INVALID_RESPONSE", json);
    const expiresIn = typeof body?.expires_in === "number" ? body.expires_in : null;
    const expiresAt =
      expiresIn !== null && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null;
    return { ok: true, value: { accessToken, expiresAt } };
  }

  async inspectGrantedBusinessAccess(
    accessToken: string,
  ): Promise<WhatsAppProviderResult<WhatsAppInspectedAccess>> {
    const url = this.graphUrl(
      `/debug_token?${new URLSearchParams({ input_token: accessToken }).toString()}`,
    );
    let status = 0;
    let json: unknown;
    try {
      ({ status, json } = await this.http.getJson(url, bearer(this.appAccessToken())));
    } catch {
      return { ok: false, code: "AUTH_FAILED" };
    }
    if (status < 200 || status >= 300) return fail("AUTH_FAILED", json);
    const data = asRecord(asRecord(json)?.data);
    if (!data) return fail("INVALID_RESPONSE", json);
    if (data.is_valid !== true) return fail("AUTH_FAILED", json);
    const appId = graphId(data.app_id);
    if (appId && appId !== this.cfg.appId) return { ok: false, code: "AUTH_FAILED" };
    const wabaIds = extractWabaIds(data.granular_scopes);
    const expiresAtUnix = typeof data.expires_at === "number" ? data.expires_at : 0;
    const expiresAt = expiresAtUnix > 0 ? new Date(expiresAtUnix * 1000) : null;
    return {
      ok: true,
      value: { isValid: true, expiresAt, wabaIds, appId: appId ?? this.cfg.appId },
    };
  }

  async listGrantedWhatsAppBusinessAccounts(
    accessToken: string,
    wabaIds: string[],
  ): Promise<WhatsAppProviderResult<WhatsAppGrantedWaba[]>> {
    const unique = [...new Set(wabaIds.filter((id) => graphId(id)))].slice(0, WHATSAPP_MAX_WABAS);
    if (unique.length === 0) return { ok: false, code: "WABA_NOT_GRANTED" };
    const wabas: WhatsAppGrantedWaba[] = [];
    for (const wabaId of unique) {
      const url = this.graphUrl(`/${encodeURIComponent(wabaId)}?fields=id,name`);
      let status = 0;
      let json: unknown;
      try {
        ({ status, json } = await this.http.getJson(url, bearer(accessToken)));
      } catch {
        continue;
      }
      if (status < 200 || status >= 300) continue;
      const body = asRecord(json);
      const id = graphId(body?.id);
      if (!id) continue;
      const name = typeof body?.name === "string" && body.name.length > 0 ? body.name : null;
      wabas.push({ wabaId: id, businessName: name });
    }
    if (wabas.length === 0) return { ok: false, code: "WABA_NOT_GRANTED" };
    return { ok: true, value: wabas };
  }

  async listGrantedPhoneNumbers(
    accessToken: string,
    wabaId: string,
  ): Promise<WhatsAppProviderResult<WhatsAppGrantedPhone[]>> {
    const phones: WhatsAppGrantedPhone[] = [];
    let after: string | undefined;
    for (let page = 0; page < WHATSAPP_MAX_PHONE_PAGES; page += 1) {
      const params = new URLSearchParams({
        fields: "id,display_phone_number,verified_name",
      });
      if (after) params.set("after", after);
      const url = this.graphUrl(
        `/${encodeURIComponent(wabaId)}/phone_numbers?${params.toString()}`,
      );
      let status = 0;
      let json: unknown;
      try {
        ({ status, json } = await this.http.getJson(url, bearer(accessToken)));
      } catch {
        return { ok: false, code: "VALIDATION_FAILED" };
      }
      if (status < 200 || status >= 300) return fail("VALIDATION_FAILED", json);
      const body = asRecord(json);
      const data = Array.isArray(body?.data) ? body.data : null;
      if (!data) return fail("INVALID_RESPONSE", json);
      for (const item of data) {
        const row = asRecord(item);
        const phoneNumberId = graphId(row?.id);
        const displayPhoneNumber =
          typeof row?.display_phone_number === "string" ? row.display_phone_number : "";
        if (!phoneNumberId || !displayPhoneNumber) continue;
        const verifiedName =
          typeof row?.verified_name === "string" && row.verified_name.length > 0
            ? row.verified_name
            : null;
        phones.push({
          wabaId,
          phoneNumberId,
          displayPhoneNumber,
          verifiedName,
        });
      }
      const paging = asRecord(body?.paging);
      const cursors = asRecord(paging?.cursors);
      const nextAfter = typeof cursors?.after === "string" ? cursors.after : undefined;
      if (!nextAfter) break;
      after = nextAfter;
    }
    return { ok: true, value: phones };
  }

  async validatePhoneNumberAccess(
    accessToken: string,
    wabaId: string,
    phoneNumberId: string,
  ): Promise<WhatsAppProviderResult<WhatsAppGrantedPhone>> {
    const listed = await this.listGrantedPhoneNumbers(accessToken, wabaId);
    if (!listed.ok) return listed;
    const match = listed.value.find((p) => p.phoneNumberId === phoneNumberId);
    if (!match) return { ok: false, code: "PHONE_NOT_GRANTED" };

    const url = this.graphUrl(
      `/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name`,
    );
    let status = 0;
    let json: unknown;
    try {
      ({ status, json } = await this.http.getJson(url, bearer(accessToken)));
    } catch {
      return { ok: false, code: "VALIDATION_FAILED" };
    }
    if (status < 200 || status >= 300) return fail("VALIDATION_FAILED", json);
    const body = asRecord(json);
    const id = graphId(body?.id);
    if (id !== phoneNumberId) return { ok: false, code: "PHONE_NOT_GRANTED" };
    const displayPhoneNumber =
      typeof body?.display_phone_number === "string" && body.display_phone_number.length > 0
        ? body.display_phone_number
        : match.displayPhoneNumber;
    const verifiedName =
      typeof body?.verified_name === "string" && body.verified_name.length > 0
        ? body.verified_name
        : match.verifiedName;
    return {
      ok: true,
      value: { wabaId, phoneNumberId: id, displayPhoneNumber, verifiedName },
    };
  }

  async validateCredential(
    accessToken: string,
  ): Promise<WhatsAppProviderResult<{ isValid: boolean }>> {
    const inspected = await this.inspectGrantedBusinessAccess(accessToken);
    if (!inspected.ok) return inspected;
    if (!inspected.value.isValid) return { ok: false, code: "AUTH_FAILED" };
    return { ok: true, value: { isValid: true } };
  }

  /**
   * POST /{waba-id}/subscribed_apps
   * Not called automatically by webhook ingest or connection select.
   */
  async subscribeWaba(
    accessToken: string,
    wabaId: string,
  ): Promise<WhatsAppProviderResult<{ success: boolean }>> {
    const id = graphId(wabaId);
    if (!id) return { ok: false, code: "VALIDATION_FAILED" };
    const url = this.graphUrl(`/${encodeURIComponent(id)}/subscribed_apps`);
    let status = 0;
    let json: unknown;
    try {
      ({ status, json } = await this.postJson(url, bearer(accessToken), "{}"));
    } catch {
      return { ok: false, code: "VALIDATION_FAILED" };
    }
    if (status < 200 || status >= 300) return fail("VALIDATION_FAILED", json);
    const body = asRecord(json);
    if (body?.success !== true) return fail("INVALID_RESPONSE", json);
    return { ok: true, value: { success: true } };
  }

  /**
   * GET /{waba-id}/subscribed_apps
   * subscribed is true only when META_APP_ID appears in the returned apps.
   */
  async getWebhookSubscriptionStatus(
    accessToken: string,
    wabaId: string,
  ): Promise<WhatsAppProviderResult<{ subscribed: boolean }>> {
    const id = graphId(wabaId);
    if (!id) return { ok: false, code: "VALIDATION_FAILED" };
    const url = this.graphUrl(`/${encodeURIComponent(id)}/subscribed_apps`);
    let status = 0;
    let json: unknown;
    try {
      ({ status, json } = await this.getJson(url, bearer(accessToken)));
    } catch {
      return { ok: false, code: "VALIDATION_FAILED" };
    }
    if (status < 200 || status >= 300) return fail("VALIDATION_FAILED", json);
    const body = asRecord(json);
    const data = Array.isArray(body?.data) ? body.data : [];
    const subscribed = data.some((entry) => {
      const row = asRecord(entry);
      const api = asRecord(row?.whatsapp_business_api_data);
      const appId = graphId(api?.id) ?? graphId(row?.id);
      return appId === this.cfg.appId;
    });
    return { ok: true, value: { subscribed } };
  }

  /**
   * POST /{phone-number-id}/messages
   * Official Cloud API text contract. Single HTTP POST — no retries.
   */
  async sendTextMessage(input: {
    accessToken: string;
    phoneNumberId: string;
    toWaId: string;
    text: string;
  }): Promise<WhatsAppProviderResult<{ providerMessageId: string }>> {
    const phoneNumberId = graphId(input.phoneNumberId);
    if (!phoneNumberId) return { ok: false, code: "VALIDATION_FAILED" };
    const url = this.graphUrl(`/${encodeURIComponent(phoneNumberId)}/messages`);
    const body = JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.toWaId,
      type: "text",
      text: { body: input.text },
    });
    let status = 0;
    let json: unknown;
    try {
      ({ status, json } = await this.postJsonOnce(url, bearer(input.accessToken), body));
    } catch {
      return { ok: false, code: "SEND_UNKNOWN" };
    }
    if (status === 401 || status === 403) return fail("SEND_AUTH_FAILED", json);
    if (status === 429) return fail("SEND_RATE_LIMITED", json);
    if (status >= 500) return fail("SEND_UNKNOWN", json);
    if (status < 200 || status >= 300) return failSendRejected(json);
    const providerMessageId = extractProviderMessageId(json);
    if (!providerMessageId) return fail("INVALID_RESPONSE", json);
    return { ok: true, value: { providerMessageId } };
  }

  /**
   * GET /{waba-id}/message_templates
   * Official fields: id,name,language,status,category,components
   */
  async listMessageTemplates(
    accessToken: string,
    wabaId: string,
  ): Promise<WhatsAppProviderResult<WhatsAppProviderTemplate[]>> {
    const id = graphId(wabaId);
    if (!id) return { ok: false, code: "VALIDATION_FAILED" };
    const templates: WhatsAppProviderTemplate[] = [];
    let after: string | undefined;
    for (let page = 0; page < WHATSAPP_MAX_PHONE_PAGES; page += 1) {
      const params = new URLSearchParams({
        fields: "id,name,language,status,category,components",
        limit: "100",
      });
      if (after) params.set("after", after);
      const url = this.graphUrl(`/${encodeURIComponent(id)}/message_templates?${params.toString()}`);
      let status = 0;
      let json: unknown;
      try {
        ({ status, json } = await this.getJson(url, bearer(accessToken)));
      } catch {
        return { ok: false, code: "VALIDATION_FAILED" };
      }
      if (status < 200 || status >= 300) return fail("VALIDATION_FAILED", json);
      const body = asRecord(json);
      const data = Array.isArray(body?.data) ? body.data : [];
      for (const row of data) {
        const normalized = normalizeProviderTemplate(row);
        if (normalized) templates.push(normalized);
      }
      const paging = asRecord(body?.paging);
      const cursors = asRecord(paging?.cursors);
      const nextAfter = typeof cursors?.after === "string" ? cursors.after : undefined;
      if (!nextAfter) break;
      after = nextAfter;
    }
    return { ok: true, value: templates };
  }

  /**
   * POST /{phone-number-id}/messages — type=template. Single HTTP POST — no retries.
   */
  async sendTemplateMessage(
    input: WhatsAppSendTemplateInput,
  ): Promise<WhatsAppProviderResult<WhatsAppSendTextAccepted>> {
    const phoneNumberId = graphId(input.phoneNumberId);
    if (!phoneNumberId) return { ok: false, code: "VALIDATION_FAILED" };
    const url = this.graphUrl(`/${encodeURIComponent(phoneNumberId)}/messages`);
    const body = JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.toWaId,
      type: "template",
      template: {
        name: input.name,
        language: { code: input.language },
        ...(input.components.length > 0 ? { components: input.components } : {}),
      },
    });
    return this.postOutboundMessage(url, input.accessToken, body);
  }

  /**
   * GET /{media-id} — official metadata including a short-lived URL.
   */
  async getMediaMetadata(
    accessToken: string,
    mediaId: string,
  ): Promise<WhatsAppProviderResult<WhatsAppMediaMetadata>> {
    const id = asStringish(mediaId);
    if (!id) return { ok: false, code: "VALIDATION_FAILED" };
    const url = this.graphUrl(`/${encodeURIComponent(id)}`);
    let status = 0;
    let json: unknown;
    try {
      ({ status, json } = await this.getJson(url, bearer(accessToken)));
    } catch {
      return { ok: false, code: "VALIDATION_FAILED" };
    }
    if (status < 200 || status >= 300) return fail("VALIDATION_FAILED", json);
    const body = asRecord(json);
    const mediaUrl = asStringish(body?.url);
    if (!mediaUrl || !mediaUrl.startsWith("https://")) return fail("INVALID_RESPONSE", json);
    return {
      ok: true,
      value: {
        mediaId: asStringish(body?.id) ?? id,
        mimeType: asStringish(body?.mime_type),
        fileSize: typeof body?.file_size === "number" ? body.file_size : null,
        sha256: asStringish(body?.sha256),
        url: mediaUrl,
      },
    };
  }

  /** GET the temporary media URL with the same Bearer token. Never returned to clients. */
  async downloadMedia(
    accessToken: string,
    url: string,
  ): Promise<WhatsAppProviderResult<WhatsAppMediaBytes>> {
    if (!url.startsWith("https://")) return { ok: false, code: "VALIDATION_FAILED" };
    let status = 0;
    let contentType: string | null = null;
    let body: Buffer = Buffer.alloc(0);
    try {
      ({ status, contentType, body } = await this.getBinary(url, bearer(accessToken)));
    } catch {
      return { ok: false, code: "VALIDATION_FAILED" };
    }
    if (status < 200 || status >= 300 || body.length === 0) {
      return { ok: false, code: "INVALID_RESPONSE" };
    }
    return { ok: true, value: { body, contentType } };
  }

  /**
   * POST /{phone-number-id}/media — multipart messaging_product, file, type.
   * Single HTTP POST — no retries.
   */
  async uploadMedia(
    input: WhatsAppUploadMediaInput,
  ): Promise<WhatsAppProviderResult<{ mediaId: string }>> {
    const phoneNumberId = graphId(input.phoneNumberId);
    if (!phoneNumberId) return { ok: false, code: "VALIDATION_FAILED" };
    const url = this.graphUrl(`/${encodeURIComponent(phoneNumberId)}/media`);
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", input.mimeType);
    form.append("file", new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }), input.filename);
    let status = 0;
    let json: unknown;
    try {
      ({ status, json } = await this.postMultipart(url, bearer(input.accessToken), form));
    } catch {
      return { ok: false, code: "SEND_UNKNOWN" };
    }
    if (status === 401 || status === 403) return fail("SEND_AUTH_FAILED", json);
    if (status === 429) return fail("SEND_RATE_LIMITED", json);
    if (status >= 500) return fail("SEND_UNKNOWN", json);
    if (status < 200 || status >= 300) return failSendRejected(json);
    const body = asRecord(json);
    const mediaId = asStringish(body?.id);
    if (!mediaId) return fail("INVALID_RESPONSE", json);
    return { ok: true, value: { mediaId } };
  }

  /**
   * POST /{phone-number-id}/messages — image/document/audio/video by uploaded id.
   * Single HTTP POST — no retries. Caption only for types that officially support it.
   */
  async sendMediaMessage(
    input: WhatsAppSendMediaInput,
  ): Promise<WhatsAppProviderResult<WhatsAppSendTextAccepted>> {
    const phoneNumberId = graphId(input.phoneNumberId);
    if (!phoneNumberId) return { ok: false, code: "VALIDATION_FAILED" };
    const field = input.kind.toLowerCase();
    const media: Record<string, string> = { id: input.mediaId };
    if (input.caption && (input.kind === "IMAGE" || input.kind === "VIDEO" || input.kind === "DOCUMENT")) {
      media.caption = input.caption;
    }
    const url = this.graphUrl(`/${encodeURIComponent(phoneNumberId)}/messages`);
    const body = JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.toWaId,
      type: field,
      [field]: media,
    });
    return this.postOutboundMessage(url, input.accessToken, body);
  }

  private async postOutboundMessage(
    url: string,
    accessToken: string,
    body: string,
  ): Promise<WhatsAppProviderResult<WhatsAppSendTextAccepted>> {
    let status = 0;
    let json: unknown;
    try {
      ({ status, json } = await this.postJsonOnce(url, bearer(accessToken), body));
    } catch {
      return { ok: false, code: "SEND_UNKNOWN" };
    }
    if (status === 401 || status === 403) return fail("SEND_AUTH_FAILED", json);
    if (status === 429) return fail("SEND_RATE_LIMITED", json);
    if (status >= 500) return fail("SEND_UNKNOWN", json);
    if (status < 200 || status >= 300) return failSendRejected(json);
    const providerMessageId = extractProviderMessageId(json);
    if (!providerMessageId) return fail("INVALID_RESPONSE", json);
    return { ok: true, value: { providerMessageId } };
  }

  /** One POST. Fetch is not retried. Used only for outbound messages. */
  private async postJsonOnce(
    url: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<{ status: number; json: unknown }> {
    if (this.http.postJson) return this.http.postJson(url, headers, body);
    return defaultPostJson(url, headers, body);
  }
}

function failSendRejected(json: unknown): WhatsAppProviderFailure {
  const g = graphError(json);
  if (g.code === 190 || g.code === 102 || g.code === 10) {
    return fail("SEND_AUTH_FAILED", json);
  }
  if (g.code === 4 || g.code === 80007 || g.code === 130429) {
    return fail("SEND_RATE_LIMITED", json);
  }
  return fail("SEND_REJECTED", json);
}

function extractProviderMessageId(json: unknown): string | null {
  const root = asRecord(json);
  const messages = Array.isArray(root?.messages) ? root.messages : [];
  const first = asRecord(messages[0]);
  const id = asStringish(first?.id);
  return id && id.length > 0 ? id : null;
}

function asStringish(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function extractWabaIds(granularScopes: unknown): string[] {
  if (!Array.isArray(granularScopes)) return [];
  const ids: string[] = [];
  for (const entry of granularScopes) {
    const row = asRecord(entry);
    if (!row) continue;
    if (row.scope !== "whatsapp_business_management") continue;
    if (!Array.isArray(row.target_ids)) continue;
    for (const target of row.target_ids) {
      const id = graphId(target);
      if (id) ids.push(id);
    }
  }
  return [...new Set(ids)];
}

async function defaultPostJson(
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ status: number; json: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: body ?? "{}",
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!text) return { status: res.status, json: null };
    try {
      return { status: res.status, json: JSON.parse(text) as unknown };
    } catch {
      return { status: res.status, json: { error: { code: 0 } } };
    }
  } finally {
    clearTimeout(timer);
  }
}

async function defaultPostMultipart(
  url: string,
  headers: Record<string, string>,
  body: FormData,
): Promise<{ status: number; json: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!text) return { status: res.status, json: null };
    try {
      return { status: res.status, json: JSON.parse(text) as unknown };
    } catch {
      return { status: res.status, json: { error: { code: 0 } } };
    }
  } finally {
    clearTimeout(timer);
  }
}

async function defaultGetBinary(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; contentType: string | null; body: Buffer }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "GET", headers, signal: ctrl.signal });
    const arrayBuffer = await res.arrayBuffer();
    return {
      status: res.status,
      contentType: res.headers.get("content-type"),
      body: Buffer.from(arrayBuffer),
    };
  } finally {
    clearTimeout(timer);
  }
}

export { defaultGetJson as metaGraphGetJson };
export { extractWabaIds as extractGrantedWabaIds };
