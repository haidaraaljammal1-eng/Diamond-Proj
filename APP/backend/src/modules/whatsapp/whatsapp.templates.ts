import type {
  WhatsAppProviderTemplate,
  WhatsAppTemplateSendComponent,
  WhatsAppTemplateStatus,
} from "src/modules/whatsapp/whatsapp.types";

const VARIABLE_RE = /\{\{(\d+)\}\}/g;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function countTemplateVariables(text: string | null | undefined): number {
  if (!text) return 0;
  let max = 0;
  VARIABLE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = VARIABLE_RE.exec(text)) !== null) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

export function mapTemplateStatus(value: string | null | undefined): WhatsAppTemplateStatus {
  const status = (value ?? "").trim().toUpperCase();
  if (
    status === "APPROVED" ||
    status === "PENDING" ||
    status === "REJECTED" ||
    status === "PAUSED" ||
    status === "DISABLED"
  ) {
    return status;
  }
  return "OTHER";
}

function componentType(row: Record<string, unknown>): string {
  return (asString(row.type) ?? "").toUpperCase();
}

function componentFormat(row: Record<string, unknown>): string {
  return (asString(row.format) ?? "TEXT").toUpperCase();
}

/**
 * Official Cloud API template components. V1 sendable templates are APPROVED
 * with TEXT header/body only (no media header, no dynamic URL buttons).
 */
export function isTemplateSendable(input: {
  status: WhatsAppTemplateStatus;
  headerFormat: string | null;
  hasDynamicButtons: boolean;
}): boolean {
  if (input.status !== "APPROVED") return false;
  if (input.headerFormat && input.headerFormat !== "TEXT") return false;
  if (input.hasDynamicButtons) return false;
  return true;
}

export function renderTemplatePreview(
  bodyText: string | null,
  headerText: string | null,
  footerText: string | null,
  headerValues: string[],
  bodyValues: string[],
): string {
  const replace = (text: string, values: string[]) =>
    text.replace(/\{\{(\d+)\}\}/g, (_all, n: string) => {
      const index = Number(n) - 1;
      const value = values[index];
      return typeof value === "string" && value.length > 0 ? value : `{{${n}}}`;
    });
  const parts: string[] = [];
  if (headerText) parts.push(replace(headerText, headerValues));
  if (bodyText) parts.push(replace(bodyText, bodyValues));
  if (footerText) parts.push(footerText);
  return parts.join("\n").replace(/<[^>]*>/g, " ").replace(/\s+\n/g, "\n").trim();
}

function buttonsHaveVariables(buttons: unknown): boolean {
  if (!Array.isArray(buttons)) return false;
  return buttons.some((button) => {
    const row = asRecord(button);
    if (!row) return false;
    const url = asString(row.url) ?? "";
    const text = asString(row.text) ?? "";
    return countTemplateVariables(url) > 0 || countTemplateVariables(text) > 0;
  });
}

export function normalizeProviderTemplate(raw: unknown): WhatsAppProviderTemplate | null {
  const row = asRecord(raw);
  if (!row) return null;
  const name = asString(row.name);
  const language = asString(row.language);
  if (!name || !language) return null;
  const providerTemplateId = asString(row.id) ?? `${name}:${language}`;
  const status = mapTemplateStatus(asString(row.status));
  const category = asString(row.category);
  const components = Array.isArray(row.components) ? row.components : [];

  let bodyText: string | null = null;
  let headerText: string | null = null;
  let footerText: string | null = null;
  let headerFormat: string | null = null;
  let hasDynamicButtons = false;

  for (const component of components) {
    const item = asRecord(component);
    if (!item) continue;
    const type = componentType(item);
    if (type === "BODY") {
      bodyText = asString(item.text);
    } else if (type === "HEADER") {
      headerFormat = componentFormat(item);
      if (headerFormat === "TEXT") headerText = asString(item.text);
    } else if (type === "FOOTER") {
      footerText = asString(item.text);
    } else if (type === "BUTTONS") {
      hasDynamicButtons = buttonsHaveVariables(item.buttons);
    }
  }

  const bodyVariableCount = countTemplateVariables(bodyText);
  const headerVariableCount = countTemplateVariables(headerText);
  const sendable = isTemplateSendable({ status, headerFormat, hasDynamicButtons });

  return {
    providerTemplateId,
    name,
    language,
    status,
    category,
    sendable,
    bodyText,
    headerText,
    footerText,
    bodyVariableCount,
    headerVariableCount,
  };
}

export function buildTemplateSendComponents(input: {
  template: WhatsAppProviderTemplate;
  headerParameters: string[];
  bodyParameters: string[];
}): WhatsAppTemplateSendComponent[] {
  const components: WhatsAppTemplateSendComponent[] = [];
  if (input.template.headerVariableCount > 0) {
    components.push({
      type: "header",
      parameters: input.headerParameters.map((text) => ({ type: "text", text })),
    });
  }
  if (input.template.bodyVariableCount > 0) {
    components.push({
      type: "body",
      parameters: input.bodyParameters.map((text) => ({ type: "text", text })),
    });
  }
  return components;
}

export function assertTemplateParameters(
  template: WhatsAppProviderTemplate,
  headerParameters: string[],
  bodyParameters: string[],
): void {
  if (headerParameters.length !== template.headerVariableCount) {
    throw Object.assign(new Error("HEADER_COUNT"), { code: "PARAMS" });
  }
  if (bodyParameters.length !== template.bodyVariableCount) {
    throw Object.assign(new Error("BODY_COUNT"), { code: "PARAMS" });
  }
  for (const value of [...headerParameters, ...bodyParameters]) {
    if (typeof value !== "string" || value.trim().length === 0 || value.length > 1024) {
      throw Object.assign(new Error("PARAM_VALUE"), { code: "PARAMS" });
    }
  }
}
