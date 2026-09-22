/** Locale segment from the public rental route (`/ar/...` or `/en/...`). */
export function publicRequestLocale(): "ar" | "en" {
  if (typeof window === "undefined") return "en";
  const segment = window.location.pathname.split("/").filter(Boolean)[0];
  return segment === "ar" ? "ar" : "en";
}

/** `Accept-Language` for public rental payment return URLs. */
export function publicRequestLocaleHeaders(): Record<string, string> {
  return { "Accept-Language": publicRequestLocale() };
}

/** Shared public rental API options (locale-aware backend consent + copy). */
export function publicRentalRequestOptions(
  extra?: { method?: string; body?: unknown; headers?: Record<string, string> },
) {
  return {
    publicRequest: true as const,
    ...extra,
    headers: {
      ...publicRequestLocaleHeaders(),
      ...extra?.headers,
    },
  };
}
