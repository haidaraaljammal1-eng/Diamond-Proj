function resolveApiUrl(): string {
  if (typeof window !== "undefined") {
    // Isolated E2E only: Next rewrites `/backend-api/*` to the disposable backend (same-origin).
    if (process.env.NEXT_PUBLIC_API_PROXY === "true") {
      return `${window.location.origin}/backend-api`;
    }
  }
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  return apiUrl?.replace(/\/$/, "") ?? "";
}

export const env = {
  get apiUrl() {
    return resolveApiUrl();
  },
} as const;
