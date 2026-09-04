import type { CatalogKind } from "../catalog";
import type { IntegrationAdapter } from "./types";
import { emailAdapter } from "./email.adapter";
import { whatsappAdapter } from "./whatsapp.adapter";
import { smsAdapter } from "./sms.adapter";
import { ssoAdapter } from "./sso.adapter";
import { powerbiAdapter } from "./powerbi.adapter";
import { crmAdapter } from "./crm.adapter";

export const ADAPTERS: Record<CatalogKind, IntegrationAdapter> = {
  EMAIL: emailAdapter,
  WHATSAPP: whatsappAdapter,
  SMS: smsAdapter,
  SSO_ACTIVE_DIRECTORY: ssoAdapter,
  POWER_BI: powerbiAdapter,
  CRM: crmAdapter,
};
export function getAdapter(kind: CatalogKind): IntegrationAdapter {
  return ADAPTERS[kind];
}
export * from "./types";
