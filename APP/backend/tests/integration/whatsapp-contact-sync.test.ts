import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { resetWhatsAppTables } from "../helpers/whatsapp-reset";
import { encryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import {
  createWhatsAppContactSyncService,
  setWhapiContactsClientForTests,
} from "src/modules/whatsapp/whatsapp.contact-sync.service";
import type { WhapiContactsClient } from "src/modules/whatsapp/whapi.contacts.client";
import { materializeInboundMessage } from "src/modules/whatsapp/whatsapp.inbound.service";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("whatsapp contact sync P3-C skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("Whapi contact sync P3-C", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    let connectionA = "";
    let connectionB = "";
    const phoneChat = "971509998877@s.whatsapp.net";

    before(async () => {
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await resetWhatsAppTables(prisma);
      const a = await prisma.whatsAppConnection.create({
        data: {
          provider: "WHAPI",
          status: "LINKED",
          providerInstanceId: "p3c-a",
          providerSessionStatus: "AUTHENTICATED",
          credentialCiphertext: encryptWhatsAppCredential("token-a"),
          webhookCallbackCiphertext: encryptWhatsAppCredential("cb"),
        },
      });
      const b = await prisma.whatsAppConnection.create({
        data: {
          provider: "WHAPI",
          status: "DISCONNECTED",
          providerInstanceId: "p3c-b",
          credentialCiphertext: encryptWhatsAppCredential("token-b"),
        },
      });
      connectionA = a.id;
      connectionB = b.id;
      await materializeInboundMessage(prisma, {
        connectionId: connectionA,
        customerWaId: "971509998877",
        providerChatId: phoneChat,
        customerDisplayName: "971509998877",
        providerMessageId: "m-contact-1",
        messageType: "TEXT",
        textBody: "hi",
        providerMediaId: null,
        caption: null,
        mediaFilename: null,
        mediaMimeType: null,
        mediaSizeBytes: null,
        displayPayload: {},
        providerOccurredAt: new Date("2026-01-01T00:00:00.000Z"),
        receivedAt: new Date("2026-01-01T00:00:00.000Z"),
      });
    });

    after(async () => {
      setWhapiContactsClientForTests(null);
      await app.close();
    });

    test("paginates contacts and applies names per connection", async () => {
      let offset = 0;
      const client: WhapiContactsClient = {
        async listContacts(count, off) {
          offset = off;
          if (off === 0) {
            return {
              items: [{ id: phoneChat, name: "Whapi Sara" }],
              pageSize: count,
              hasMore: true,
            };
          }
          return { items: [], pageSize: count, hasMore: false };
        },
        async getProfilePicture() {
          return { status: 404, contentType: null, body: Buffer.alloc(0) };
        },
      };
      setWhapiContactsClientForTests(client);
      const sync = createWhatsAppContactSyncService(app);
      assert.equal(await sync.processContactSyncBatch(connectionA), true);
      assert.equal(await sync.processContactSyncBatch(connectionA), false);
      assert.equal(offset, 1);
      const syncState = await prisma.whatsAppContactSyncState.findUniqueOrThrow({
        where: { connectionId: connectionA },
      });
      assert.equal(syncState.contactsOffset, 1);

      const convo = await prisma.whatsAppConversation.findFirstOrThrow({
        where: { connectionId: connectionA },
      });
      assert.equal(convo.customerDisplayName, "Whapi Sara");

      const profile = await prisma.whatsAppContactProfile.findUniqueOrThrow({
        where: { connectionId_providerContactId: { connectionId: connectionA, providerContactId: phoneChat } },
      });
      assert.equal(profile.whapiDisplayName, "Whapi Sara");

      setWhapiContactsClientForTests({
        ...client,
        async listContacts(count, off) {
          if (off === 0) {
            return {
              items: [{ id: phoneChat, name: "Other Connection Name" }],
              pageSize: count,
              hasMore: false,
            };
          }
          return { items: [], pageSize: count, hasMore: false };
        },
      });
      await sync.processContactSyncBatch(connectionB);
      const stillA = await prisma.whatsAppConversation.findFirstOrThrow({
        where: { connectionId: connectionA },
      });
      assert.equal(stillA.customerDisplayName, "Whapi Sara");
    });

    test("does not overwrite display name when customer is linked", async () => {
      const customer = await prisma.customer.create({
        data: {
          name: "Linked Customer",
          mobile: "971509998877",
          externalId: `p3c-contact-sync-${randomUUID()}`,
        },
      });
      const convo = await prisma.whatsAppConversation.findFirstOrThrow({
        where: { connectionId: connectionA },
      });
      await prisma.whatsAppConversation.update({
        where: { id: convo.id },
        data: { customerId: customer.id, customerDisplayName: "Linked Customer" },
      });
      setWhapiContactsClientForTests({
        async listContacts(count, off) {
          if (off > 0) return { items: [], pageSize: count, hasMore: false };
          return {
            items: [{ id: phoneChat, name: "Whapi Override Attempt" }],
            pageSize: count,
            hasMore: false,
          };
        },
        async getProfilePicture() {
          return { status: 404, contentType: null, body: Buffer.alloc(0) };
        },
      });
      const sync = createWhatsAppContactSyncService(app);
      await sync.processContactSyncBatch(connectionA);
      const updated = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: convo.id } });
      assert.equal(updated.customerDisplayName, "Linked Customer");
    });
  });
}
