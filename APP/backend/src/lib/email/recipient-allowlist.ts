import { env } from "src/config/env";

/**
 * Non-production outbound-email safety net.
 *
 * The SMTP transport is resolved from a DB integration row or from ENV
 * (`resolveEmailTransport`). In development those credentials are frequently
 * REAL, so any code path that reaches a provider — the campaign/quick-send
 * dispatcher, the distribution worker, complaint notifications, auth emails, a
 * developer script, or an integration test run with RUN_INTEGRATION=true — can
 * put mail in a real person's inbox. Recipient addresses come from the database,
 * so "we only ever use test fixtures" is a convention, not a guarantee.
 *
 * This module turns that convention into an enforced boundary:
 *
 *   - In production the allowlist is IGNORED. Real deployments must be able to
 *     mail real customers; this must never become a production failure mode.
 *   - When `EMAIL_RECIPIENT_ALLOWLIST` is empty the allowlist is IGNORED, so
 *     existing behaviour is unchanged until an operator opts in.
 *   - Otherwise a non-listed recipient is refused BEFORE `sendMail`, and the
 *     caller records an honest SKIPPED outcome. A blocked send is never reported
 *     as SENT and never gets a fabricated providerMessageId.
 *
 * Entries may be a full address ("qa@example.test") or a whole domain
 * ("@example.test"). Matching is case-insensitive.
 */

/** Stable, machine-readable reason recorded when a send is refused here. */
export const RECIPIENT_NOT_ALLOWLISTED = "recipient_not_allowlisted";

/** True when the allowlist is actually in force (non-production + configured). */
export function recipientAllowlistActive(): boolean {
  return env.NODE_ENV !== "production" && env.EMAIL_RECIPIENT_ALLOWLIST.length > 0;
}

/**
 * May this address be mailed? Always true in production, and true everywhere
 * when the allowlist is not configured.
 */
export function isRecipientAllowed(to: string): boolean {
  if (!recipientAllowlistActive()) return true;
  const address = to.trim().toLowerCase();
  if (address === "") return false;
  const domain = address.slice(address.lastIndexOf("@"));
  return env.EMAIL_RECIPIENT_ALLOWLIST.some((raw) => {
    const entry = raw.trim().toLowerCase();
    if (entry === "") return false;
    return entry.startsWith("@") ? domain === entry : address === entry;
  });
}
