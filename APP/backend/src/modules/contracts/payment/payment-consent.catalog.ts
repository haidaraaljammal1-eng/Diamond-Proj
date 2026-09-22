import { createHash } from "node:crypto";
import type { PublicFrontendLocale } from "src/lib/http/public-frontend-url";

/** Operational consent scope — matches displayed legal meaning; not off-session charging yet. */
export const PAYMENT_CONSENT_SCOPE = "contract_related_future_charges_v1";

export type PaymentConsentDefinition = {
  version: string;
  locale: PublicFrontendLocale;
  text: string;
  scope: string;
  hash: string;
  active: boolean;
};

const CONSENT_COPY: Record<PublicFrontendLocale, string> = {
  en:
    "I authorize my payment method to be saved with Stripe for future charges directly related to this rental agreement, subject to the rental terms.",
  ar:
    "أوافق على حفظ وسيلة الدفع لدى Stripe لاستخدامها لاحقًا في تحصيل الرسوم المستحقة والمرتبطة مباشرة بعقد الإيجار، وفقًا لشروط العقد.",
};

export const PAYMENT_METHOD_AUTHORIZATION_VERSION = "payment_method_authorization_v1";

function consentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const CATALOG: PaymentConsentDefinition[] = (
  ["en", "ar"] as const
).map((locale) => {
  const text = CONSENT_COPY[locale];
  return {
    version: PAYMENT_METHOD_AUTHORIZATION_VERSION,
    locale,
    text,
    scope: PAYMENT_CONSENT_SCOPE,
    hash: consentHash(text),
    active: true,
  };
});

export function listActivePaymentConsents(): PaymentConsentDefinition[] {
  return CATALOG.filter((entry) => entry.active);
}

export function getPaymentConsent(
  version: string,
  locale: PublicFrontendLocale,
): PaymentConsentDefinition | null {
  return (
    CATALOG.find(
      (entry) => entry.version === version && entry.locale === locale && entry.active,
    ) ?? null
  );
}

export function assertPaymentConsent(
  version: string,
  locale: PublicFrontendLocale,
): PaymentConsentDefinition {
  const entry = getPaymentConsent(version, locale);
  if (!entry) {
    throw new Error(`Unknown or inactive payment consent: ${version}/${locale}`);
  }
  return entry;
}
