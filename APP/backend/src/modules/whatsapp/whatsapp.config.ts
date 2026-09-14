import { env } from "src/config/env";
import type {
  WhatsAppMetaRuntimeConfig,
  WhatsAppWebhookSecrets,
} from "src/modules/whatsapp/whatsapp.types";

export function isWhatsAppMetaConfigured(
  cfg: Pick<WhatsAppMetaRuntimeConfig, "appId" | "appSecret"> = {
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
  },
): boolean {
  return cfg.appId.trim().length > 0 && cfg.appSecret.trim().length > 0;
}

export function whatsappMetaConfig(): WhatsAppMetaRuntimeConfig {
  return {
    appId: env.META_APP_ID.trim(),
    appSecret: env.META_APP_SECRET.trim(),
    graphApiVersion: env.META_GRAPH_API_VERSION,
    configId: env.META_WHATSAPP_CONFIG_ID.trim(),
  };
}

/** Frontend-safe identifiers only. Never includes META_APP_SECRET. */
export function whatsappFrontendBootstrap() {
  const cfg = whatsappMetaConfig();
  return {
    appId: cfg.appId || null,
    graphApiVersion: cfg.graphApiVersion,
    configId: cfg.configId || null,
  };
}

let webhookSecretsOverride: WhatsAppWebhookSecrets | undefined;

export function setWhatsAppWebhookSecretsForTests(
  secrets: WhatsAppWebhookSecrets | undefined,
): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("WhatsApp webhook secret injection is not allowed in production");
  }
  webhookSecretsOverride = secrets;
}

export function whatsappWebhookSecrets(): WhatsAppWebhookSecrets {
  if (webhookSecretsOverride && process.env.NODE_ENV !== "production") {
    return webhookSecretsOverride;
  }
  return {
    appSecret: env.META_APP_SECRET.trim(),
    verifyToken: env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN.trim(),
  };
}

export function isWhatsAppWebhookVerifyConfigured(): boolean {
  return whatsappWebhookSecrets().verifyToken.length > 0;
}

export function isWhatsAppWebhookSignatureConfigured(): boolean {
  return whatsappWebhookSecrets().appSecret.length > 0;
}

export function isWhatsAppWebhookConfigured(): boolean {
  return isWhatsAppWebhookVerifyConfigured() && isWhatsAppWebhookSignatureConfigured();
}
