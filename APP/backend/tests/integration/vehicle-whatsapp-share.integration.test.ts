import { test, before, after, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "src/constants/permissions";
import { env } from "src/config/env";
import { generateStorageKey, resolveStoragePath } from "src/lib/files/storage-key";
import { encryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { setWhatsAppProviderForTests } from "src/modules/whatsapp/whatsapp.provider";
import { WHAPI_CAPABILITIES } from "src/modules/whatsapp/whatsapp.capabilities";
import type { WhatsAppProvider } from "src/modules/whatsapp/whatsapp.types";
import { createFakeWhatsAppProvider, TEST_WHATSAPP_TOKEN } from "tests/helpers/fake-whatsapp-provider";
import { resetWhatsAppTables } from "tests/helpers/whatsapp-reset";
import { seedPaymentUser, login } from "tests/helpers/payment-integration-helpers";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function seedVehiclePhotos(
  prisma: PrismaClient,
  vehicleId: number,
  userId: number,
  count: number,
): Promise<string[]> {
  await mkdir(path.resolve(env.FILE_STORAGE_DIR), { recursive: true });
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const storageKey = generateStorageKey(`vshare-photo-${vehicleId}-${i}.png`);
    await writeFile(resolveStoragePath(env.FILE_STORAGE_DIR, storageKey), PNG);
    const checksum = createHash("sha256").update(PNG).digest("hex");
    const attachment = await prisma.attachment.create({
      data: {
        originalName: `photo-${i}.png`,
        storageKey,
        mimeType: "image/png",
        size: PNG.length,
        checksum,
        uploadedById: userId,
      },
    });
    const photo = await prisma.vehiclePhoto.create({
      data: {
        vehicleId,
        attachmentId: attachment.id,
        sortOrder: i,
        isPrimary: i === 0,
      },
    });
    ids.push(photo.id);
  }
  return ids;
}

if (!RUN) {
  test("vehicle whatsapp share skipped (RUN_INTEGRATION + TEST_DATABASE_URL)", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
  process.env.SCHEDULER_ENABLED = "false";

  describe("vehicle gallery WhatsApp share", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = `VWS${Date.now().toString(36).toUpperCase()}`;
    let fakeWa: ReturnType<typeof createFakeWhatsAppProvider>;
    let token = "";
    let readOnlyToken = "";
    let connectionId = "";
    let vehicleId = 0;
    let userId = 0;
    let photoIds: string[] = [];

    before(async () => {
      const { env: loaded } = await import("src/config/env");
      const dbName = new URL(loaded.DATABASE_URL.replace(/^postgres:/, "postgresql:")).pathname.slice(1);
      if (dbName !== "haidara_test") throw new Error(`refusing database ${dbName}`);

      fakeWa = createFakeWhatsAppProvider();
      setWhatsAppProviderForTests({ ...fakeWa.provider, capabilities: () => WHAPI_CAPABILITIES });

      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await resetWhatsAppTables(prisma);

      const email = `vshare-${run}@example.test`;
      const password = "vshare-pass-123";
      userId = await seedPaymentUser(
        prisma,
        email,
        password,
        `role-vshare-${run}`,
        [PERMISSIONS.VEHICLES_READ, PERMISSIONS.WHATSAPP_SEND, PERMISSIONS.WHATSAPP_READ],
      );
      token = await login(app, { email, password });

      const readerEmail = `vshare-read-${run}-${randomUUID()}@example.test`;
      await seedPaymentUser(prisma, readerEmail, password, `role-vshare-read-${run}`, [
        PERMISSIONS.VEHICLES_READ,
      ]);
      readOnlyToken = await login(app, { email: readerEmail, password });

      const connection = await prisma.whatsAppConnection.create({
        data: {
          provider: "WHAPI",
          status: "LINKED",
          providerInstanceId: `vshare-ch-${run}`,
          providerSessionStatus: "AUTHENTICATED",
          credentialCiphertext: encryptWhatsAppCredential(TEST_WHATSAPP_TOKEN),
          connectedAt: new Date(),
          webhookStatus: "ACTIVE",
        },
      });
      connectionId = connection.id;

      const company = await prisma.operatingCompany.findFirstOrThrow();
      const vehicle = await prisma.vehicle.create({
        data: {
          companyId: company.id,
          vehicleName: `Share Test ${run}`,
          plateNumber: `SH${run.slice(-4)}`,
          operationalStatus: "AVAILABLE",
          isActive: true,
        },
      });
      vehicleId = vehicle.id;
      photoIds = await seedVehiclePhotos(prisma, vehicleId, userId, 2);

      await prisma.whatsAppContactProfile.create({
        data: {
          connectionId,
          providerContactId: "971555000111@s.whatsapp.net",
          whapiDisplayName: "Share Target",
          hasProfilePicture: false,
        },
      });
    });

    after(async () => {
      setWhatsAppProviderForTests(undefined);
      await app.close();
    });

    beforeEach(async () => {
      fakeWa = createFakeWhatsAppProvider();
      setWhatsAppProviderForTests({ ...fakeWa.provider, capabilities: () => WHAPI_CAPABILITIES });
      await prisma.whatsAppOutboundAttempt.deleteMany();
      await prisma.whatsAppMessage.deleteMany();
      await prisma.whatsAppConversation.deleteMany();
    });

    test("shares photos to new conversation from contact profile", async () => {
      const idempotencyKey = `batch-${run}-1`;
      const res = await app.inject({
        method: "POST",
        url: `/vehicles/${vehicleId}/share/whatsapp`,
        headers: {
          authorization: `Bearer ${token}`,
          "idempotency-key": idempotencyKey,
        },
        payload: { providerContactId: "971555000111@s.whatsapp.net" },
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { data: { results: { status: string }[]; conversationId: string } };
      assert.equal(body.data.results.length, 2);
      assert.ok(body.data.results.every((r) => r.status === "SENT"));
      assert.equal(fakeWa.mediaSendCount, 2);

      const convo = await prisma.whatsAppConversation.findUniqueOrThrow({
        where: { id: body.data.conversationId },
      });
      assert.equal(convo.kind, "DIRECT");
      assert.equal(convo.customerId, null);

      const messages = await prisma.whatsAppMessage.count({
        where: { conversationId: body.data.conversationId, direction: "OUTBOUND" },
      });
      assert.equal(messages, 2);
      const attempts = await prisma.whatsAppOutboundAttempt.count();
      assert.ok(attempts >= 2);

      const dup = await app.inject({
        method: "POST",
        url: `/vehicles/${vehicleId}/share/whatsapp`,
        headers: {
          authorization: `Bearer ${token}`,
          "idempotency-key": idempotencyKey,
        },
        payload: { providerContactId: "971555000111@s.whatsapp.net" },
      });
      assert.equal(dup.statusCode, 200);
      assert.equal(fakeWa.mediaSendCount, 2);
    });

    test("shares via existing DIRECT conversationId without linking customer", async () => {
      const convo = await prisma.whatsAppConversation.create({
        data: {
          connectionId,
          kind: "DIRECT",
          customerWaId: "971555000111",
          providerChatId: "971555000111@s.whatsapp.net",
          unreadCount: 0,
        },
      });
      const res = await app.inject({
        method: "POST",
        url: `/vehicles/${vehicleId}/share/whatsapp`,
        headers: {
          authorization: `Bearer ${token}`,
          "idempotency-key": `batch-${run}-convo`,
        },
        payload: { conversationId: convo.id },
      });
      assert.equal(res.statusCode, 200);
      const row = await prisma.whatsAppConversation.findUniqueOrThrow({ where: { id: convo.id } });
      assert.equal(row.customerId, null);
      assert.equal(fakeWa.mediaSendCount, 2);
    });

    test("sends up to four photos in gallery order", async () => {
      const company = await prisma.operatingCompany.findFirstOrThrow();
      const four = await prisma.vehicle.create({
        data: {
          companyId: company.id,
          vehicleName: `Four ${run}`,
          plateNumber: `F4${run.slice(-3)}`,
          operationalStatus: "AVAILABLE",
          isActive: true,
        },
      });
      const fourIds = await seedVehiclePhotos(prisma, four.id, userId, 4);
      fakeWa.setOutboundDelayMs(15);
      const started = Date.now();
      const res = await app.inject({
        method: "POST",
        url: `/vehicles/${four.id}/share/whatsapp`,
        headers: {
          authorization: `Bearer ${token}`,
          "idempotency-key": `batch-${run}-four`,
        },
        payload: { providerContactId: "971555000111@s.whatsapp.net" },
      });
      const elapsed = Date.now() - started;
      assert.equal(res.statusCode, 200);
      const body = res.json() as { data: { results: { photoId: string; status: string }[] } };
      assert.equal(body.data.results.length, 4);
      assert.deepEqual(
        body.data.results.map((r) => r.photoId),
        fourIds,
      );
      assert.equal(fakeWa.mediaSendCount, 4);
      assert.ok(elapsed >= 45, "sequential sends should not complete faster than per-photo delay sum");
    });

    test("rejects empty gallery", async () => {
      const company = await prisma.operatingCompany.findFirstOrThrow();
      const empty = await prisma.vehicle.create({
        data: {
          companyId: company.id,
          vehicleName: `Empty ${run}`,
          plateNumber: `EM${run.slice(-3)}`,
          operationalStatus: "AVAILABLE",
          isActive: true,
        },
      });
      const res = await app.inject({
        method: "POST",
        url: `/vehicles/${empty.id}/share/whatsapp`,
        headers: {
          authorization: `Bearer ${token}`,
          "idempotency-key": `batch-${run}-empty`,
        },
        payload: { providerContactId: "971555000111@s.whatsapp.net" },
      });
      assert.equal(res.statusCode, 422);
      assert.equal(fakeWa.mediaSendCount, 0);
    });

    test("rejects wrong vehicle photo id", async () => {
      const convo = await prisma.whatsAppConversation.create({
        data: {
          connectionId,
          kind: "DIRECT",
          customerWaId: "971555000222",
          unreadCount: 0,
        },
      });
      const res = await app.inject({
        method: "POST",
        url: `/vehicles/${vehicleId}/share/whatsapp`,
        headers: {
          authorization: `Bearer ${token}`,
          "idempotency-key": `batch-${run}-bad-photo`,
        },
        payload: {
          conversationId: convo.id,
          photoIds: ["00000000-0000-4000-8000-000000000099"],
        },
      });
      assert.equal(res.statusCode, 422);
    });

    test("denies without WHATSAPP_SEND permission", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/vehicles/${vehicleId}/share/whatsapp`,
        headers: {
          authorization: `Bearer ${readOnlyToken}`,
          "idempotency-key": `batch-${run}-forbidden`,
        },
        payload: { providerContactId: "971555000111@s.whatsapp.net" },
      });
      assert.equal(res.statusCode, 403);
      assert.equal(fakeWa.mediaSendCount, 0);
    });

    test("different idempotency keys perform a new provider send batch", async () => {
      await app.inject({
        method: "POST",
        url: `/vehicles/${vehicleId}/share/whatsapp`,
        headers: {
          authorization: `Bearer ${token}`,
          "idempotency-key": `batch-${run}-a`,
        },
        payload: { providerContactId: "971555000111@s.whatsapp.net" },
      });
      assert.equal(fakeWa.mediaSendCount, 2);
      await app.inject({
        method: "POST",
        url: `/vehicles/${vehicleId}/share/whatsapp`,
        headers: {
          authorization: `Bearer ${token}`,
          "idempotency-key": `batch-${run}-b`,
        },
        payload: { providerContactId: "971555000111@s.whatsapp.net" },
      });
      assert.equal(fakeWa.mediaSendCount, 4);
    });

    test("reports partial failure without stopping remaining photos", async () => {
      let mediaAttempts = 0;
      const inner = fakeWa.provider;
      const wrapped: WhatsAppProvider = {
        ...inner,
        capabilities: () => WHAPI_CAPABILITIES,
        async sendMediaMessage(input) {
          mediaAttempts += 1;
          if (mediaAttempts >= 2) {
            return { ok: false as const, code: "SEND_REJECTED" as const };
          }
          return inner.sendMediaMessage(input);
        },
      };
      setWhatsAppProviderForTests(wrapped);

      const res = await app.inject({
        method: "POST",
        url: `/vehicles/${vehicleId}/share/whatsapp`,
        headers: {
          authorization: `Bearer ${token}`,
          "idempotency-key": `batch-${run}-partial`,
        },
        payload: { providerContactId: "971555000111@s.whatsapp.net" },
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { data: { results: { status: string }[] } };
      assert.equal(body.data.results[0]?.status, "SENT");
      assert.equal(body.data.results[1]?.status, "FAILED");
      assert.equal(mediaAttempts, 2);
    });

    test("marks UNCERTAIN provider outcome without duplicate resend on replay", async () => {
      fakeWa.setSendUnknown(true);
      const res = await app.inject({
        method: "POST",
        url: `/vehicles/${vehicleId}/share/whatsapp`,
        headers: {
          authorization: `Bearer ${token}`,
          "idempotency-key": `batch-${run}-unknown`,
        },
        payload: {
          providerContactId: "971555000111@s.whatsapp.net",
          photoIds: [photoIds[0]!],
        },
      });
      assert.equal(res.statusCode, 200);
      const body = res.json() as { data: { results: { status: string }[] } };
      assert.equal(body.data.results.length, 1);
      assert.equal(body.data.results[0]?.status, "UNCERTAIN");
      const afterUnknown = fakeWa.mediaSendCount;

      const replay = await app.inject({
        method: "POST",
        url: `/vehicles/${vehicleId}/share/whatsapp`,
        headers: {
          authorization: `Bearer ${token}`,
          "idempotency-key": `batch-${run}-unknown`,
        },
        payload: {
          providerContactId: "971555000111@s.whatsapp.net",
          photoIds: [photoIds[0]!],
        },
      });
      assert.equal(replay.statusCode, 200);
      assert.equal(fakeWa.mediaSendCount, afterUnknown);
    });
  });
}
