import type { CommunicationChannel } from "@prisma/client";
import { escapeHtml, renderHtml, renderText } from "src/modules/communication/template-content";
import { renderActionEmailHtml, renderActionEmailText } from "src/modules/communication/email-layout";

/** A fully rendered outbound message (channel-agnostic shape). */
export interface RenderedMessage {
  subject: string | null;
  html: string | null;
  text: string;
  buttons: { label: string; url: string }[];
}

export interface VariantContent {
  subject: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  buttons: { label: string; urlTemplate: string }[];
}

export interface RenderOptions {
  /** Language of the variant ("ar" | "en"); drives email direction + chrome copy. */
  lang?: string;
}

/**
 * Turn an authored plain-text body into safe inner HTML: escape the literal text,
 * substitute HTML-escaped variable values, then map blank-line blocks → paragraphs
 * and single newlines → <br>. Used when a variant has no authored bodyHtml.
 */
function textBodyToHtml(bodyText: string, ctx: Record<string, string>): string {
  const rendered = renderHtml(escapeHtml(bodyText), ctx).trim();
  if (!rendered) return "";
  return rendered
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 16px;">${block.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

/** Best-effort plain-text extraction from rendered inner HTML (for the text part). */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|h4|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Render a variant for a channel. HTML values are escaped inside {@link renderHtml}.
 *
 * EMAIL is special: the message body (authored HTML or text) is wrapped in the
 * unified premium layout ({@link renderActionEmailHtml}) which owns the branded
 * header/footer chrome and a bulletproof, Gmail/Outlook-safe CTA + fallback link.
 * This guarantees every outbound email is HTML (never plain-text only),
 * regardless of whether the author hand-wrote HTML.
 */
export function renderVariant(
  channel: CommunicationChannel,
  variant: VariantContent,
  ctx: Record<string, string>,
  opts: RenderOptions = {},
): RenderedMessage {
  const subject = variant.subject ? renderText(variant.subject, ctx) : null;
  const text = renderText(variant.bodyText ?? "", ctx);
  const buttons = variant.buttons.map((b) => ({
    label: renderText(b.label, ctx),
    url: renderText(b.urlTemplate, ctx),
  }));

  let html: string | null = null;
  if (channel === "EMAIL") {
    // The author's Email-Editor content IS the body — nothing else is injected.
    const messageHtml = variant.bodyHtml
      ? renderHtml(variant.bodyHtml, ctx)
      : textBodyToHtml(variant.bodyText ?? "", ctx);
    // The primary CTA is the author's FIRST button, rendered with its own URL —
    // what the editor shows is what the recipient gets. Authoring no button at
    // all still yields a CTA: the action link under the layout's
    // localized default label, so a plain body is never a dead end.
    //
    // (Previously the CTA always retargeted to `action_link` and the author's
    // buttons were appended a second time downstream, so a template with one
    // button produced TWO buttons pointing at different URLs. This shell is now
    // the single owner of email button presentation.)
    const [primary, ...extraButtons] = buttons;
    const ctaUrl = primary?.url || ctx.action_link || "";
    const ctaLabel = primary?.label;
    html = renderActionEmailHtml({ lang: opts.lang, subject, messageHtml, ctaLabel, ctaUrl, extraButtons });
    // Text part: prefer the authored bodyText; else derive from the body HTML.
    const messageText = text.trim() || htmlToPlainText(messageHtml);
    return {
      subject,
      html,
      text: renderActionEmailText({ lang: opts.lang, messageText, ctaLabel, ctaUrl, extraButtons }),
      buttons,
    };
  }

  return { subject, html, text, buttons };
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

/** Build a render context from operational data + the resolved action title/link. */
export function buildRenderContext(input: {
  customerName: string;
  customerExternalId: string | null;
  vehicleModel: string | null;
  vehicleYear: number | null;
  vehicleVin: string | null;
  branchName: string;
  salespersonName: string | null;
  purchaseDate: Date | null;
  deliveryDate: Date | null;
  externalSaleId: string | null;
  linkTitle: string;
  actionLink: string;
}): Record<string, string> {
  return {
    customer_name: input.customerName,
    vehicle_model: input.vehicleModel ?? "",
    vehicle_year: input.vehicleYear != null ? String(input.vehicleYear) : "",
    vehicle_vin: input.vehicleVin ?? "",
    branch_name: input.branchName,
    salesperson_name: input.salespersonName ?? "",
    purchase_date: fmtDate(input.purchaseDate),
    delivery_date: fmtDate(input.deliveryDate),
    link_title: input.linkTitle,
    action_link: input.actionLink,
    customer_external_id: input.customerExternalId ?? "",
    sale_external_id: input.externalSaleId ?? "",
  };
}
