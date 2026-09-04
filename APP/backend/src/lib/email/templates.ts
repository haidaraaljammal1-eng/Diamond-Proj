/**
 * Generic email template registry. Variables are substituted with a simple
 * {{name}} replacement. Only account-setup and password-reset ship in the
 * starter — no domain templates.
 */
export type EmailTemplateKey = "account_setup" | "password_reset";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

type TemplateVars = Record<string, string>;

interface TemplateDefinition {
  subject: string;
  text: (v: TemplateVars) => string;
  html: (v: TemplateVars) => string;
  requiredVars: string[];
}

const TEMPLATES: Record<EmailTemplateKey, TemplateDefinition> = {
  account_setup: {
    subject: "Set up your account",
    requiredVars: ["name", "link"],
    text: (v) =>
      `Hello ${v.name},\n\nAn account has been created for you. Set your password to activate it:\n${v.link}\n\nThis link expires soon and can be used once.`,
    html: (v) =>
      `<p>Hello ${v.name},</p><p>An account has been created for you. Set your password to activate it:</p><p><a href="${v.link}">Set your password</a></p><p>This link expires soon and can be used once.</p>`,
  },
  password_reset: {
    subject: "Reset your password",
    requiredVars: ["name", "link"],
    text: (v) =>
      `Hello ${v.name},\n\nWe received a request to reset your password. Use the link below:\n${v.link}\n\nIf you did not request this, you can ignore this email.`,
    html: (v) =>
      `<p>Hello ${v.name},</p><p>We received a request to reset your password:</p><p><a href="${v.link}">Reset your password</a></p><p>If you did not request this, you can ignore this email.</p>`,
  },
};

export function renderEmail(key: EmailTemplateKey, vars: TemplateVars): RenderedEmail {
  const def = TEMPLATES[key];
  const missing = def.requiredVars.filter((name) => !(name in vars));
  if (missing.length > 0) {
    throw new Error(
      `Email template "${key}" is missing variables: ${missing.join(", ")}`,
    );
  }
  return { subject: def.subject, text: def.text(vars), html: def.html(vars) };
}
