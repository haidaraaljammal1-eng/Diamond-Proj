import { env } from "src/config/env";

export const PUSHOVER_SEND_TIMEOUT_MS = 15_000;

export function isPushoverConfigured(
  input: { appToken?: string; userKey?: string } = {
    appToken: env.PUSHOVER_APP_TOKEN,
    userKey: env.PUSHOVER_USER_KEY,
  },
): boolean {
  return (
    (input.appToken ?? "").trim().length > 0 && (input.userKey ?? "").trim().length > 0
  );
}

export function pushoverRuntimeConfig() {
  return {
    appToken: env.PUSHOVER_APP_TOKEN.trim(),
    userKey: env.PUSHOVER_USER_KEY.trim(),
  };
}
