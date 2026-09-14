import { META_CLOUD_CAPABILITIES } from "src/modules/whatsapp/whatsapp.capabilities";
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
  WhatsAppSessionSnapshot,
  WhatsAppUploadMediaInput,
} from "src/modules/whatsapp/whatsapp.types";

export const TEST_WHATSAPP_TOKEN = "test-wa-access-token-DO-NOT-LEAK";
export const TEST_WABA_ID = "123456";
export const TEST_PHONE_NUMBER_ID = "1001";
export const TEST_DISPLAY_PHONE = "971500000000";
export const TEST_VERIFIED_NAME = "Test Business";
export const TEST_BUSINESS_NAME = "Test Business";

export function testWhatsAppGrant(overrides?: {
  wabas?: WhatsAppGrantedWaba[];
  phones?: WhatsAppGrantedPhone[];
}) {
  const wabas = overrides?.wabas ?? [{ wabaId: TEST_WABA_ID, businessName: TEST_BUSINESS_NAME }];
  const phones = overrides?.phones ?? [
    {
      wabaId: TEST_WABA_ID,
      phoneNumberId: TEST_PHONE_NUMBER_ID,
      displayPhoneNumber: TEST_DISPLAY_PHONE,
      verifiedName: TEST_VERIFIED_NAME,
    },
  ];
  return { wabas, phones };
}

/**
 * Automated-test double only. Lives under tests/ — never selected by runtime env.
 */
export function createFakeWhatsAppProvider(options?: {
  token?: string;
  grant?: ReturnType<typeof testWhatsAppGrant>;
  exchangeFailure?: WhatsAppProviderResult<WhatsAppAccessCredential>;
  inspectFailure?: WhatsAppProviderResult<WhatsAppInspectedAccess>;
  invalidResponse?: boolean;
}) {
  const token = options?.token ?? TEST_WHATSAPP_TOKEN;
  let grant = options?.grant ?? testWhatsAppGrant();
  let exchangeFailure = options?.exchangeFailure;
  let inspectFailure = options?.inspectFailure;
  let invalidResponse = options?.invalidResponse ?? false;
  const calls: string[] = [];
  let sendCount = 0;
  let sendFailure: WhatsAppProviderResult<{ providerMessageId: string }> | undefined;
  let sendUnknown = false;
  let sendMessageId: string | undefined;
  let lastSend: { accessToken: string; phoneNumberId: string; toWaId: string; text: string } | null =
    null;
  let templates: WhatsAppProviderTemplate[] = [];
  let subscribeSuccess = false;
  let subscribed = false;
  let mediaBytes = Buffer.from("fake-media");
  let mediaMime = "image/jpeg";
  let lastTemplateSend: WhatsAppSendTemplateInput | null = null;
  let lastMediaSend: WhatsAppSendMediaInput | null = null;
  let lastUpload: WhatsAppUploadMediaInput | null = null;
  let uploadCount = 0;
  let templateSendCount = 0;
  let mediaSendCount = 0;

  const provider: WhatsAppProvider = {
    name: "fake",
    configured: true,
    capabilities() {
      return META_CLOUD_CAPABILITIES;
    },
    async getSession(): Promise<WhatsAppProviderResult<WhatsAppSessionSnapshot>> {
      return { ok: true, value: { status: "AUTHENTICATED", rawStatus: "authenticated" } };
    },
    async getInstanceIdentity(): Promise<WhatsAppProviderResult<WhatsAppInstanceIdentity>> {
      return { ok: false, code: "NOT_CONFIGURED" };
    },
    async getInstanceSettings(): Promise<WhatsAppProviderResult<WhatsAppInstanceSettings>> {
      return { ok: false, code: "NOT_CONFIGURED" };
    },
    async getQr(): Promise<WhatsAppProviderResult<WhatsAppQrPayload>> {
      return { ok: false, code: "NOT_CONFIGURED" };
    },
    async applyWebhookSettings(): Promise<WhatsAppProviderResult<WhatsAppInstanceSettings>> {
      return { ok: false, code: "NOT_CONFIGURED" };
    },
    async sendOutboundMedia(input: WhatsAppSendOutboundMediaInput) {
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
    },
    async exchangeAuthorizationCode(code) {
      calls.push("exchangeAuthorizationCode");
      if (exchangeFailure) return exchangeFailure;
      if (code === "invalid-code") return { ok: false, code: "AUTH_FAILED" };
      if (invalidResponse) return { ok: false, code: "INVALID_RESPONSE" };
      return { ok: true, value: { accessToken: token, expiresAt: null } };
    },
    async inspectGrantedBusinessAccess() {
      calls.push("inspectGrantedBusinessAccess");
      if (inspectFailure) return inspectFailure;
      if (invalidResponse) return { ok: false, code: "INVALID_RESPONSE" };
      return {
        ok: true,
        value: {
          isValid: true,
          expiresAt: null,
          wabaIds: grant.wabas.map((w) => w.wabaId),
          appId: "test-app",
        },
      };
    },
    async listGrantedWhatsAppBusinessAccounts() {
      calls.push("listGrantedWhatsAppBusinessAccounts");
      return { ok: true, value: grant.wabas };
    },
    async listGrantedPhoneNumbers(_accessToken, wabaId) {
      calls.push("listGrantedPhoneNumbers");
      return { ok: true, value: grant.phones.filter((p) => p.wabaId === wabaId) };
    },
    async validatePhoneNumberAccess(_accessToken, wabaId, phoneNumberId) {
      calls.push("validatePhoneNumberAccess");
      const phone = grant.phones.find(
        (p) => p.wabaId === wabaId && p.phoneNumberId === phoneNumberId,
      );
      if (!phone) return { ok: false, code: "PHONE_NOT_GRANTED" };
      return { ok: true, value: phone };
    },
    async validateCredential() {
      calls.push("validateCredential");
      return { ok: true, value: { isValid: true } };
    },
    async subscribeWaba() {
      calls.push("subscribeWaba");
      if (!subscribeSuccess) return { ok: false as const, code: "NOT_CONFIGURED" as const };
      return { ok: true as const, value: { success: true } };
    },
    async getWebhookSubscriptionStatus() {
      calls.push("getWebhookSubscriptionStatus");
      return { ok: true as const, value: { subscribed } };
    },
    async sendTextMessage(input) {
      calls.push("sendTextMessage");
      if (sendFailure) return sendFailure;
      if (sendUnknown) return { ok: false, code: "SEND_UNKNOWN" };
      sendCount += 1;
      const id = sendMessageId ?? `wamid.fake.${sendCount}`;
      lastSend = input;
      return { ok: true, value: { providerMessageId: id } };
    },
    async listMessageTemplates() {
      calls.push("listMessageTemplates");
      return { ok: true, value: templates };
    },
    async sendTemplateMessage(input) {
      calls.push("sendTemplateMessage");
      if (sendFailure) return sendFailure;
      if (sendUnknown) return { ok: false, code: "SEND_UNKNOWN" };
      templateSendCount += 1;
      lastTemplateSend = input;
      const id = sendMessageId ?? `wamid.fake.tpl.${templateSendCount}`;
      return { ok: true, value: { providerMessageId: id } };
    },
    async getMediaMetadata() {
      calls.push("getMediaMetadata");
      return {
        ok: true,
        value: {
          mediaId: "media-fake",
          mimeType: mediaMime,
          fileSize: mediaBytes.length,
          sha256: null,
          url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=fake",
        } satisfies WhatsAppMediaMetadata,
      };
    },
    async downloadMedia() {
      calls.push("downloadMedia");
      return {
        ok: true,
        value: { body: mediaBytes, contentType: mediaMime } satisfies WhatsAppMediaBytes,
      };
    },
    async uploadMedia(input) {
      calls.push("uploadMedia");
      if (sendUnknown) return { ok: false as const, code: "SEND_UNKNOWN" as const };
      if (sendFailure && !sendFailure.ok) {
        return {
          ok: false as const,
          code: sendFailure.code,
          providerErrorCode: sendFailure.providerErrorCode,
        };
      }
      uploadCount += 1;
      lastUpload = input;
      return { ok: true, value: { mediaId: `media.fake.${uploadCount}` } };
    },
    async sendMediaMessage(input) {
      calls.push("sendMediaMessage");
      if (sendFailure) return sendFailure;
      if (sendUnknown) return { ok: false, code: "SEND_UNKNOWN" };
      mediaSendCount += 1;
      lastMediaSend = input;
      const id = sendMessageId ?? `wamid.fake.media.${mediaSendCount}`;
      return { ok: true, value: { providerMessageId: id } };
    },
  };

  return {
    provider,
    calls,
    token,
    setGrant(next: ReturnType<typeof testWhatsAppGrant>) {
      grant = next;
    },
    setExchangeFailure(next: WhatsAppProviderResult<WhatsAppAccessCredential> | undefined) {
      exchangeFailure = next;
    },
    setInspectFailure(next: WhatsAppProviderResult<WhatsAppInspectedAccess> | undefined) {
      inspectFailure = next;
    },
    setInvalidResponse(next: boolean) {
      invalidResponse = next;
    },
    get sendCount() {
      return sendCount;
    },
    get lastSend() {
      return lastSend;
    },
    setSendFailure(next: WhatsAppProviderResult<{ providerMessageId: string }> | undefined) {
      sendFailure = next;
      sendUnknown = false;
    },
    setSendUnknown(next: boolean) {
      sendUnknown = next;
    },
    setSendMessageId(next: string | undefined) {
      sendMessageId = next;
    },
    setTemplates(next: WhatsAppProviderTemplate[]) {
      templates = next;
    },
    setSubscribeResult(success: boolean, isSubscribed: boolean) {
      subscribeSuccess = success;
      subscribed = isSubscribed;
    },
    setMedia(bytes: Buffer, mime: string) {
      mediaBytes = Buffer.from(bytes);
      mediaMime = mime;
    },
    get lastTemplateSend() {
      return lastTemplateSend;
    },
    get lastMediaSend() {
      return lastMediaSend;
    },
    get lastUpload() {
      return lastUpload;
    },
    get templateSendCount() {
      return templateSendCount;
    },
    get mediaSendCount() {
      return mediaSendCount;
    },
    get uploadCount() {
      return uploadCount;
    },
  };
}
