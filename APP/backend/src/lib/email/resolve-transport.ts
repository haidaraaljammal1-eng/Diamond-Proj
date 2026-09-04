import nodemailer, { type Transporter } from "nodemailer";
import type { FastifyInstance } from "fastify";
import { env } from "src/config/env";
import { decryptSecretBlob } from "src/modules/integrations/secret-blob";
import { buildTransportFromConfig } from "src/modules/integrations/adapters/email.adapter";

export interface ResolvedTransport { transport: Transporter; from: string }

/** DB config (enabled + configured EMAIL integration) wins; else ENV; else null. */
export async function resolveEmailTransport(fastify: FastifyInstance): Promise<ResolvedTransport | null> {
  const row = await fastify.prisma.integrationConnection.findUnique({
    where: { kind_name: { kind: "EMAIL", name: "Transactional Email" } },
  });
  if (row?.enabled && row.configured && row.secretEncrypted != null) {
    const config = (row.metadata as Record<string, string> | null) ?? {};
    if (config.smtpHost) {
      const secrets = decryptSecretBlob(row.secretEncrypted);
      const transport = buildTransportFromConfig({ config, secrets });
      const from = config.fromName ? `${config.fromName} <${config.fromEmail}>` : (config.fromEmail ?? env.SMTP_FROM);
      return { transport, from };
    }
  }
  if (env.EMAIL_ENABLED && env.SMTP_HOST.trim() !== "") {
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
    return { transport, from: env.SMTP_FROM };
  }
  return null;
}
