import { env, isDevelopment } from "src/config/env";

/** Mirrors @fastify/cors origin callback in `src/plugins/cors.ts`. */
export function isCorsOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (env.CORS_ORIGINS.length === 0) return isDevelopment;
  return env.CORS_ORIGINS.includes("*") || env.CORS_ORIGINS.includes(origin);
}

/**
 * CORS headers for a hijacked/raw response when the global CORS plugin cannot attach them.
 * Returns an empty object when no Origin is sent (non-browser clients).
 */
export function corsHeadersForOrigin(origin: string | undefined): Record<string, string> {
  if (!origin || !isCorsOriginAllowed(origin)) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}
