import { escapeHtml } from "src/modules/communication/template-content";
import {
  clean,
  pickLang,
  renderEmailShell,
  renderEmailShellText,
} from "src/modules/communication/email-shell";

/**
 * Outbound action email = the shared premium {@link renderEmailShell} (header /
 * footer / bulletproof CTA / fallback) wrapping the author's Email-Editor body.
 *
 * SCOPE — chrome only. The layout injects NOTHING the author did not write. The
 * author owns ALL body content (greeting, customer name, vehicle/branch/date lines,
 * link title, salesperson) via `{{variables}}`. See email-shell.ts for the chrome.
 */

/** Localized chrome copy + editor-body defaults. */
interface EmailStrings {
  brandName: string;
  brandSub: string;
  footerBrand: string;
  footerNote: string;
  defaultPreheader: string;
  defaultMessage: string;
  defaultCta: string;
}

const STRINGS: Record<"ar" | "en", EmailStrings> = {
  ar: {
    brandName: "Haidara",
    brandSub: "مركز خدمة العملاء",
    footerBrand: "Haidara — مركز خدمة العملاء",
    footerNote: "وصلتك هذه الرسالة لأنك أحد عملائنا. للإلغاء تواصل مع الفرع.",
    defaultPreheader: "لديك رسالة جديدة من فريقنا.",
    defaultMessage: "شكراً لتعاملك معنا. اضغط الزر أدناه لمتابعة طلبك.",
    defaultCta: "افتح الرابط",
  },
  en: {
    brandName: "Haidara",
    brandSub: "Customer Service Center",
    footerBrand: "Haidara — Customer Service Center",
    footerNote: "You received this message because you are one of our customers. To unsubscribe, contact your branch.",
    defaultPreheader: "You have a new message from our team.",
    defaultMessage: "Thank you for dealing with us. Use the button below to continue.",
    defaultCta: "Open the link",
  },
};

export interface ActionEmailLayoutInput {
  /** "ar" (default) or "en" — drives direction + chrome copy. */
  lang?: string;
  /** Email subject; used only for the document <title>. */
  subject?: string | null;
  /** Inbox preview text. Falls back to a localized default. */
  preheader?: string | null;
  /** Safe inner message HTML (the author's Email-Editor content, or a default). */
  messageHtml?: string;
  /** CTA button label (raw). Falls back to a localized default. */
  ctaLabel?: string;
  /** CTA + fallback URL — the real action link. */
  ctaUrl: string;
  /** Author buttons beyond the primary CTA, rendered under it (outlined). */
  extraButtons?: { label: string; url: string }[];
}

/** Render the premium action email via the shared shell. */
export function renderActionEmailHtml(input: ActionEmailLayoutInput): string {
  const s = STRINGS[pickLang(input.lang)];
  return renderEmailShell({
    lang: input.lang,
    subject: input.subject,
    preheader: clean(input.preheader) || s.defaultPreheader,
    bodyHtml: clean(input.messageHtml) || `<p style="margin:0 0 16px;">${escapeHtml(s.defaultMessage)}</p>`,
    ctaLabel: clean(input.ctaLabel) || s.defaultCta,
    ctaUrl: input.ctaUrl,
    extraCtas: input.extraButtons,
    strings: { brandName: s.brandName, brandSub: s.brandSub, footerBrand: s.footerBrand, footerNote: s.footerNote },
  });
}

/**
 * Plain-text fallback body (multipart `text/plain`). Ensures text-only clients
 * still get the author's message + a working action link.
 */
export function renderActionEmailText(input: {
  lang?: string;
  messageText?: string;
  ctaLabel?: string;
  ctaUrl: string;
  extraButtons?: { label: string; url: string }[];
}): string {
  const s = STRINGS[pickLang(input.lang)];
  return renderEmailShellText({
    messageText: clean(input.messageText) || s.defaultMessage,
    ctaLabel: clean(input.ctaLabel) || s.defaultCta,
    ctaUrl: input.ctaUrl,
    extraCtas: input.extraButtons,
  });
}
