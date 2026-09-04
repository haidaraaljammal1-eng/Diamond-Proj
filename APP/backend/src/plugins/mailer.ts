import fp from "fastify-plugin";
import { env } from "src/config/env";
import { renderEmail, type EmailTemplateKey } from "src/lib/email/templates";
import { resolveEmailTransport } from "src/lib/email/resolve-transport";
import { isRecipientAllowed, RECIPIENT_NOT_ALLOWLISTED } from "src/lib/email/recipient-allowlist";

/**
 * Email foundation (capability-gated). When no transport can be resolved
 * (neither a DB-configured "Transactional Email" integration nor ENV SMTP),
 * sends are SKIPPED — no real mail is ever sent accidentally. Provider is SMTP
 * via nodemailer; swap the transport for another provider behind this same
 * interface. The transport is resolved PER SEND (not once at plugin init) via
 * resolveEmailTransport: a DB-configured integration wins over ENV so an admin
 * can change SMTP credentials from the UI with no redeploy, while ENV remains
 * the fallback so existing deployments keep working unchanged.
 */
export type EmailSendResult = { status: "SENT" | "SKIPPED" | "FAILED"; reason?: string };

export interface Mailer {
  readonly enabled: boolean;
  send(params: {
    to: string;
    template: EmailTemplateKey;
    vars: Record<string, string>;
  }): Promise<EmailSendResult>;
}

declare module "fastify" {
  interface FastifyInstance {
    mailer: Mailer;
  }
}

export const mailerPlugin = fp(
  async (fastify) => {
    const mailer: Mailer = {
      enabled: env.EMAIL_ENABLED,
      async send({ to, template, vars }) {
        const resolved = await resolveEmailTransport(fastify);
        if (!resolved) {
          fastify.log.info({ to, template }, "email skipped (email disabled)");
          return { status: "SKIPPED", reason: "email disabled" };
        }
        // Non-production guard (see recipient-allowlist): a recipient outside the
        // allowlist is refused before the transport is touched and reported
        // honestly as SKIPPED.
        if (!isRecipientAllowed(to)) {
          fastify.log.warn({ template }, "email skipped (recipient not allowlisted)");
          return { status: "SKIPPED", reason: RECIPIENT_NOT_ALLOWLISTED };
        }
        try {
          const rendered = renderEmail(template, vars);
          await resolved.transport.sendMail({
            from: resolved.from,
            to,
            subject: rendered.subject,
            text: rendered.text,
            html: rendered.html,
          });
          return { status: "SENT" };
        } catch (err) {
          fastify.log.error({ err, to, template }, "email send failed");
          return { status: "FAILED", reason: "send error" };
        }
      },
    };

    fastify.decorate("mailer", mailer);
  },
  { name: "mailer" },
);
