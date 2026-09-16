import { env } from "src/config/env";

/**
 * Minimal TARS configuration. Only intent is configurable today.
 *
 * Deliberately absent: client id/secret, API key, OAuth URLs, certificates and
 * signature keys. Official TARS authentication is unknown, so inventing those
 * settings now would bake in a wrong contract. They arrive with the real
 * TarsApiProvider.
 */
export interface TarsConfig {
  /** Operator intent only — it does NOT make a provider configured. */
  enabled: boolean;
}

export function getTarsConfig(): TarsConfig {
  return { enabled: env.TARS_ENABLED };
}
