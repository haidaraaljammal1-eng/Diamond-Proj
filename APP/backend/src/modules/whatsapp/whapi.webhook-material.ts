import { timingSafeCallbackKey } from "src/modules/whatsapp/ultramsg.webhook-parse";
import { timingSafeWhapiWebhookSecret } from "src/modules/whatsapp/whapi.config";

/**
 * Plaintext stored inside the existing encrypted `webhookCallbackCiphertext`.
 * Legacy rows are the raw callback key. Version 2 also holds the webhook secret
 * so a channel replacement does not depend on process environment.
 */
export interface WhapiWebhookMaterial {
  callbackKey: string;
  webhookSecret: string | null;
}

export function encodeWhapiWebhookMaterial(input: {
  callbackKey: string;
  webhookSecret: string;
}): string {
  return JSON.stringify({
    v: 2,
    callbackKey: input.callbackKey,
    webhookSecret: input.webhookSecret,
  });
}

export function decodeWhapiWebhookMaterial(plain: string): WhapiWebhookMaterial {
  const trimmed = plain.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as {
        v?: unknown;
        callbackKey?: unknown;
        webhookSecret?: unknown;
      };
      if (
        parsed.v === 2 &&
        typeof parsed.callbackKey === "string" &&
        parsed.callbackKey.length > 0 &&
        typeof parsed.webhookSecret === "string" &&
        parsed.webhookSecret.length > 0
      ) {
        return { callbackKey: parsed.callbackKey, webhookSecret: parsed.webhookSecret };
      }
    } catch {
      /* legacy callback key */
    }
  }
  return { callbackKey: trimmed, webhookSecret: null };
}

/**
 * The active connection's stored material wins. The process env secret and
 * callback key are used only for a legacy row that has not stored its own.
 */
export function whapiWebhookAuthorized(input: {
  presentedCallbackKey: string;
  presentedSecret: string | undefined;
  storedPlaintext: string | null;
  envCallbackKey: string;
  envSecret: string;
}): boolean {
  const stored = input.storedPlaintext ? decodeWhapiWebhookMaterial(input.storedPlaintext) : null;
  const callbackExpected = stored?.callbackKey || input.envCallbackKey.trim();
  if (!callbackExpected || !timingSafeCallbackKey(callbackExpected, input.presentedCallbackKey)) {
    return false;
  }
  const secretExpected = stored?.webhookSecret || input.envSecret.trim();
  if (!secretExpected || !input.presentedSecret) return false;
  return timingSafeWhapiWebhookSecret(secretExpected, input.presentedSecret);
}
