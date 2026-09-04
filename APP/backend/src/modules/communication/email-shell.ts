import { escapeHtml } from "src/modules/communication/template-content";

/**
 * Shared premium email SHELL (chrome) — the single unified transactional-email
 * template used across the product: complaint notifications,
 * and any future branded email. It owns the branded header, the RTL/LTR
 * card, a bulletproof (Gmail/Outlook-safe) CTA + fallback link, and the footer.
 *
 * Callers supply only: the localized chrome copy (`strings`), a safe inner
 * `bodyHtml`, and the CTA (label + url). The shell never invents body content.
 *
 * Rules: table-based, fully inline CSS, no classes/flex/grid; VML button fallback
 * for Outlook; Cairo font stack (shared with backend-school-system). The generated
 * chrome is trusted and NOT re-sanitized — `bodyHtml` must already be safe and CTA
 * label/url are escaped here.
 */

export const BRAND_RED = "#E60012";
// Cairo-first stack (client falls back gracefully); MSO uses Tahoma (no Cairo).
export const EMAIL_FONT = "'Cairo','Segoe UI',Tahoma,Arial,sans-serif";

export function pickLang(lang: string | undefined): "ar" | "en" {
  return lang && lang.toLowerCase().startsWith("ar") ? "ar" : "en";
}

export function clean(value: string | undefined | null): string {
  return (value ?? "").trim();
}

/** Direction for a language: Arabic is RTL, everything else LTR. */
export function dirFor(lang: string | undefined): "rtl" | "ltr" {
  return pickLang(lang) === "ar" ? "rtl" : "ltr";
}

/** Localized fallback-link intro line ("if the button does not work…"). */
const FALLBACK_INTRO: Record<"ar" | "en", string> = {
  ar: "إذا لم يعمل الزر، افتح هذا الرابط:",
  en: "If the button does not work, open this link:",
};

export interface EmailShellStrings {
  /** Bold brand name in the branded header (e.g. "Haidara"). */
  brandName: string;
  /** Muted sub-header next to the brand (e.g. dept: "إدارة الشكاوى"). */
  brandSub: string;
  /** Footer brand line. */
  footerBrand: string;
  /** Footer note (small, muted). */
  footerNote: string;
}

export interface EmailShellInput {
  /** "ar" (default) → RTL Arabic chrome; "en" → LTR. */
  lang?: string;
  /** Email subject; used for the document <title>. Falls back to brandName. */
  subject?: string | null;
  /** Inbox preview text (hidden preheader). */
  preheader?: string | null;
  /** Safe inner message HTML. */
  bodyHtml: string;
  /** CTA button label. */
  ctaLabel: string;
  /** CTA + fallback URL. */
  ctaUrl: string;
  /**
   * Author-defined CTA buttons BEYOND the primary one, rendered under it in a
   * secondary (outlined) style. The shell is the single owner of email button
   * presentation — nothing downstream may append buttons again.
   */
  extraCtas?: { label: string; url: string }[];
  /** Localized chrome copy. */
  strings: EmailShellStrings;
}

/**
 * Bulletproof, table-based CTA button. Gmail/Apple Mail/webmail use the `<td>` +
 * `<a>` variant; Outlook (desktop, `mso`) uses a VML rounded-rect so the fill and
 * padding survive. No CSS classes, no flex/grid — inline attributes + styles only.
 */
export function ctaButton(label: string, url: string, opts: { secondary?: boolean } = {}): string {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  // VML needs an explicit width; estimate from label length (Arabic runs wider).
  const width = Math.min(360, Math.max(200, label.length * 12 + 96));
  // A secondary button is outlined rather than filled, so the primary CTA still
  // reads as the one action. Same bulletproof table/VML structure either way.
  const fill = opts.secondary ? "#ffffff" : BRAND_RED;
  const ink = opts.secondary ? BRAND_RED : "#ffffff";
  const border = opts.secondary ? `border:1px solid ${BRAND_RED};` : "";
  return `
              <table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0" style="margin:8px auto 6px;">
                <tr>
                  <td align="center">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeUrl}" style="height:48px;v-text-anchor:middle;width:${width}px;" arcsize="20%" strokecolor="${BRAND_RED}" fillcolor="${fill}">
                      <w:anchorlock/>
                      <center style="color:${ink};font-family:${EMAIL_FONT};font-size:16px;font-weight:bold;">${safeLabel}</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-- -->
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" bgcolor="${fill}" style="border-radius:10px;${border}">
                          <a href="${safeUrl}" target="_blank" rel="noopener noreferrer"
                             style="display:inline-block; padding:15px 46px; font-family:${EMAIL_FONT}; font-size:16px; font-weight:bold; line-height:1; color:${ink}; text-decoration:none; border-radius:10px; background:${fill};">
                            ${safeLabel}
                          </a>
                        </td>
                      </tr>
                    </table>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>`;
}

/** Render the full premium email document: header + body + CTA + fallback + footer. */
export function renderEmailShell(input: EmailShellInput): string {
  const lang = pickLang(input.lang);
  const dir = lang === "ar" ? "rtl" : "ltr";
  const htmlLang = lang;
  const align = dir === "rtl" ? "right" : "left";
  const opposite = dir === "rtl" ? "left" : "right";
  const s = input.strings;

  const ctaLabel = clean(input.ctaLabel);
  const ctaUrl = clean(input.ctaUrl);
  const preheader = clean(input.preheader);
  const bodyHtml = input.bodyHtml;
  const title = clean(input.subject) || s.brandName;
  // Author buttons past the first. Blank rows never reach the wire (the editors
  // strip them), but a defensive filter keeps an empty button out of the email.
  const extraCtasHtml = (input.extraCtas ?? [])
    .filter((b) => clean(b.url) !== "")
    .map((b) => ctaButton(clean(b.label), clean(b.url), { secondary: true }))
    .join("");

  return `<!doctype html>
<html lang="${htmlLang}" dir="${dir}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light;supported-color-schemes:light;}
body,table,td,div,p,span,a,h1,h2,h3,h4,li{font-family:${EMAIL_FONT};}
.email-body h2{font-size:22px;font-weight:700;line-height:1.3;margin:16px 0 8px;}
.email-body h3{font-size:18px;font-weight:700;line-height:1.35;margin:14px 0 6px;}
.email-body h4{font-size:15px;font-weight:700;margin:12px 0 6px;}
.email-body p{margin:0 0 12px;}
.email-body ul{padding-inline-start:24px;margin:0 0 12px;list-style:disc;}
.email-body ol{padding-inline-start:24px;margin:0 0 12px;list-style:decimal;}
.email-body li{margin:4px 0;}
.email-body a{color:${BRAND_RED};text-decoration:underline;}
.email-body strong,.email-body b{font-weight:700;}
.email-body em,.email-body i{font-style:italic;}
/* Dark mode: the design is intentionally LIGHT. Re-assert the branded light
   card + dark text so clients that force dark keep a readable, on-brand layout
   instead of an uncontrolled near-black inversion. */
@media (prefers-color-scheme: dark){
  body,.email-bg{background-color:#f3f4f6 !important;}
  .content-card{background-color:#ffffff !important;}
  .body-cell{background-color:#ffffff !important;color:#111827 !important;}
  .email-body,.email-body p,.email-body span,.email-body li,.email-body div,.email-body td{color:#111827 !important;}
  .email-body a,.brand-link{color:${BRAND_RED} !important;}
  .text-muted{color:#6b7280 !important;}
  .brand-header{background-color:${BRAND_RED} !important;}
  .brand-header td{color:#ffffff !important;}
  .footer-cell{background-color:#fafafa !important;}
}
/* Outlook.com dark mode recolors via data-ogsb (bg) / data-ogsc (text). */
[data-ogsb] body,[data-ogsb] .email-bg{background-color:#f3f4f6 !important;}
[data-ogsb] .content-card,[data-ogsb] .body-cell{background-color:#ffffff !important;}
[data-ogsb] .footer-cell{background-color:#fafafa !important;}
[data-ogsb] .brand-header{background-color:${BRAND_RED} !important;}
[data-ogsc] .body-cell,[data-ogsc] .email-body,[data-ogsc] .email-body p{color:#111827 !important;}
[data-ogsc] .text-muted{color:#6b7280 !important;}
[data-ogsc] .brand-header td{color:#ffffff !important;}
</style>
<!--[if mso]><style>body,table,td,div,p,span,a,h1{font-family:Tahoma,Arial,sans-serif !important;}</style><![endif]-->
</head>
<body bgcolor="#f3f4f6" style="margin:0; padding:0; background-color:#f3f4f6;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(preheader)}</div>

  <table role="presentation" class="email-bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f3f4f6" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">

        <table role="presentation" class="content-card" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff"
               style="width:600px; max-width:100%; background-color:#ffffff; border-radius:14px; overflow:hidden;">

          <tr>
            <td class="brand-header" bgcolor="${BRAND_RED}" style="background-color:${BRAND_RED}; padding:22px 28px;" align="${align}">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="${align}" style="font-family:${EMAIL_FONT}; color:#ffffff; font-size:20px; font-weight:bold; letter-spacing:.3px;">
                    ${escapeHtml(s.brandName)}
                  </td>
                  <td align="${opposite}" style="font-family:${EMAIL_FONT}; color:#ffffff; font-size:12px;">
                    ${escapeHtml(s.brandSub)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="body-cell" bgcolor="#ffffff" dir="${dir}" align="${align}" style="background-color:#ffffff; padding:32px 28px 12px; font-family:${EMAIL_FONT}; color:#111827;">
              <div class="email-body" style="text-align:${align}; font-size:15px; line-height:1.9; color:#111827; background-color:#ffffff;">${bodyHtml}</div>
${ctaButton(ctaLabel, ctaUrl)}${extraCtasHtml}
              <p class="text-muted" style="margin:14px 0 0; font-size:12px; color:#6b7280; text-align:center;">
                ${escapeHtml(FALLBACK_INTRO[lang])}<br />
                <a class="brand-link" href="${escapeHtml(ctaUrl)}" target="_blank" rel="noopener noreferrer" style="color:${BRAND_RED}; word-break:break-all;">${escapeHtml(ctaUrl)}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td class="footer-cell" bgcolor="#fafafa" align="center" style="background-color:#fafafa; padding:20px 28px; font-family:${EMAIL_FONT};">
              <p class="text-muted" style="margin:0 0 6px; font-size:12px; color:#6b7280;">${escapeHtml(s.footerBrand)}</p>
              <p class="text-muted" style="margin:0; font-size:11px; color:#9ca3af;">${escapeHtml(s.footerNote)}</p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Plain-text multipart fallback: message text + every CTA as a labeled link.
 *  Mirrors the HTML part exactly, so the text alternative is never missing a
 *  button the HTML shows (and never repeats one, either). */
export function renderEmailShellText(input: {
  messageText: string;
  ctaLabel: string;
  ctaUrl: string;
  extraCtas?: { label: string; url: string }[];
}): string {
  const lines: string[] = [clean(input.messageText)];
  const ctaUrl = clean(input.ctaUrl);
  if (ctaUrl) {
    lines.push("");
    lines.push(`${clean(input.ctaLabel)}: ${ctaUrl}`);
  }
  for (const b of input.extraCtas ?? []) {
    const url = clean(b.url);
    if (url) lines.push(`${clean(b.label)}: ${url}`);
  }
  return lines.join("\n");
}
