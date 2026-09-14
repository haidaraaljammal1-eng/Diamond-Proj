import { signMetaHubPayload } from "src/modules/whatsapp/whatsapp.webhook-signature";

/** Isolated test secrets. Never production values. */
export const TEST_WEBHOOK_VERIFY_TOKEN = "wa-test-verify-token";
export const TEST_WEBHOOK_APP_SECRET = "wa-test-app-secret";

export const FIXTURE_WABA_ID = "215589313241560883";
export const FIXTURE_PHONE_NUMBER_ID = "7794189252778687";
export const FIXTURE_DISPLAY_PHONE = "15550001111";
export const FIXTURE_WA_ID = "15551112222";
export const FIXTURE_PROFILE_NAME = "Test Customer";
export const FIXTURE_WAMID = "wamid.test.synthetic.001";
export const FIXTURE_TIMESTAMP = "1757458512";
export const FIXTURE_TEXT = "Hello Diamond test message";
export const FIXTURE_CHALLENGE = "meta-challenge-test-123";

export function officialTextMessagePayload(overrides?: {
  wabaId?: string;
  phoneNumberId?: string;
  waId?: string;
  wamid?: string;
  timestamp?: string;
  text?: string;
  profileName?: string | null;
  omitFrom?: boolean;
  extraValueFields?: Record<string, unknown>;
  type?: string;
}): Record<string, unknown> {
  const type = overrides?.type ?? "text";
  const waId = overrides?.waId ?? FIXTURE_WA_ID;
  const message: Record<string, unknown> = {
    id: overrides?.wamid ?? FIXTURE_WAMID,
    timestamp: overrides?.timestamp ?? FIXTURE_TIMESTAMP,
    type,
  };
  if (!overrides?.omitFrom) message.from = waId;
  if (type === "text") {
    message.text = { body: overrides?.text ?? FIXTURE_TEXT };
  }
  if (type === "image") {
    message.image = { id: "media-test-synthetic-id", mime_type: "image/jpeg" };
  }
  const profileName =
    overrides?.profileName === undefined ? FIXTURE_PROFILE_NAME : overrides.profileName;
  const contacts =
    profileName === null
      ? [{ wa_id: waId }]
      : [{ profile: { name: profileName }, wa_id: waId }];
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: overrides?.wabaId ?? FIXTURE_WABA_ID,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: FIXTURE_DISPLAY_PHONE,
                phone_number_id: overrides?.phoneNumberId ?? FIXTURE_PHONE_NUMBER_ID,
              },
              contacts,
              messages: [message],
              ...(overrides?.extraValueFields ?? {}),
            },
          },
        ],
      },
    ],
  };
}

export function officialStatusPayload(overrides?: {
  wabaId?: string;
  phoneNumberId?: string;
  wamid?: string;
  status?: string;
  timestamp?: string;
}): Record<string, unknown> {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: overrides?.wabaId ?? FIXTURE_WABA_ID,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: FIXTURE_DISPLAY_PHONE,
                phone_number_id: overrides?.phoneNumberId ?? FIXTURE_PHONE_NUMBER_ID,
              },
              statuses: [
                {
                  id: overrides?.wamid ?? "wamid.test.synthetic.status.001",
                  status: overrides?.status ?? "delivered",
                  timestamp: overrides?.timestamp ?? FIXTURE_TIMESTAMP,
                  recipient_id: FIXTURE_WA_ID,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

export function signedWebhook(
  payload: unknown,
  appSecret = TEST_WEBHOOK_APP_SECRET,
): { raw: Buffer; signature: string } {
  const raw = Buffer.from(JSON.stringify(payload), "utf8");
  return { raw, signature: signMetaHubPayload(raw, appSecret) };
}
