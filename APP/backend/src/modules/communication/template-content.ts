import type { CommunicationChannel } from "@prisma/client";
import {
  getVariable,
  variableSupportsChannel,
  ACTION_LINK_VARIABLE,
} from "src/modules/communication/variables";
import {
  templateContentIssue,
  CommunicationErrorReason,
  type TemplateContentIssue,
} from "src/modules/communication/communication.errors";

/**
 * Pure template-content helpers: placeholder validation + rendering. Variable
 * syntax is fixed `{{key}}`; only registry keys are allowed; HTML rendering
 * escapes variable VALUES to prevent injection through customer data.
 */

const VALID_TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const ACTION_LINK_TOKEN = /\{\{\s*action_link\s*\}\}/;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Validate every placeholder in one string against the registry + channel. */
export function validateText(
  text: string | null | undefined,
  path: string,
  channel: CommunicationChannel,
): TemplateContentIssue[] {
  if (!text) return [];
  const issues: TemplateContentIssue[] = [];
  const re = new RegExp(VALID_TOKEN);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const key = match[1];
    if (!key) continue;
    if (!getVariable(key)) {
      issues.push(
        templateContentIssue(
          CommunicationErrorReason.UNKNOWN_TEMPLATE_VARIABLE,
          "unknown_variable",
          path,
          `Unknown template variable {{${key}}}`,
        ),
      );
    } else if (!variableSupportsChannel(key, channel)) {
      issues.push(
        templateContentIssue(
          CommunicationErrorReason.INVALID_TEMPLATE_VARIABLE,
          "unsupported_channel",
          path,
          `Variable {{${key}}} is not supported on the ${channel} channel`,
        ),
      );
    }
  }
  // Malformed braces: anything left after removing valid tokens.
  const residual = text.replace(VALID_TOKEN, "");
  if (residual.includes("{{") || residual.includes("}}")) {
    issues.push(
      templateContentIssue(
        CommunicationErrorReason.INVALID_TEMPLATE_VARIABLE,
        "malformed_placeholder",
        path,
        "A placeholder is malformed; use the {{variable_key}} syntax",
      ),
    );
  }
  return issues;
}

export function hasActionLink(text: string | null | undefined): boolean {
  return !!text && ACTION_LINK_TOKEN.test(text);
}

export function containsVariable(text: string | null | undefined, key: string): boolean {
  if (!text) return false;
  return new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`).test(text);
}

/** Render plain text: substitute known variables verbatim (missing → empty). */
export function renderText(text: string, ctx: Record<string, string>): string {
  return text.replace(VALID_TOKEN, (_, key: string) => ctx[key] ?? "");
}

/** Render HTML: substitute variables with HTML-escaped values (injection-safe). */
export function renderHtml(html: string, ctx: Record<string, string>): string {
  return html.replace(VALID_TOKEN, (_, key: string) => escapeHtml(ctx[key] ?? ""));
}

export { ACTION_LINK_VARIABLE };
