import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { encryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { whapiWebhookSecretHeaderName } from "src/modules/whatsapp/whapi.config";
import { cleanupExpiredWhatsAppMedia } from "src/modules/whatsapp/whatsapp.media-retention";
import {
  WHATSAPP_MEDIA_RETENTION_MS,
  readMediaStore,
  resolveStoredMediaPath,
  writeStoredMedia,
} from "src/modules/whatsapp/whatsapp.media-store";
import { resetWhatsAppTables } from "../helpers/whatsapp-reset";

const RUN = process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);
const CALLBACK = "test-whapi-callback-key-12345678";
const SECRET = "test-whapi-webhook-secret-value";
const CHANNEL = "chan-integration-1";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

if (!RUN) {
  test("whatsapp media retention skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.WHATSAPP_PROVIDER = "WHAPI";
  process.env.WHAPI_TOKEN = "integration-test-token";
  process.env.WHAPI_API_URL = "https://gate.whapi.cloud";
  process.env.WHAPI_WEBHOOK_SECRET = SECRET;
  process.env.WHAPI_WEBHOOK_CALLBACK_KEY = CALLBACK;
  process.env.WHAPI_CHANNEL_ID = CHANNEL;

  describe("Whapi media retention", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    let root = "";

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("media tests require haidara_test");
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await resetWhatsAppTables(prisma);
      root = await mkdtemp(path.join(tmpdir(), "diamond-wa-int-"));
      const connection = await prisma.whatsAppConnection.create({
        data: {
          provider: "WHAPI",
          status: "LINKED",
          providerInstanceId: CHANNEL,
          providerSessionStatus: "AUTHENTICATED",
          credentialCiphertext: encryptWhatsAppCredential("whapi-token"),
          webhookCallbackCiphertext: encryptWhatsAppCredential(CALLBACK),
        },
      });
      const conversation = await prisma.whatsAppConversation.create({
        data: { connectionId: connection.id, customerWaId: "971500000099", providerChatId: "971500000099@s.whatsapp.net" },
      });
      const stored = await writeStoredMedia(root, PNG);
      const ingested = new Date("2026-10-01T00:00:00.000Z");
      await prisma.whatsAppMessage.create({
        data: {
          conversationId: conversation.id,
          connectionId: connection.id,
          direction: "INBOUND",
          messageType: "IMAGE",
          textBody: null,
          caption: "gate photo",
          providerMediaId: "jpeg-b487668896662779cbdb29a3c29c0a9a-804713c25d2b57",
          providerMessageId: "msg-image-1",
          receivedAt: ingested,
          displayPayload: {
            mediaStore: {
              v: 1,
              key: stored.key,
              sha256: stored.sha256,
              bytes: PNG.length,
              ingestedAt: ingested.toISOString(),
              expiresAt: new Date(ingested.getTime() + WHATSAPP_MEDIA_RETENTION_MS).toISOString(),
              voice: false,
            },
          },
        },
      });
    });

    after(async () => {
      await rm(root, { recursive: true, force: true });
      await app.close();
    });

    test("stores the inbound media id once", async () => {
      const body = {
        channel_id: CHANNEL,
        messages: [
          {
            id: "msg-image-live",
            from_me: false,
            type: "image",
            chat_id: "971500000088@s.whatsapp.net",
            timestamp: 1_700_000_100,
            image: {
              id: "jpeg-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbb",
              mime_type: "image/jpeg",
              caption: "arrival",
            },
          },
        ],
      };
      const headers = {
        "content-type": "application/json",
        [whapiWebhookSecretHeaderName()]: SECRET,
      };
      const first = await app.inject({
        method: "POST",
        url: `/whatsapp/webhooks/whapi/${CALLBACK}`,
        headers,
        payload: Buffer.from(JSON.stringify(body)),
      });
      const second = await app.inject({
        method: "POST",
        url: `/whatsapp/webhooks/whapi/${CALLBACK}`,
        headers,
        payload: Buffer.from(JSON.stringify(body)),
      });
      assert.equal(first.statusCode, 200);
      assert.equal(second.statusCode, 200);
      const rows = await prisma.whatsAppMessage.findMany({
        where: { providerMessageId: "msg-image-live" },
      });
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.providerMediaId, "jpeg-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbb");
      assert.equal(rows[0]?.caption, "arrival");
    });

    test("deletes the shared file after 168 hours and keeps the message", async () => {
      const before = await prisma.whatsAppMessage.findFirstOrThrow({
        where: { providerMessageId: "msg-image-1" },
      });
      const store = readMediaStore(before.displayPayload);
      assert.ok(store?.key);
      const file = resolveStoredMediaPath(root, store.key);
      assert.equal((await stat(file)).isFile(), true);
      const expiredAt = new Date(Date.parse(store.expiresAt) + 1);
      const result = await cleanupExpiredWhatsAppMedia(prisma, expiredAt, root);
      assert.equal(result.expired, 1);
      await assert.rejects(() => stat(file));
      const after = await prisma.whatsAppMessage.findUniqueOrThrow({ where: { id: before.id } });
      assert.equal(after.caption, "gate photo");
      assert.equal(after.providerMediaId, before.providerMediaId);
      const cleared = readMediaStore(after.displayPayload);
      assert.equal(cleared?.expired, true);
      assert.equal(cleared?.key, "");
      const again = await cleanupExpiredWhatsAppMedia(prisma, expiredAt, root);
      assert.equal(again.expired, 0);
    });
  });
}
