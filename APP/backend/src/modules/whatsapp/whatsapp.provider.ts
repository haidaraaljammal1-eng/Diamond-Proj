import { env } from "src/config/env";
import { isWhatsAppMetaConfigured, whatsappMetaConfig } from "src/modules/whatsapp/whatsapp.config";
import { isUltraMsgConfigured } from "src/modules/whatsapp/ultramsg.config";
import { MetaCloudWhatsAppProvider } from "src/modules/whatsapp/providers/meta-cloud-api.provider";
import { createUltraMsgWhatsAppProvider } from "src/modules/whatsapp/providers/ultramsg.provider";
import { WhatsAppUnconfiguredProvider } from "src/modules/whatsapp/providers/whatsapp-unconfigured.provider";
import type { WhatsAppProvider } from "src/modules/whatsapp/whatsapp.types";

let testOverride: WhatsAppProvider | undefined;

/**
 * In-memory test injection. There is no env flag that can enable this.
 * Production refuses both injection and override use.
 */
export function setWhatsAppProviderForTests(provider: WhatsAppProvider | undefined): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("WhatsApp test provider injection is not allowed in production");
  }
  testOverride = provider;
}

export function createWhatsAppProvider(): WhatsAppProvider {
  if (testOverride) {
    if (process.env.NODE_ENV === "production") {
      return new WhatsAppUnconfiguredProvider();
    }
    return testOverride;
  }
  if (env.WHATSAPP_PROVIDER === "ULTRAMSG") {
    if (isUltraMsgConfigured()) return createUltraMsgWhatsAppProvider();
    return new WhatsAppUnconfiguredProvider();
  }
  if (isWhatsAppMetaConfigured()) {
    return new MetaCloudWhatsAppProvider(whatsappMetaConfig());
  }
  return new WhatsAppUnconfiguredProvider();
}
