import { env } from "src/config/env";

export type PublicFrontendLocale = "ar" | "en";

/** Normalizes a public rental locale for frontend return URLs. */
export function normalizePublicLocale(locale?: string | null): PublicFrontendLocale {
  return locale?.toLowerCase().startsWith("ar") ? "ar" : "en";
}

/** Resolves locale from the browser `Accept-Language` header on public routes. */
export function publicLocaleFromAcceptLanguage(
  acceptLanguage: string | string[] | undefined,
): PublicFrontendLocale {
  const raw = Array.isArray(acceptLanguage) ? acceptLanguage[0] : acceptLanguage;
  return normalizePublicLocale(raw?.split(",")[0]?.trim());
}

/** Builds an absolute frontend URL under `FRONTEND_URL` with locale prefix. */
export function buildPublicFrontendUrl(
  locale: PublicFrontendLocale,
  path: string,
  query?: Record<string, string>,
): string {
  const base = env.FRONTEND_URL.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${base}/${locale}${normalizedPath}`;
  if (!query || Object.keys(query).length === 0) return url;
  const params = new URLSearchParams(query);
  return `${url}?${params.toString()}`;
}
