import { env } from "src/config/env";
import { ULTRAMSG_CAPABILITIES, UNCONFIGURED_CAPABILITIES } from "src/modules/whatsapp/whatsapp.capabilities";
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
  WhatsAppSessionSnapshot,
  WhatsAppUploadMediaInput,
} from "src/modules/whatsapp/whatsapp.types";

function notConfigured<T>(): WhatsAppProviderResult<T> {
  return { ok: false, code: "NOT_CONFIGURED" };
}

/**
 * Fail-closed runtime provider. No network. No fake WABA, phone, or token.
 */
export class WhatsAppUnconfiguredProvider implements WhatsAppProvider {
  readonly name = "none";
  readonly configured = false;

  capabilities() {
    if (env.WHATSAPP_PROVIDER === "ULTRAMSG") {
      return {
        ...ULTRAMSG_CAPABILITIES,
        supportsFreeText: false,
        supportsImage: false,
        supportsDocument: false,
        supportsAudio: false,
        supportsVideo: false,
      };
    }
    return UNCONFIGURED_CAPABILITIES;
  }

  async getSession(): Promise<WhatsAppProviderResult<WhatsAppSessionSnapshot>> {
    return notConfigured();
  }
  async getInstanceIdentity(): Promise<WhatsAppProviderResult<WhatsAppInstanceIdentity>> {
    return notConfigured();
  }
  async getInstanceSettings(): Promise<WhatsAppProviderResult<WhatsAppInstanceSettings>> {
    return notConfigured();
  }
  async getQr(): Promise<WhatsAppProviderResult<WhatsAppQrPayload>> {
    return notConfigured();
  }
  async applyWebhookSettings(): Promise<WhatsAppProviderResult<WhatsAppInstanceSettings>> {
    return notConfigured();
  }
  async sendOutboundMedia(
    _input?: WhatsAppSendOutboundMediaInput,
  ): Promise<WhatsAppProviderResult<{ providerMessageId: string }>> {
    return notConfigured();
  }

  async exchangeAuthorizationCode(
    _code?: string,
  ): Promise<WhatsAppProviderResult<WhatsAppAccessCredential>> {
    return notConfigured();
  }

  async inspectGrantedBusinessAccess(
    _accessToken?: string,
  ): Promise<WhatsAppProviderResult<WhatsAppInspectedAccess>> {
    return notConfigured();
  }

  async listGrantedWhatsAppBusinessAccounts(
    _accessToken?: string,
    _wabaIds?: string[],
  ): Promise<WhatsAppProviderResult<WhatsAppGrantedWaba[]>> {
    return notConfigured();
  }

  async listGrantedPhoneNumbers(
    _accessToken?: string,
    _wabaId?: string,
  ): Promise<WhatsAppProviderResult<WhatsAppGrantedPhone[]>> {
    return notConfigured();
  }

  async validatePhoneNumberAccess(
    _accessToken?: string,
    _wabaId?: string,
    _phoneNumberId?: string,
  ): Promise<WhatsAppProviderResult<WhatsAppGrantedPhone>> {
    return notConfigured();
  }

  async validateCredential(
    _accessToken?: string,
  ): Promise<WhatsAppProviderResult<{ isValid: boolean }>> {
    return notConfigured();
  }

  async subscribeWaba(
    _accessToken?: string,
    _wabaId?: string,
  ): Promise<WhatsAppProviderResult<{ success: boolean }>> {
    return notConfigured();
  }

  async getWebhookSubscriptionStatus(
    _accessToken?: string,
    _wabaId?: string,
  ): Promise<WhatsAppProviderResult<{ subscribed: boolean }>> {
    return notConfigured();
  }

  async sendTextMessage(): Promise<WhatsAppProviderResult<{ providerMessageId: string }>> {
    return notConfigured();
  }

  async listMessageTemplates(
    _accessToken?: string,
    _wabaId?: string,
  ): Promise<WhatsAppProviderResult<WhatsAppProviderTemplate[]>> {
    return notConfigured();
  }

  async sendTemplateMessage(
    _input?: WhatsAppSendTemplateInput,
  ): Promise<WhatsAppProviderResult<{ providerMessageId: string }>> {
    return notConfigured();
  }

  async getMediaMetadata(
    _accessToken?: string,
    _mediaId?: string,
  ): Promise<WhatsAppProviderResult<WhatsAppMediaMetadata>> {
    return notConfigured();
  }

  async downloadMedia(
    _accessToken?: string,
    _url?: string,
  ): Promise<WhatsAppProviderResult<WhatsAppMediaBytes>> {
    return notConfigured();
  }

  async uploadMedia(
    _input?: WhatsAppUploadMediaInput,
  ): Promise<WhatsAppProviderResult<{ mediaId: string }>> {
    return notConfigured();
  }

  async sendMediaMessage(
    _input?: WhatsAppSendMediaInput,
  ): Promise<WhatsAppProviderResult<{ providerMessageId: string }>> {
    return notConfigured();
  }
}
