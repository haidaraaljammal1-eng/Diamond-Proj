import nodemailer, { type Transporter } from "nodemailer";
import type { IntegrationAdapter, ResolvedConfig, IntegrationErrorCode, TestResult } from "./types";
import { ok, fail } from "./types";
import { isRecipientAllowed } from "src/lib/email/recipient-allowlist";

export function smtpErrorToCode(err: { code?: string } | undefined): IntegrationErrorCode {
  const code = err?.code;
  if (code === "EAUTH") return "AUTH_FAILED";
  if (code === "ECONNECTION" || code === "ETIMEDOUT" || code === "ESOCKET" || code === "EDNS") return "CONNECTION_FAILED";
  return "PROVIDER_ERROR";
}

export function buildTransportFromConfig(cfg: { config: Record<string, string>; secrets: Record<string, string> }): Transporter {
  const enc = cfg.config.encryption ?? "none";
  const port = Number(cfg.config.smtpPort) || 587;
  return nodemailer.createTransport({
    host: cfg.config.smtpHost,
    port,
    secure: enc === "ssltls", // true = implicit TLS (465); STARTTLS uses secure:false + upgrade
    requireTLS: enc === "starttls",
    auth: cfg.config.username ? { user: cfg.config.username, pass: cfg.secrets.password ?? "" } : undefined,
  });
}

export const emailAdapter: IntegrationAdapter = {
  isConfigured: (cfg) => Boolean(cfg.config.smtpHost),
  // NOTE: EMAIL has no `send` here on purpose. Campaign email delivery goes through
  // `resolveEmailTransport` (DB integration row wins, ENV SMTP is the fallback) so
  // an ENV-only deployment keeps working; that resolver builds its transport from
  // THIS file's `buildTransportFromConfig`, so there is still one SMTP code path.
  async testConnection(cfg: ResolvedConfig): Promise<TestResult> {
    if (!cfg.config.smtpHost) return fail("NOT_CONFIGURED");
    try {
      const t = buildTransportFromConfig(cfg);
      await t.verify();
      return ok();
    } catch (e) {
      return fail(smtpErrorToCode(e as { code?: string }));
    }
  },
  async sendTest(cfg: ResolvedConfig, target): Promise<TestResult> {
    if (!cfg.config.smtpHost) return fail("NOT_CONFIGURED");
    // Non-production guard (see src/lib/email/recipient-allowlist): refuse before
    // the transport is touched. Reported honestly as a failure to send — never a
    // green "CONNECTED" for mail that was never handed to the provider.
    if (!isRecipientAllowed(target.to)) {
      return fail("RECIPIENT_NOT_ALLOWLISTED", "recipient is not on EMAIL_RECIPIENT_ALLOWLIST");
    }
    try {
      const t = buildTransportFromConfig(cfg);
      const fromName = cfg.config.fromName?.trim();
      const fromEmail = cfg.config.fromEmail;
      await t.sendMail({
        from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
        to: target.to,
        subject: "Test email — integration check",
        text: target.message ?? "This is a test email confirming your SMTP integration works.",
      });
      return ok();
    } catch (e) {
      return fail(smtpErrorToCode(e as { code?: string }));
    }
  },
};
