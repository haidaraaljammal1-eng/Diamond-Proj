import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { env } from "src/config/env";

let cachedAccountKey: string | null = null;

/** True when the configured secret key is a live-mode Stripe key. */
export function stripeLivemodeFromSecret(secretKey: string): boolean {
  return secretKey.startsWith("sk_live_");
}

export function stripeLivemodeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY) && stripeLivemodeFromSecret(env.STRIPE_SECRET_KEY);
}

/**
 * Deterministic non-secret Stripe account discriminator for profile lookup.
 * Cached after first resolution; never exposes secret material.
 */
export async function resolveStripeProviderAccountKey(stripe: Stripe): Promise<string> {
  if (cachedAccountKey) return cachedAccountKey;
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured");
  }
  try {
    const account = await stripe.accounts.retrieve();
    cachedAccountKey = account.id;
    return cachedAccountKey;
  } catch {
    // Test/sandbox keys may not expose account retrieve — fall back to mode fingerprint.
    const mode = stripeLivemodeFromSecret(env.STRIPE_SECRET_KEY) ? "live" : "test";
    cachedAccountKey = createHash("sha256")
      .update(`stripe:${mode}:${env.STRIPE_SECRET_KEY.slice(0, 12)}`)
      .digest("hex")
      .slice(0, 24);
    return cachedAccountKey;
  }
}

/** Test helper — reset module cache between tests. */
export function resetStripeAccountKeyCache(): void {
  cachedAccountKey = null;
}
