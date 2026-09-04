import i18next from "i18next";
import { en } from "src/locales/en";
import { ar } from "src/locales/ar";

/**
 * Minimal, request-safe i18n. Language is passed EXPLICITLY per call via
 * `options.lng` (read from the request in the error handler / route boundary)
 * rather than mutating a global language — safe under concurrency.
 *
 * Convention: throw `AppError` with an English message KEY; localization happens
 * once, centrally, in the global error handler.
 */
void i18next.init({
  lng: "en",
  fallbackLng: "en",
  initImmediate: false,
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  interpolation: { escapeValue: false },
});

export type Language = "en" | "ar";

export function resolveLanguage(input?: string | null): Language {
  return input?.toLowerCase().startsWith("ar") ? "ar" : "en";
}

export function t(
  key: string,
  options?: Record<string, unknown> & { lng?: Language },
): string {
  return i18next.t(key, options) as string;
}
