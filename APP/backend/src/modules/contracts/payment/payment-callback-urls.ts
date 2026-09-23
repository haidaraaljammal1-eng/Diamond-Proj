import { env } from "src/config/env";
import {
  buildPublicFrontendUrl,
  normalizePublicLocale,
  type PublicFrontendLocale,
} from "src/lib/http/public-frontend-url";
import { contractError } from "src/modules/contracts/contracts.errors";

const ALLOWED_CALLBACK_PATHS = new Set(["/payment/callback"]);

function assertTrustedFrontendOrigin(url: string): void {
  const base = env.FRONTEND_URL.replace(/\/$/, "");
  if (!url.startsWith(`${base}/`)) {
    throw contractError.paymentConfigurationError();
  }
}

/** Canonical success/cancel callback URLs for Stripe Checkout (server-only). */
export function buildPaymentCallbackUrls(
  statusToken: string,
  locale: PublicFrontendLocale,
): { successUrl: string; cancelUrl: string } {
  const normalized = normalizePublicLocale(locale);
  const successUrl = buildPublicFrontendUrl(normalized, "/payment/callback", {
    statusToken,
    outcome: "success",
  });
  const cancelUrl = buildPublicFrontendUrl(normalized, "/payment/callback", {
    statusToken,
    outcome: "cancel",
  });
  assertTrustedFrontendOrigin(successUrl);
  assertTrustedFrontendOrigin(cancelUrl);
  for (const url of [successUrl, cancelUrl]) {
    const path = new URL(url).pathname;
    const withoutLocale = path.replace(/^\/(ar|en)/, "");
    if (!ALLOWED_CALLBACK_PATHS.has(withoutLocale)) {
      throw contractError.paymentConfigurationError();
    }
  }
  return { successUrl, cancelUrl };
}

/** Rental payment-step cancel redirect (not the Stripe callback route). */
export function buildRentalPaymentCancelUrl(
  locale: PublicFrontendLocale,
  rentalToken: string,
): string {
  const url = buildPublicFrontendUrl(normalizePublicLocale(locale), `/rental/${rentalToken}`, {
    payment: "cancelled",
  });
  assertTrustedFrontendOrigin(url);
  return url;
}

/** Reject user-supplied redirect targets (open-redirect guard). */
export function rejectUntrustedRedirectUrl(url: string | undefined | null): void {
  if (!url) return;
  const trimmed = url.trim();
  if (!trimmed) return;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:")) {
    throw contractError.paymentConfigurationError();
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw contractError.paymentConfigurationError();
  }
  const base = new URL(env.FRONTEND_URL.replace(/\/$/, ""));
  if (parsed.origin !== base.origin) {
    throw contractError.paymentConfigurationError();
  }
}
