import { createHash } from "node:crypto";
import type { PublicFrontendLocale } from "src/lib/http/public-frontend-url";

/** Legacy scope — saved-card authorization for contract-related future charges (v1). */
export const PAYMENT_CONSENT_SCOPE_V1 = "contract_related_future_charges_v1";
/** Explicit off-session scope for delayed RTA / Salik / toll charges (v2). */
export const PAYMENT_CONSENT_SCOPE_V2 = "contract_off_session_road_charges_v2";
/** Active default scope for new authorizations. */
export const PAYMENT_CONSENT_SCOPE = PAYMENT_CONSENT_SCOPE_V2;

export type PaymentConsentDefinition = {
  version: string;
  locale: PublicFrontendLocale;
  text: string;
  scope: string;
  hash: string;
  active: boolean;
};

const CONSENT_COPY_V1: Record<PublicFrontendLocale, string> = {
  en:
    "I authorize my payment method to be saved with Stripe for future charges directly related to this rental agreement, subject to the rental terms.",
  ar:
    "أوافق على حفظ وسيلة الدفع لدى Stripe لاستخدامها لاحقًا في تحصيل الرسوم المستحقة والمرتبطة مباشرة بعقد الإيجار، وفقًا لشروط العقد.",
};

const CONSENT_COPY_V2: Record<PublicFrontendLocale, string> = {
  en:
    "I authorize Diamond to save my payment method with Stripe and to charge it off-session for traffic violations, Salik tolls, and other road liabilities that arise from this rental agreement, including charges that arrive after the rental ends, subject to the rental terms.",
  ar:
    "أوافق على حفظ وسيلة الدفع لدى Stripe والتحصيل منها دون حضوري للمخالفات المرورية ورسوم سالك والالتزامات المرورية الأخرى المرتبطة بعقد الإيجار، بما في ذلك الرسوم التي تصل بعد انتهاء الإيجار، وفقًا لشروط العقد.",
};

export const PAYMENT_METHOD_AUTHORIZATION_VERSION_V1 = "payment_method_authorization_v1";
export const PAYMENT_METHOD_AUTHORIZATION_VERSION_V2 = "payment_method_authorization_v2";
export const PAYMENT_METHOD_AUTHORIZATION_VERSION = PAYMENT_METHOD_AUTHORIZATION_VERSION_V2;

/** Scopes that permit automatic off-session road-liability collection. */
export const OFF_SESSION_ELIGIBLE_CONSENT_SCOPES = [PAYMENT_CONSENT_SCOPE_V2] as const;

function consentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const CATALOG: PaymentConsentDefinition[] = [
  ...(["en", "ar"] as const).map((locale) => {
    const text = CONSENT_COPY_V2[locale];
    return {
      version: PAYMENT_METHOD_AUTHORIZATION_VERSION_V2,
      locale,
      text,
      scope: PAYMENT_CONSENT_SCOPE_V2,
      hash: consentHash(text),
      active: true,
    };
  }),
  ...(["en", "ar"] as const).map((locale) => {
    const text = CONSENT_COPY_V1[locale];
    return {
      version: PAYMENT_METHOD_AUTHORIZATION_VERSION_V1,
      locale,
      text,
      scope: PAYMENT_CONSENT_SCOPE_V1,
      hash: consentHash(text),
      active: false,
    };
  }),
];

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
