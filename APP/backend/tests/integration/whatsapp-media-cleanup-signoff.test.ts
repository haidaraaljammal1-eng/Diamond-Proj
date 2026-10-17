import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { runWhatsAppMediaCleanupCycle } from "src/modules/whatsapp/whatsapp.media-cleanup";
import { cleanupExpiredWhatsAppMedia } from "src/modules/whatsapp/whatsapp.media-retention";
import {
  WHATSAPP_MEDIA_RETENTION_MS,
  readMediaStore,
  resolveStoredMediaPath,
} from "src/modules/whatsapp/whatsapp.media-store";
import { resetWhatsAppTables } from "../helpers/whatsapp-reset";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("whatsapp media cleanup signoff skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.SCHEDULER_ENABLED = "false";

  describe("WhatsApp media cleanup signoff", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    let root = "";

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("cleanup signoff requires haidara_test");
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await resetWhatsAppTables(prisma);
      root = await mkdtemp(path.join(tmpdir(), "diamond-wa-cleanup-"));
      const connection = await prisma.whatsAppConnection.create({
        data: {
          provider: "META_CLOUD_API",
          status: "LINKED",
          providerInstanceId: "cleanup-signoff",
          providerSessionStatus: "AUTHENTICATED",
          credentialCiphertext: "test",
          webhookCallbackCiphertext: "test",
        },
      });
      const conversation = await prisma.whatsAppConversation.create({
        data: {
          connectionId: connection.id,
          customerWaId: "971500000001",
          providerChatId: "971500000001@s.whatsapp.net",
        },
      });
      const ingested = new Date("2026-09-01T00:00:00.000Z");
      const expiredAt = new Date(ingested.getTime() + WHATSAPP_MEDIA_RETENTION_MS + 1);
      const notExpiredAt = new Date();
      for (let i = 0; i < 250; i += 1) {
        const id = randomUUID();
        const key = `${id.slice(0, 2)}/${id.slice(2, 4)}/${id}`;
        const full = resolveStoredMediaPath(root, key);
        await mkdir(path.dirname(full), { recursive: true });
        await writeFile(full, Buffer.from([i]));
        const isExpired = i < 200;
        await prisma.whatsAppMessage.create({
          data: {
            conversationId: conversation.id,
            connectionId: connection.id,
            direction: "INBOUND",
            messageType: "IMAGE",
            providerMessageId: `cleanup-${i}`,
            receivedAt: isExpired ? ingested : notExpiredAt,
            displayPayload: {
              mediaStore: {
                v: 1,
                key,
                sha256: "abc",
                bytes: 1,
                ingestedAt: (isExpired ? ingested : notExpiredAt).toISOString(),
                expiresAt: (isExpired ? expiredAt : new Date(notExpiredAt.getTime() + WHATSAPP_MEDIA_RETENTION_MS)).toISOString(),
                voice: false,
              },
            },
          },
        });
      }
    });

    after(async () => {
      await rm(root, { recursive: true, force: true });
      await app.close();
    });

    test("does not delete media before 168 hours", async () => {
      const before = await prisma.whatsAppMessage.count({
        where: { providerMessageId: { startsWith: "cleanup-" } },
      });
      assert.equal(before, 250);
      const early = await cleanupExpiredWhatsAppMedia(
        prisma,
        new Date("2026-09-01T00:00:00.000Z"),
        root,
      );
      assert.equal(early.expired, 0);
    });

    test("drains expired backlog across batches without touching unexpired rows", async () => {
      const expiredAt = new Date("2026-09-08T00:00:01.000Z");
      const first = await runWhatsAppMediaCleanupCycle(prisma, undefined, expiredAt, root);
      assert.equal(first.skipped, false);
      assert.equal(first.expired, 200);
      const second = await runWhatsAppMediaCleanupCycle(prisma, undefined, expiredAt, root);
      assert.equal(second.expired, 0);
      const remaining = await prisma.whatsAppMessage.findMany({
        where: { providerMessageId: { startsWith: "cleanup-" } },
      });
      const expiredRows = remaining.filter((row) => readMediaStore(row.displayPayload)?.expired);
      const freshRows = remaining.filter((row) => !readMediaStore(row.displayPayload)?.expired);
      assert.equal(expiredRows.length, 200);
      assert.equal(freshRows.length, 50);
      for (const row of freshRows) {
        const store = readMediaStore(row.displayPayload);
        assert.ok(store?.key);
        const file = resolveStoredMediaPath(root, store.key);
        await import("node:fs/promises").then((fs) => fs.stat(file));
      }
    });
  });
}
