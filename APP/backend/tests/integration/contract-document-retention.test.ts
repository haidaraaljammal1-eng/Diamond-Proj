import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { access } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { setDrivingLicenseDocumentAnalysisForTests } from "src/modules/contracts/ocr/driving-license-ocr.adapter";
import { createFakeUaeDrivingLicenseApi } from "../helpers/fake-uae-driving-license-api";
import { createFakePassportNumberApi } from "../helpers/fake-passport-number-api";
import { companyId as testCompanyId } from "tests/helpers/operating-company";
import { imageMultipart, uploadPublicDocument } from "../helpers/public-identity";
import { env } from "src/config/env";
import { resolveStoragePath } from "src/lib/files/storage-key";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

if (!RUN) {
  test(
    "contract document retention skipped (RUN_INTEGRATION + TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("contract document image retention", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    let staffToken = "";
    const licenseFake = createFakeUaeDrivingLicenseApi();
    const passportFake = createFakePassportNumberApi();

    const auth = () => ({ authorization: `Bearer ${staffToken}` });

    async function createRentalToken() {
      const plate = randomBytes(5).toString("hex").toUpperCase().slice(0, 10);
      const vehicle = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(),
        payload: {
          companyId: await testCompanyId(prisma),
          vehicleName: `CDR-${plate}`,
          plateNumber: plate,
          dailyRate: 400,
          color: "White",
          modelYear: 2024,
        },
      });
      assert.equal(vehicle.statusCode, 201, vehicle.body);
      const offer = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(),
        payload: {
          vehicleId: vehicle.json().data.id,
          priceType: "DAILY",
          rentalDays: 3,
          agreedAmount: 1200,
          collectionMode: "ELECTRONIC",
        },
      });
      assert.equal(offer.statusCode, 201, offer.body);
      const link = await app.inject({
        method: "POST",
        url: `/contracts/${offer.json().data.id}/rental-link`,
        headers: auth(),
      });
      return {
        token: link.json().data.link.token as string,
        contractId: offer.json().data.id as string,
      };
    }

    before(async () => {
      setDrivingLicenseDocumentAnalysisForTests(undefined);
      await licenseFake.install();
      await passportFake.install();
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: process.env.DEV_ADMIN_EMAIL ?? "admin@diamond.test",
          password: process.env.DEV_ADMIN_PASSWORD ?? "Diamond123!",
        },
      });
      assert.equal(login.statusCode, 200, login.body);
      staffToken = login.json().data.accessToken as string;
    });

    after(async () => {
      await licenseFake.clear();
      await passportFake.clear();
      setDrivingLicenseDocumentAnalysisForTests(undefined);
      await app.close();
    });

    test("license retake keeps one physical file and preserves extraction history", async () => {
      licenseFake.setAccept();
      const { token, contractId } = await createRentalToken();
      const first = await uploadPublicDocument(app, token, "driving-license", imageMultipart());
      assert.equal(first.statusCode, 200, first.body);

      const firstActive = await prisma.contractDocument.findFirst({
        where: { contractId, type: "DRIVING_LICENSE", supersededAt: null },
        include: { attachment: true },
      });
      assert.ok(firstActive?.attachment);
      const firstStorageKey = firstActive.attachment!.storageKey;

      licenseFake.setAccept();
      const second = await uploadPublicDocument(app, token, "driving-license", imageMultipart());
      assert.equal(second.statusCode, 200, second.body);

      const superseded = await prisma.contractDocument.findFirst({
        where: { contractId, type: "DRIVING_LICENSE", supersededAt: { not: null } },
        orderBy: { createdAt: "asc" },
      });
      assert.ok(superseded);
      assert.equal(superseded.attachmentId, null);

      const firstPath = resolveStoragePath(env.FILE_STORAGE_DIR, firstStorageKey);
      assert.equal(await pathExists(firstPath), false);

      const activeAfter = await prisma.contractDocument.findFirst({
        where: { contractId, type: "DRIVING_LICENSE", supersededAt: null },
        include: { attachment: true },
      });
      assert.ok(activeAfter?.attachment);
      const activePath = resolveStoragePath(
        env.FILE_STORAGE_DIR,
        activeAfter.attachment!.storageKey,
      );
      assert.equal(await pathExists(activePath), true);

      const linkedIds = (
        await prisma.contractDocument.findMany({
          where: { contractId, type: "DRIVING_LICENSE" },
          select: { attachmentId: true },
        })
      ).filter((row) => row.attachmentId);
      assert.equal(linkedIds.length, 1);

      const extractions = await prisma.drivingLicenseExtraction.count({ where: { contractId } });
      assert.equal(extractions, 2);
    });

    test("passport retake removes superseded physical file and preview stays available", async () => {
      licenseFake.setAccept();
      passportFake.setPassport({ passportNumber: "P1111111" });
      const { token, contractId } = await createRentalToken();
      await uploadPublicDocument(app, token, "driving-license", imageMultipart());

      await uploadPublicDocument(app, token, "passport", imageMultipart());
      passportFake.setPassport({ passportNumber: "P2222222" });
      const second = await uploadPublicDocument(app, token, "passport", imageMultipart());
      assert.equal(second.statusCode, 200, second.body);

      const active = await prisma.contractDocument.findFirst({
        where: { contractId, type: "PASSPORT", supersededAt: null },
        include: { attachment: true },
      });
      assert.ok(active?.attachment);
      const preview = await app.inject({
        method: "GET",
        url: `/contracts/rental/${token}/passport/preview`,
      });
      assert.equal(preview.statusCode, 200, preview.body);

      const superseded = await prisma.contractDocument.findMany({
        where: { contractId, type: "PASSPORT", supersededAt: { not: null } },
        include: { attachment: true },
      });
      for (const doc of superseded) {
        assert.equal(doc.attachmentId, null);
      }
    });
  });
}
