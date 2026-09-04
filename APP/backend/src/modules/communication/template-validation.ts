import type { CommunicationChannel } from "@prisma/client";
import { validateText } from "src/modules/communication/template-content";
import { isSafeUrlTemplate } from "src/modules/communication/template-security";
import {
  templateContentIssue,
  CommunicationErrorReason,
  type TemplateContentIssue,
} from "src/modules/communication/communication.errors";

/**
 * Pure per-variant content validation. Integrity rules (variable/URL/channel shape)
 * gate saving a draft; completeness rules (required subject/body) additionally gate
 * publishing. All issues are path-addressable with stable reasons.
 */

export interface VariantForValidation {
  language: string;
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  buttons: { label: string; urlTemplate: string }[];
}

function variantIssues(
  channel: CommunicationChannel,
  v: VariantForValidation,
  i: number,
  requireComplete: boolean,
): TemplateContentIssue[] {
  const p = `variants[${i}]`;
  const issues: TemplateContentIssue[] = [];

  // HTML is only valid for EMAIL.
  if (channel !== "EMAIL" && v.bodyHtml && v.bodyHtml.trim() !== "") {
    issues.push(
      templateContentIssue(
        CommunicationErrorReason.UNSAFE_TEMPLATE_CONTENT,
        "html_not_allowed",
        `${p}.bodyHtml`,
        `HTML content is not allowed on the ${channel} channel`,
      ),
    );
  }
  // SMS has no buttons.
  if (channel === "SMS" && v.buttons.length > 0) {
    issues.push(
      templateContentIssue(
        CommunicationErrorReason.INVALID_TEMPLATE_CONTENT,
        "buttons_not_allowed",
        `${p}.buttons`,
        "SMS templates cannot have buttons",
      ),
    );
  }

  // Variable validation across all text fields.
  issues.push(...validateText(v.subject, `${p}.subject`, channel));
  issues.push(...validateText(v.bodyText, `${p}.bodyText`, channel));
  issues.push(...validateText(v.bodyHtml, `${p}.bodyHtml`, channel));

  // Buttons: variables + URL safety.
  v.buttons.forEach((b, bi) => {
    issues.push(...validateText(b.label, `${p}.buttons[${bi}].label`, channel));
    issues.push(...validateText(b.urlTemplate, `${p}.buttons[${bi}].urlTemplate`, channel));
    if (!isSafeUrlTemplate(b.urlTemplate)) {
      issues.push(
        templateContentIssue(
          CommunicationErrorReason.UNSAFE_TEMPLATE_CONTENT,
          "unsafe_url",
          `${p}.buttons[${bi}].urlTemplate`,
          "Button URL must be a safe https/mailto URL or {{action_link}}",
        ),
      );
    }
  });

  if (requireComplete) {
    if (channel === "EMAIL") {
      if (!v.subject || v.subject.trim() === "") {
        issues.push(templateContentIssue(CommunicationErrorReason.INVALID_TEMPLATE_CONTENT, "subject_required", `${p}.subject`, "Email subject is required"));
      }
      if ((!v.bodyHtml || v.bodyHtml.trim() === "") && (!v.bodyText || v.bodyText.trim() === "")) {
        issues.push(templateContentIssue(CommunicationErrorReason.INVALID_TEMPLATE_CONTENT, "body_required", `${p}.body`, "Email body (HTML or text) is required"));
      }
    } else if (!v.bodyText || v.bodyText.trim() === "") {
      issues.push(templateContentIssue(CommunicationErrorReason.INVALID_TEMPLATE_CONTENT, "body_required", `${p}.bodyText`, `${channel} message body is required`));
    }
  }

  return issues;
}

export function validateVariants(
  channel: CommunicationChannel,
  variants: VariantForValidation[],
  opts: { requireComplete: boolean },
): TemplateContentIssue[] {
  const issues: TemplateContentIssue[] = [];
  if (opts.requireComplete && variants.length === 0) {
    issues.push(
      templateContentIssue(CommunicationErrorReason.INVALID_TEMPLATE_CONTENT, "no_variant", "variants", "At least one language variant is required"),
    );
  }
  variants.forEach((v, i) => issues.push(...variantIssues(channel, v, i, opts.requireComplete)));
  return issues;
}
