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
  /** Operating company this configuration belongs to (UNIQUE / ELITE). */
  companyCode: string;
}

/**
 * Each operating company will integrate with its own TARS account, so config is
 * resolved per company code. Today only the shared operator flag exists; when
 * real TARS documentation arrives, per-company credentials are read here
 * (`TARS_<CODE>_*`) and nothing else in Diamond has to change.
 */
export function getTarsConfig(companyCode: string): TarsConfig {
  return { enabled: env.TARS_ENABLED, companyCode };
}
