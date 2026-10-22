import { test, before, beforeEach, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { resolveFleetShareWhatsAppConversation } from "src/modules/vehicles/vehicle-whatsapp-share-recipient";
import { encryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { TEST_WHATSAPP_TOKEN } from "tests/helpers/fake-whatsapp-provider";
import { resetWhatsAppTables } from "tests/helpers/whatsapp-reset";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("vehicle whatsapp share recipient skipped (RUN_INTEGRATION + TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.SCHEDULER_ENABLED = "false";

  describe("resolveFleetShareWhatsAppConversation", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    let connectionId = "";

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("recipient unit tests require haidara_test");
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
    });

    after(async () => {
      await resetWhatsAppTables(prisma);
      await app.close();
    });

    beforeEach(async () => {
      await resetWhatsAppTables(prisma);
      const connection = await prisma.whatsAppConnection.create({
        data: {
          provider: "WHAPI",
          status: "LINKED",
          providerInstanceId: `vshare-unit-${Date.now()}-${Math.random()}`,
          providerSessionStatus: "AUTHENTICATED",
          credentialCiphertext: encryptWhatsAppCredential(TEST_WHATSAPP_TOKEN),
          connectedAt: new Date(),
          webhookStatus: "ACTIVE",
        },
      });
      connectionId = connection.id;
    });

    test("creates unlinked DIRECT conversation from synced contact profile", async () => {
      const providerContactId = "971500000001@s.whatsapp.net";
      await prisma.whatsAppContactProfile.create({
        data: {
          connectionId,
          providerContactId,
          whapiDisplayName: "Fleet Buyer",
          hasProfilePicture: false,
        },
      });

      const { conversationId } = await resolveFleetShareWhatsAppConversation(prisma, {
        connectionId,
        providerContactId,
      });

      const row = await prisma.whatsAppConversation.findUniqueOrThrow({
        where: { id: conversationId },
      });
      assert.equal(row.kind, "DIRECT");
      assert.equal(row.customerId, null);
      assert.equal(row.customerWaId, "971500000001");
      assert.equal(row.providerChatId, providerContactId);
    });

    test("reuses existing DIRECT conversation by conversationId", async () => {
      const convo = await prisma.whatsAppConversation.create({
        data: {
          connectionId,
          kind: "DIRECT",
          customerWaId: "971500000002",
          providerChatId: "971500000002@s.whatsapp.net",
          unreadCount: 0,
        },
      });
      const { conversationId } = await resolveFleetShareWhatsAppConversation(prisma, {
        connectionId,
        conversationId: convo.id,
      });
      assert.equal(conversationId, convo.id);
    });

    test("rejects GROUP conversation by conversationId", async () => {
      const group = await prisma.whatsAppConversation.create({
        data: {
          connectionId,
          kind: "GROUP",
          customerWaId: "120363000000000000@g.us",
          providerChatId: "120363000000000000@g.us",
          unreadCount: 0,
        },
      });
      await assert.rejects(
        () =>
          resolveFleetShareWhatsAppConversation(prisma, {
            connectionId,
            conversationId: group.id,
          }),
        /not eligible/i,
      );
    });

    test("rejects ambiguous duplicate DIRECT matches for contact", async () => {
      const providerContactId = "971500000003@s.whatsapp.net";
      await prisma.whatsAppContactProfile.create({
        data: {
          connectionId,
          providerContactId,
          whapiDisplayName: "Dup",
          hasProfilePicture: false,
        },
      });
      await prisma.whatsAppConversation.createMany({
        data: [
          {
            connectionId,
            kind: "DIRECT",
            customerWaId: "971500000003",
            providerChatId: providerContactId,
            unreadCount: 0,
          },
          {
            connectionId,
            kind: "DIRECT",
            customerWaId: "971500000304",
            providerChatId: providerContactId,
            unreadCount: 0,
          },
        ],
      });
      await assert.rejects(
        () =>
          resolveFleetShareWhatsAppConversation(prisma, {
            connectionId,
            providerContactId,
          }),
        /ambiguous/i,
      );
    });

    test("rejects contact without synced profile", async () => {
      await assert.rejects(
        () =>
          resolveFleetShareWhatsAppConversation(prisma, {
            connectionId,
            providerContactId: "971500000099@s.whatsapp.net",
          }),
        /not eligible/i,
      );
    });

    test("rejects both conversationId and providerContactId", async () => {
      await assert.rejects(
        () =>
          resolveFleetShareWhatsAppConversation(prisma, {
            connectionId,
            conversationId: "00000000-0000-4000-8000-000000000001",
            providerContactId: "971500000001@s.whatsapp.net",
          }),
        /exactly one/i,
      );
    });
  });
}
