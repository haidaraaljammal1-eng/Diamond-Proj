export type CatalogKind = "WHATSAPP" | "SMS" | "EMAIL" | "SSO_ACTIVE_DIRECTORY" | "POWER_BI" | "CRM";
export type FieldType = "text" | "number" | "select" | "password" | "readonly";

export interface FieldDescriptor {
  key: string;
  type: FieldType;
  secret: boolean;
  required: boolean;
  /** i18n suffix; FE resolves `admin.reports.integrations.fields.<i18nKey>`. */
  i18nKey: string;
  options?: string[];
  showWhen?: { field: string; equals: string };
}

export interface IntegrationDescriptor {
  kind: CatalogKind;
  /** Stable connection name (upsert key with kind). One row per kind. */
  name: string;
  supportsSendTest: boolean;
  /** key of the provider select that drives showWhen conditions (if any). */
  providerField?: string;
  fields: FieldDescriptor[];
}

const f = (key: string, type: FieldType, opts: Partial<FieldDescriptor> = {}): FieldDescriptor => ({
  key, type, secret: false, required: false, i18nKey: key, ...opts,
});

export const INTEGRATION_CATALOG: IntegrationDescriptor[] = [
  {
    kind: "EMAIL",
    name: "Transactional Email",
    supportsSendTest: true,
    fields: [
      f("smtpHost", "text", { required: true }),
      f("smtpPort", "number", { required: true }),
      f("encryption", "select", { required: true, options: ["none", "starttls", "ssltls"] }),
      f("username", "text"),
      f("password", "password", { secret: true }),
      f("fromName", "text"),
      f("fromEmail", "text", { required: true }),
    ],
  },
  {
    kind: "WHATSAPP",
    name: "WhatsApp Business",
    supportsSendTest: true,
    providerField: "provider",
    fields: [
      f("provider", "select", { required: true, options: ["meta_cloud", "generic_instance"] }),
      f("baseUrl", "text", { showWhen: { field: "provider", equals: "generic_instance" }, required: true }),
      f("instanceId", "text", { showWhen: { field: "provider", equals: "generic_instance" }, required: true }),
      f("phoneNumberId", "text", { showWhen: { field: "provider", equals: "meta_cloud" }, required: true }),
      f("businessAccountId", "text", { showWhen: { field: "provider", equals: "meta_cloud" } }),
      f("accessToken", "password", { secret: true, required: true }),
      f("webhookVerifyToken", "password", { secret: true }),
    ],
  },
  {
    kind: "SMS",
    name: "SMS Gateway",
    supportsSendTest: true,
    providerField: "provider",
    fields: [
      f("provider", "select", { required: true, options: ["generic_rest"] }),
      f("baseUrl", "text", { required: true }),
      f("username", "text"),
      f("senderId", "text", { required: true }),
      f("apiKey", "password", { secret: true, required: true }),
      f("apiSecret", "password", { secret: true }),
    ],
  },
  {
    kind: "SSO_ACTIVE_DIRECTORY",
    name: "Corporate SSO",
    supportsSendTest: false,
    providerField: "provider",
    fields: [
      f("provider", "select", { required: true, options: ["entra", "generic_oidc"] }),
      f("issuerUrl", "text", { required: true }),
      f("tenantId", "text", { showWhen: { field: "provider", equals: "entra" } }),
      f("clientId", "text", { required: true }),
      f("authorizationUrl", "text"),
      f("tokenUrl", "text"),
      f("redirectUrl", "readonly"),
      f("clientSecret", "password", { secret: true, required: true }),
    ],
  },
  {
    kind: "POWER_BI",
    name: "Power BI",
    supportsSendTest: false,
    fields: [
      f("workspaceId", "text", { required: true }),
      f("reportId", "text", { required: true }),
      f("datasetId", "text"),
      f("tenantId", "text", { required: true }),
      f("clientId", "text", { required: true }),
      f("clientSecret", "password", { secret: true, required: true }),
    ],
  },
  {
    // CRM sync connector: a REST base URL + API key, plus which CRM it is (drives
    // the auth header the adapter uses). Data-only — no send-test (not a channel).
    kind: "CRM",
    name: "CRM",
    supportsSendTest: false,
    providerField: "provider",
    fields: [
      f("provider", "select", { required: true, options: ["salesforce", "hubspot", "dynamics_365", "generic_rest"] }),
      f("baseUrl", "text", { required: true }),
      f("apiKey", "password", { secret: true, required: true }),
    ],
  },
];

export function getDescriptor(kind: CatalogKind): IntegrationDescriptor {
  const d = INTEGRATION_CATALOG.find((x) => x.kind === kind);
  if (!d) throw new Error(`unknown integration kind: ${kind}`);
  return d;
}
export const CATALOG_KINDS: CatalogKind[] = INTEGRATION_CATALOG.map((d) => d.kind);
export const secretFieldKeys = (kind: CatalogKind): string[] =>
  getDescriptor(kind).fields.filter((x) => x.secret).map((x) => x.key);
export const configFieldKeys = (kind: CatalogKind): string[] =>
  getDescriptor(kind).fields.filter((x) => !x.secret && x.type !== "readonly").map((x) => x.key);
