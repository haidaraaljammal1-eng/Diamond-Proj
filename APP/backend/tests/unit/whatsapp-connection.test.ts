import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encryptWhatsAppCredential, decryptWhatsAppCredential, hashesEqual } from "src/modules/whatsapp/whatsapp.credentials";
import { hashToken } from "src/lib/security/tokens";
import { WhatsAppUnconfiguredProvider } from "src/modules/whatsapp/providers/whatsapp-unconfigured.provider";
import {
  extractGrantedWabaIds,
  MetaCloudWhatsAppProvider,
} from "src/modules/whatsapp/providers/meta-cloud-api.provider";
import { findGrantedPhone, grantHasWaba, parseGrantMetadata } from "src/modules/whatsapp/whatsapp.grant";
import { toConnectionDto, toSelectableChoices } from "src/modules/whatsapp/whatsapp.mapper";
import {
  WhatsAppAuthorizeBodySchema,
  WhatsAppConnectionAttemptStartSchema,
  WhatsAppConnectionSchema,
  WhatsAppSelectBodySchema,
} from "src/modules/whatsapp/whatsapp.schema";
import { createWhatsAppProvider } from "src/modules/whatsapp/whatsapp.provider";
import { WhatsAppErrorReason } from "src/modules/whatsapp/whatsapp.errors";
import { testWhatsAppGrant } from "../helpers/fake-whatsapp-provider";

const FORBIDDEN_OPENAPI = [
  "EAA",
  "META_APP_SECRET",
  "client_secret",
  "app_secret",
  "replace-with-real-token",
  "sk_live",
  "enc:v1:",
];

describe("WhatsAppUnconfiguredProvider", () => {
  it("is not configured and fails closed without inventing a grant", async () => {
    const provider = new WhatsAppUnconfiguredProvider();
    assert.equal(provider.configured, false);
    assert.equal(provider.name, "none");
    const exchanged = await provider.exchangeAuthorizationCode("code");
    assert.equal(exchanged.ok, false);
    if (!exchanged.ok) assert.equal(exchanged.code, "NOT_CONFIGURED");
    const subscribed = await provider.subscribeWaba("token", "123");
    assert.equal(subscribed.ok, false);
    if (!subscribed.ok) assert.equal(subscribed.code, "NOT_CONFIGURED");
    const status = await provider.getWebhookSubscriptionStatus("token", "123");
    assert.equal(status.ok, false);
    if (!status.ok) assert.equal(status.code, "NOT_CONFIGURED");
  });
});

describe("createWhatsAppProvider", () => {
  it("does not expose a test double through runtime factory by default", () => {
    const provider = createWhatsAppProvider();
    assert.notEqual(provider.name, "fake");
  });
});

describe("WhatsApp credential encryption", () => {
  it("round-trips with an enc:v1 prefix and rejects unknown versions", () => {
    const token = "wa-secret-value-for-unit-test";
    const stored = encryptWhatsAppCredential(token);
    assert.equal(stored.startsWith("enc:v1:"), true);
    assert.equal(stored.includes(token), false);
    assert.equal(decryptWhatsAppCredential(stored), token);
    assert.throws(() => decryptWhatsAppCredential("enc:v2:nope"));
  });
});

describe("connection attempt state hashing", () => {
  it("compares hashed state in constant time", () => {
    const state = "one-time-state";
    const hashed = hashToken(state);
    assert.equal(hashesEqual(hashed, hashToken(state)), true);
    assert.equal(hashesEqual(hashed, hashToken("other")), false);
  });
});

describe("grant selection", () => {
  const grant = testWhatsAppGrant();

  it("accepts a phone that belongs to the server-validated WABA", () => {
    assert.equal(grantHasWaba(grant, "123456"), true);
    const phone = findGrantedPhone(grant, "123456", "1001");
    assert.equal(phone?.displayPhoneNumber, "971500000000");
  });

  it("rejects an arbitrary WABA id", () => {
    assert.equal(grantHasWaba(grant, "999999"), false);
    assert.equal(findGrantedPhone(grant, "999999", "1001"), null);
  });

  it("rejects an arbitrary phoneNumberId even on a granted WABA", () => {
    assert.equal(findGrantedPhone(grant, "123456", "0000"), null);
  });

  it("fails closed on malformed grant metadata", () => {
    assert.equal(parseGrantMetadata({ wabas: "nope" }), null);
    assert.equal(parseGrantMetadata({ access_token: "x" }), null);
  });
});

describe("connection mapper", () => {
  it("returns DISCONNECTED with no secrets when there is no row", () => {
    const dto = toConnectionDto(null);
    assert.equal(dto.status, "DISCONNECTED");
    assert.equal("credentialCiphertext" in dto, false);
    assert.equal(JSON.stringify(dto).includes("token"), false);
    assert.equal(dto.webhookStatus, "NOT_CONFIGURED");
    assert.equal(dto.lastWebhookAt, null);
  });

  it("omits tokens from selectable choices", () => {
    const choices = toSelectableChoices(
      [{ wabaId: "123456", businessName: "Test" }],
      [
        {
          wabaId: "123456",
          phoneNumberId: "1001",
          displayPhoneNumber: "971500000000",
          verifiedName: "Test",
        },
      ],
    );
    const text = JSON.stringify(choices);
    assert.equal(text.includes("access"), false);
    assert.equal(choices[0]?.wabaId, "123456");
  });
});

describe("OpenAPI WhatsApp schemas", () => {
  it("do not embed secret examples", () => {
    const blob = JSON.stringify({
      authorize: WhatsAppAuthorizeBodySchema.safeParse({
        authorizationCode: "placeholder-code",
        state: "placeholder-state",
      }).success,
      select: WhatsAppSelectBodySchema.shape,
      connection: WhatsAppConnectionSchema.shape,
      start: WhatsAppConnectionAttemptStartSchema.shape,
    });
    for (const needle of FORBIDDEN_OPENAPI) {
      assert.equal(blob.includes(needle), false, needle);
    }
    assert.equal("credentialCiphertext" in WhatsAppConnectionSchema.shape, false);
    assert.equal("accessToken" in WhatsAppConnectionSchema.shape, false);
  });
});

describe("error reasons", () => {
  it("uses stable domain codes", () => {
    assert.equal(WhatsAppErrorReason.PROVIDER_NOT_CONFIGURED, "WHATSAPP_PROVIDER_NOT_CONFIGURED");
    assert.equal(WhatsAppErrorReason.CONNECTION_ATTEMPT_USED, "WHATSAPP_CONNECTION_ATTEMPT_USED");
  });
});

describe("extractGrantedWabaIds", () => {
  it("reads whatsapp_business_management target_ids only", () => {
    const ids = extractGrantedWabaIds([
      { scope: "whatsapp_business_management", target_ids: ["123456", 789] },
      { scope: "whatsapp_business_messaging", target_ids: ["111"] },
    ]);
    assert.deepEqual(ids, ["123456", "789"]);
  });

  it("fails closed to an empty list when target_ids are omitted", () => {
    assert.deepEqual(extractGrantedWabaIds([{ scope: "whatsapp_business_management" }]), []);
  });
});

describe("MetaCloudWhatsAppProvider", () => {
  const cfg = {
    appId: "111",
    appSecret: "super-secret-app-value",
    graphApiVersion: "v25.0",
    configId: "cfg1",
  };

  it("exchanges a code and never puts the token or app secret on a failure object", async () => {
    const calls: string[] = [];
    const provider = new MetaCloudWhatsAppProvider(cfg, {
      async getJson(url) {
        calls.push(url);
        if (url.includes("oauth/access_token")) {
          return { status: 200, json: { access_token: "EAA_real_token_value", expires_in: 0 } };
        }
        throw new Error("unexpected");
      },
    });
    const result = await provider.exchangeAuthorizationCode("auth-code-value");
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.accessToken, "EAA_real_token_value");
    assert.equal(calls[0]?.includes("oauth/access_token"), true);
    assert.equal(calls[0]?.includes("client_secret"), true);
  });

  it("fails closed when the provider omits access_token", async () => {
    const provider = new MetaCloudWhatsAppProvider(cfg, {
      async getJson() {
        return { status: 200, json: { token_type: "bearer" } };
      },
    });
    const result = await provider.exchangeAuthorizationCode("code");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "INVALID_RESPONSE");
      assert.equal(JSON.stringify(result).includes("super-secret-app-value"), false);
      assert.equal(JSON.stringify(result).includes("auth-code"), false);
    }
  });

  it("maps Graph OAuth errors without forwarding the raw payload", async () => {
    const provider = new MetaCloudWhatsAppProvider(cfg, {
      async getJson() {
        return {
          status: 400,
          json: {
            error: {
              message: "Invalid OAuth access token EAA_should_not_leak",
              type: "OAuthException",
              code: 190,
              fbtrace_id: "TRACE123",
            },
          },
        };
      },
    });
    const result = await provider.exchangeAuthorizationCode("code");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "AUTH_FAILED");
      assert.equal(result.providerErrorCode, "graph:190");
      assert.equal(result.fbtraceId, "TRACE123");
      assert.equal(JSON.stringify(result).includes("EAA_should_not_leak"), false);
    }
  });

  it("inspects debug_token granular_scopes for WABA ids", async () => {
    const provider = new MetaCloudWhatsAppProvider(cfg, {
      async getJson(url, headers) {
        assert.equal(url.includes("debug_token"), true);
        assert.equal(headers.Authorization?.startsWith("Bearer 111|"), true);
        return {
          status: 200,
          json: {
            data: {
              is_valid: true,
              app_id: "111",
              expires_at: 0,
              granular_scopes: [
                { scope: "whatsapp_business_management", target_ids: ["123456"] },
              ],
            },
          },
        };
      },
    });
    const result = await provider.inspectGrantedBusinessAccess("input-token");
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.value.wabaIds, ["123456"]);
  });

  it("does not call undocumented register or migrate endpoints while listing phones", async () => {
    const urls: string[] = [];
    const provider = new MetaCloudWhatsAppProvider(cfg, {
      async getJson(url) {
        urls.push(url);
        return {
          status: 200,
          json: {
            data: [
              {
                id: "1001",
                display_phone_number: "971500000000",
                verified_name: "Test",
              },
            ],
          },
        };
      },
    });
    const listed = await provider.listGrantedPhoneNumbers("tok", "123456");
    assert.equal(listed.ok, true);
    assert.equal(urls.some((u) => u.includes("/register")), false);
    assert.equal(urls.some((u) => u.toLowerCase().includes("migrate")), false);
    assert.equal(urls[0]?.includes("/123456/phone_numbers"), true);
  });
});
