import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { sendProviderReadReceiptsBestEffort } from "src/modules/whatsapp/whatsapp.provider-read-receipt";
import {
  createWhatsAppProvider,
  setWhatsAppProviderForTests,
} from "src/modules/whatsapp/whatsapp.provider";
import {
  WHAPI_CAPABILITIES,
  META_CLOUD_CAPABILITIES,
  ULTRAMSG_CAPABILITIES,
} from "src/modules/whatsapp/whatsapp.capabilities";
import type { WhatsAppProvider } from "src/modules/whatsapp/whatsapp.types";
import { encryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";

function createMockPrisma(input: {
  messages: { providerMessageId: string | null }[];
  credential: string;
}) {
  return {
    whatsAppConnection: {
      findUnique: async () => ({ credentialCiphertext: input.credential }),
    },
    whatsAppMessage: {
      findMany: async () => input.messages,
    },
  } as unknown as import("@prisma/client").PrismaClient;
}

describe("provider read receipts", () => {
  afterEach(() => setWhatsAppProviderForTests(undefined));

  it("calls WHAPI mark read for inbound provider ids only", async () => {
    const marked: string[] = [];
    const mock: WhatsAppProvider = {
      name: "whapi",
      configured: true,
      capabilities: () => WHAPI_CAPABILITIES,
      markProviderMessageRead: async (_token, id) => {
        marked.push(id);
        return { ok: true, value: { success: true } };
      },
      getSession: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getInstanceIdentity: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getInstanceSettings: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getQr: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      applyWebhookSettings: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      sendOutboundMedia: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      exchangeAuthorizationCode: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      inspectGrantedBusinessAccess: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      listGrantedWhatsAppBusinessAccounts: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      listGrantedPhoneNumbers: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      validatePhoneNumberAccess: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      validateCredential: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      subscribeWaba: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getWebhookSubscriptionStatus: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      sendTextMessage: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      listMessageTemplates: async () => ({ ok: true, value: [] }),
      sendTemplateMessage: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getMediaMetadata: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      downloadMedia: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      uploadMedia: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      sendMediaMessage: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
    };
    setWhatsAppProviderForTests(mock);
    const prisma = createMockPrisma({
      credential: encryptWhatsAppCredential("token"),
      messages: [{ providerMessageId: "in-1" }, { providerMessageId: null }],
    });
    await sendProviderReadReceiptsBestEffort(prisma, {
      conversationId: "c1",
      connectionId: "conn-1",
      previousUnreadCount: 2,
      readBeforeAt: null,
    });
    assert.deepEqual(marked, ["in-1"]);
  });

  it("skips provider calls when unread was already zero", async () => {
    let called = false;
    const mock: WhatsAppProvider = {
      name: "whapi",
      configured: true,
      capabilities: () => WHAPI_CAPABILITIES,
      markProviderMessageRead: async () => {
        called = true;
        return { ok: true, value: { success: true } };
      },
      getSession: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getInstanceIdentity: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getInstanceSettings: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getQr: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      applyWebhookSettings: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      sendOutboundMedia: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      exchangeAuthorizationCode: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      inspectGrantedBusinessAccess: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      listGrantedWhatsAppBusinessAccounts: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      listGrantedPhoneNumbers: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      validatePhoneNumberAccess: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      validateCredential: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      subscribeWaba: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getWebhookSubscriptionStatus: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      sendTextMessage: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      listMessageTemplates: async () => ({ ok: true, value: [] }),
      sendTemplateMessage: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getMediaMetadata: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      downloadMedia: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      uploadMedia: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      sendMediaMessage: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
    };
    setWhatsAppProviderForTests(mock);
    const prisma = createMockPrisma({
      credential: encryptWhatsAppCredential("token"),
      messages: [{ providerMessageId: "in-1" }],
    });
    await sendProviderReadReceiptsBestEffort(prisma, {
      conversationId: "c1",
      connectionId: "conn-1",
      previousUnreadCount: 0,
      readBeforeAt: new Date(),
    });
    assert.equal(called, false);
  });

  it("UltraMsg does not advertise provider read receipts", () => {
    assert.equal(ULTRAMSG_CAPABILITIES.supportsProviderReadReceipt, false);
  });

  it("does not call provider when read receipts unsupported", async () => {
    let called = false;
    const mock: WhatsAppProvider = {
      name: "meta",
      configured: true,
      capabilities: () => META_CLOUD_CAPABILITIES,
      markProviderMessageRead: async () => {
        called = true;
        return { ok: true, value: { success: true } };
      },
      getSession: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getInstanceIdentity: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getInstanceSettings: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getQr: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      applyWebhookSettings: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      sendOutboundMedia: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      exchangeAuthorizationCode: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      inspectGrantedBusinessAccess: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      listGrantedWhatsAppBusinessAccounts: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      listGrantedPhoneNumbers: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      validatePhoneNumberAccess: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      validateCredential: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      subscribeWaba: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getWebhookSubscriptionStatus: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      sendTextMessage: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      listMessageTemplates: async () => ({ ok: true, value: [] }),
      sendTemplateMessage: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      getMediaMetadata: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      downloadMedia: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      uploadMedia: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
      sendMediaMessage: async () => ({ ok: false, code: "NOT_CONFIGURED" }),
    };
    setWhatsAppProviderForTests(mock);
    const prisma = createMockPrisma({
      credential: encryptWhatsAppCredential("token"),
      messages: [{ providerMessageId: "in-1" }],
    });
    await sendProviderReadReceiptsBestEffort(prisma, {
      conversationId: "c1",
      connectionId: "conn-1",
      previousUnreadCount: 1,
      readBeforeAt: null,
    });
    assert.equal(called, false);
  });
});
