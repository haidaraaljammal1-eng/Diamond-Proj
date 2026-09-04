import sanitizeHtml from "sanitize-html";

/**
 * Server-side email HTML sanitization + URL safety. The backend is the authority:
 * body HTML is ALWAYS run through an allow-list before persistence, and button URL
 * templates are validated against a safe-scheme allow-list. Never trust the client.
 */

const EMAIL_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "blockquote", "span", "div", "table", "thead",
    "tbody", "tr", "td", "th",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    "*": ["style"],
  },
  // Block javascript:, data:, and any other dangerous scheme — links only.
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { a: ["http", "https", "mailto"] },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  allowedStyles: {
    "*": {
      color: [/^#[0-9a-fA-F]{3,6}$/, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/],
      "text-align": [/^(left|right|center|justify)$/],
      "font-weight": [/^(bold|normal|[1-9]00)$/],
      "font-style": [/^(italic|normal)$/],
    },
  },
  transformTags: {
    // Force safe link rels; strip target-based reverse-tabnabbing risk.
    a: (tagName, attribs) => ({
      tagName: "a",
      attribs: { ...attribs, rel: "noopener noreferrer" },
    }),
  },
};

/** Sanitize untrusted email body HTML down to the safe rich-text allow-list. */
export function sanitizeEmailHtml(dirty: string): string {
  return sanitizeHtml(dirty, EMAIL_SANITIZE_OPTIONS);
}

const LEADING_ACTION_LINK = /^\{\{\s*action_link\s*\}\}/;
const PLACEHOLDER_ANY = /\{\{\s*[a-z0-9_]+\s*\}\}/gi;
const SAFE_URL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * A button URL template is safe when it is the `{{action_link}}` variable or an
 * absolute http(s)/mailto URL (variables may be embedded in its query/path).
 * javascript:, data:, protocol-relative and unparseable values are rejected.
 */
export function isSafeUrlTemplate(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === "") return false;
  if (LEADING_ACTION_LINK.test(trimmed)) return true;
  const probe = trimmed.replace(PLACEHOLDER_ANY, "x");
  try {
    const parsed = new URL(probe);
    return SAFE_URL_SCHEMES.has(parsed.protocol);
  } catch {
    return false;
  }
}
