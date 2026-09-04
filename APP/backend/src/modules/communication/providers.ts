import type { FastifyInstance } from "fastify";
import type { CommunicationChannel } from "@prisma/client";
import { resolveEmailTransport } from "src/lib/email/resolve-transport";
import { isRecipientAllowed, RECIPIENT_NOT_ALLOWLISTED } from "src/lib/email/recipient-allowlist";
import { escapeHtml } from "src/modules/communication/template-content";
import type { RenderedMessage } from "src/modules/communication/template-render";
import { getAdapter } from "src/modules/integrations/adapters";
import type { IntegrationErrorCode, ResolvedConfig } from "src/modules/integrations/adapters/types";
import { getDescriptor, type CatalogKind } from "src/modules/integrations/catalog";
import { decryptSecretBlob } from "src/modules/integrations/secret-blob";

/**
 * Provider-agnostic message dispatch — the ONE send path for campaigns.
 *
 * Every channel resolves its provider from the SAME configured integration the
 * admin screen writes (the `IntegrationConnection` row) and sends through the SAME
 * adapter the "Test connection / Send test" buttons use. There is no second
 * registry and no stub: if an operator configures WhatsApp and its test goes
 * green, campaigns send through that exact configuration.
 *
 * Honesty contract:
 *   - not configured / disabled -> SKIPPED (never a fabricated SENT)
 *   - provider accepted         -> SENT + the provider's own message id
 *   - provider rejected/errored -> FAILED with a stable structured reason
 *
 * A testing adapter (tests only) can still be injected into the campaigns service.
 */

export type ProviderReadiness = "CONFIGURED" | "NOT_CONFIGURED" | "UNAVAILABLE";

export interface ProviderSendInput {
  to: string;
  rendered: RenderedMessage;
  providerTemplateName?: string | null;
  providerLanguageCode?: string | null;
}

export type ProviderResult =
  | { status: "SENT"; providerMessageId: string }
  | { status: "SKIPPED"; reason: string }
  | { status: "FAILED"; reason: string };

export interface MessageProvider {
  readiness(): Promise<ProviderReadiness>;
  send(input: ProviderSendInput): Promise<ProviderResult>;
}

export type ProviderRegistry = Record<CommunicationChannel, MessageProvider>;

/**
 * Stable, machine-readable delivery outcome vocabulary. Everything written to
 * `MessageDelivery.failureReason` comes from here — the frontend and reports
 * branch on THESE codes, never on free text. No provider payload, credential or
 * error string is ever folded into a reason.
 */
export const DeliveryReason = {
  // Suppressions (nothing was sent, and nothing was wrong with the provider)
  INVITATION_CLOSED: "invitation_closed",
  CONDITION_NOT_MET: "condition_not_met",
  LINK_REVOKED: "link_revoked",
  LINK_EXPIRED: "link_expired",
  /** The customer opted out of this channel (email / SMS / WhatsApp). */
  CUSTOMER_OPTED_OUT: "channel_opted_out",
  MISSING_RECIPIENT_ADDRESS: "missing_recipient_address",
  /** Non-production only: the recipient is not on EMAIL_RECIPIENT_ALLOWLIST. */
  RECIPIENT_NOT_ALLOWLISTED,
  TEMPLATE_NOT_PUBLISHED: "template_not_published",
  TEMPLATE_NOT_CONFIGURED: "template_not_configured",
  /** Queued to the call centre instead of messaged — no message was sent. */
  QUEUED_TO_CALL_CENTER: "queued_to_call_center",
  // Provider configuration (retrying cannot help — suppress, do not burn attempts)
  PROVIDER_NOT_CONFIGURED: "provider_not_configured",
  PROVIDER_CONFIG_INVALID: "provider_config_invalid",
  // Provider failures (retryable up to maxAttempts)
  PROVIDER_AUTH_FAILED: "provider_auth_failed",
  PROVIDER_UNREACHABLE: "provider_unreachable",
  PROVIDER_TIMEOUT: "provider_timeout",
  PROVIDER_ERROR: "provider_error",
  SEND_ERROR: "send_error",
} as const;
export type DeliveryReason = (typeof DeliveryReason)[keyof typeof DeliveryReason];

/** Map an adapter error code onto the delivery vocabulary + its terminal-ness.
 *  Config problems SKIP (a retry would fail identically); everything else FAILS
 *  so the existing backoff/maxAttempts logic can retry transient provider faults. */
function mapAdapterError(code: IntegrationErrorCode | undefined): ProviderResult {
  switch (code) {
    case "NOT_CONFIGURED":
      return { status: "SKIPPED", reason: DeliveryReason.PROVIDER_NOT_CONFIGURED };
    case "INVALID_CONFIG":
      return { status: "SKIPPED", reason: DeliveryReason.PROVIDER_CONFIG_INVALID };
    case "RECIPIENT_NOT_ALLOWLISTED":
      // Nothing was sent and a retry would be refused identically -> SKIP.
      return { status: "SKIPPED", reason: DeliveryReason.RECIPIENT_NOT_ALLOWLISTED };
    case "AUTH_FAILED":
      return { status: "FAILED", reason: DeliveryReason.PROVIDER_AUTH_FAILED };
    case "CONNECTION_FAILED":
      return { status: "FAILED", reason: DeliveryReason.PROVIDER_UNREACHABLE };
    case "TIMEOUT":
      return { status: "FAILED", reason: DeliveryReason.PROVIDER_TIMEOUT };
    default:
      return { status: "FAILED", reason: DeliveryReason.PROVIDER_ERROR };
  }
}

/** CTA buttons are first-class content but live OUTSIDE bodyText. For text-only
 *  channels they must be folded in or the recipient gets a linkless message. */
function foldButtonsIntoText(rendered: RenderedMessage): string {
  if (rendered.buttons.length === 0) return rendered.text;
  return rendered.text + "\n\n" + rendered.buttons.map((b) => `${b.label}: ${b.url}`).join("\n");
}

function buildEmailProvider(fastify: FastifyInstance): MessageProvider {
  return {
    // DB-aware: CONFIGURED whenever resolveEmailTransport would actually build a
    // transport (DB "Transactional Email" IntegrationConnection wins, ENV SMTP is
    // the fallback) — matches send() below so a DB-only config is never SKIPPED.
    async readiness() {
      return (await resolveEmailTransport(fastify)) != null ? "CONFIGURED" : "NOT_CONFIGURED";
    },
    async send({ to, rendered }) {
      const resolved = await resolveEmailTransport(fastify);
      if (!resolved) return { status: "SKIPPED", reason: DeliveryReason.PROVIDER_NOT_CONFIGURED };
      if (to.trim() === "") return { status: "SKIPPED", reason: DeliveryReason.MISSING_RECIPIENT_ADDRESS };
      // Non-production guard: refuse BEFORE the transport is touched, and record
      // it honestly as SKIPPED — never a fabricated SENT / providerMessageId.
      if (!isRecipientAllowed(to)) {
        return { status: "SKIPPED", reason: DeliveryReason.RECIPIENT_NOT_ALLOWLISTED };
      }
      try {
        // CTA buttons are rendered INSIDE the email shell by `renderVariant`,
        // which is the single owner of EMAIL presentation — both in `html` and
        // in the plain-text alternative. Appending them again here produced a
        // SECOND copy of every button (a differently-styled red, and pasted
        // after the document's closing </html>), plus a duplicated link line in
        // the text part. So nothing is folded in on the shell path.
        //
        // The fallback below only runs when `html` is null, which `renderVariant`
        // never produces for EMAIL; it is kept so a future non-shell renderer
        // still delivers a clickable link rather than a linkless email.
        let htmlBody = rendered.html ?? undefined;
        let textBody = rendered.text;
        if (rendered.html == null && rendered.buttons.length > 0) {
          const buttonsHtml = rendered.buttons
            .map(
              (b) =>
                `<p style="margin:16px 0"><a href="${escapeHtml(b.url)}" style="display:inline-block;padding:12px 22px;background:#d6001c;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">${escapeHtml(b.label)}</a></p>`,
            )
            .join("");
          htmlBody = `<div>${escapeHtml(rendered.text).replace(/\n/g, "<br>")}</div>${buttonsHtml}`;
          textBody = foldButtonsIntoText(rendered);
        }

        const info = await resolved.transport.sendMail({
          from: resolved.from,
          to,
          subject: rendered.subject ?? "",
          text: textBody,
          html: htmlBody,
        });
        return { status: "SENT", providerMessageId: String(info.messageId ?? "") };
      } catch {
        // Never log/return the provider error object — it can carry credentials.
        return { status: "FAILED", reason: DeliveryReason.SEND_ERROR };
      }
    },
  };
}

/**
 * WhatsApp / SMS: resolve the operator-managed IntegrationConnection row and send
 * through the shared adapter. Enabled + configured + complete config is required
 * for CONFIGURED; anything short of that is an honest NOT_CONFIGURED.
 */
function buildIntegrationProvider(fastify: FastifyInstance, kind: Extract<CatalogKind, "WHATSAPP" | "SMS">): MessageProvider {
  const adapter = getAdapter(kind);

  /** The stored, usable config — or null when this channel must not be attempted. */
  async function resolveConfig(): Promise<ResolvedConfig | null> {
    const row = await fastify.prisma.integrationConnection.findUnique({
      where: { kind_name: { kind, name: getDescriptor(kind).name } },
    });
    if (!row || !row.enabled || !row.configured || row.secretEncrypted == null) return null;
    const cfg: ResolvedConfig = {
      config: ((row.metadata as Record<string, string> | null) ?? {}) as Record<string, string>,
      secrets: decryptSecretBlob(row.secretEncrypted),
    };
    // Complete enough to actually send? (pure check, no provider round-trip)
    return adapter.isConfigured?.(cfg) === false ? null : cfg;
  }

  return {
    async readiness() {
      return (await resolveConfig()) != null ? "CONFIGURED" : "NOT_CONFIGURED";
    },
    async send({ to, rendered, providerTemplateName, providerLanguageCode }) {
      const cfg = await resolveConfig();
      if (!cfg || !adapter.send) return { status: "SKIPPED", reason: DeliveryReason.PROVIDER_NOT_CONFIGURED };
      if (to.trim() === "") return { status: "SKIPPED", reason: DeliveryReason.MISSING_RECIPIENT_ADDRESS };
      let result;
      try {
        result = await adapter.send(cfg, {
          to,
          text: foldButtonsIntoText(rendered),
          providerTemplateName: providerTemplateName ?? null,
          providerLanguageCode: providerLanguageCode ?? null,
        });
      } catch {
        // Swallow the raw error: adapter errors can embed request headers/tokens.
        return { status: "FAILED", reason: DeliveryReason.PROVIDER_ERROR };
      }
      if (result.ok) return { status: "SENT", providerMessageId: result.providerMessageId ?? "" };
      return mapAdapterError(result.code);
    },
  };
}

export function defaultProviderRegistry(fastify: FastifyInstance): ProviderRegistry {
  return {
    EMAIL: buildEmailProvider(fastify),
    WHATSAPP: buildIntegrationProvider(fastify, "WHATSAPP"),
    SMS: buildIntegrationProvider(fastify, "SMS"),
  };
}
