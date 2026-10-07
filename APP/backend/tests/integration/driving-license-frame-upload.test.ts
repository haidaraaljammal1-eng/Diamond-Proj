import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { env } from "src/config/env";
import { resolveStoragePath } from "src/lib/files/storage-key";
import { setDrivingLicenseDocumentAnalysisForTests } from "src/modules/contracts/ocr/driving-license-ocr.adapter";
import { companyId as testCompanyId } from "tests/helpers/operating-company";
import { createMinimalRgbPng } from "../helpers/minimal-png";
import { imageMultipart, uploadPublicDocument } from "../helpers/public-identity";
import { createFakeUaeDrivingLicenseApi } from "../helpers/fake-uae-driving-license-api";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "driving licence frame upload skipped (RUN_INTEGRATION + TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("driving licence frame upload (D-LICENSE-FRAME-1)", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `dlf-${run}@example.test`, password: "dlf-pass-123" };
    let staffToken = "";
    const fake = createFakeUaeDrivingLicenseApi();

    const auth = () => ({ authorization: `Bearer ${staffToken}` });

    async function createRentalToken() {
      const plate = randomBytes(5).toString("hex").toUpperCase().slice(0, 10);
      const vehicle = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(),
        payload: {
          companyId: await testCompanyId(prisma),
          vehicleName: `DLF-${plate}`,
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
      return { token: link.json().data.link.token as string, contractId: offer.json().data.id as string };
    }

    before(async () => {
      setDrivingLicenseDocumentAnalysisForTests(undefined);
      await fake.install();
      const { buildApp } = await import("src/app");
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      app = await buildApp();
      prisma = app.prisma;
      const email = normalizeEmail(admin.email);
      const role = await prisma.role.upsert({
        where: { key: `dlf_admin_${run}` },
        update: {},
        create: { key: `dlf_admin_${run}`, name: "dlf admin" },
      });
      for (const key of ["vehicles.read", "vehicles.manage", "contracts.read", "contracts.manage"]) {
        const perm = await prisma.permission.upsert({
          where: { key },
          update: {},
          create: { key, category: key.split(".")[0]!, description: key },
        });
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          update: {},
          create: { roleId: role.id, permissionId: perm.id },
        });
      }
      const user = await prisma.user.upsert({
        where: { email },
        update: { status: "ACTIVE", passwordHash: await hashPassword(admin.password) },
        create: {
          email,
          name: "dlf admin",
          status: "ACTIVE",
          passwordHash: await hashPassword(admin.password),
        },
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
      const login = await app.inject({ method: "POST", url: "/auth/login", payload: admin });
      assert.equal(login.statusCode, 200, login.body);
      staffToken = login.json().data.accessToken as string;
    });

    after(async () => {
      await fake.clear();
      setDrivingLicenseDocumentAnalysisForTests(undefined);
      await app.close();
    });

    test("multipart bytes are stored unchanged (no re-encode)", async () => {
      fake.setAccept();
      const { token, contractId } = await createRentalToken();
      const png = createMinimalRgbPng(640, 400);
      const res = await uploadPublicDocument(
        app,
        token,
        "driving-license",
        imageMultipart("license.png", "image/png", png),
      );
      assert.equal(res.statusCode, 200, res.body);
      const doc = await prisma.contractDocument.findFirst({
        where: { contractId, type: "DRIVING_LICENSE", supersededAt: null },
        include: { attachment: true },
      });
      assert.ok(doc?.attachment);
      const stored = await readFile(
        resolveStoragePath(env.FILE_STORAGE_DIR, doc.attachment.storageKey),
      );
      assert.deepEqual(stored, png);
      assert.equal(doc.attachment.mimeType, "image/png");
      assert.equal(doc.attachment.size, png.length);
    });

    test("engine geometry failure surfaces BAD_FRAME unreadableReason", async () => {
      fake.setError("LICENSE_OCR_CROP_FAILED");
      const { token } = await createRentalToken();
      const res = await uploadPublicDocument(app, token, "driving-license", imageMultipart());
      assert.equal(res.statusCode, 200, res.body);
      const lv = res.json().data.licenseVerification;
      assert.equal(lv.status, "UNREADABLE");
      assert.equal(lv.unreadableReason, "BAD_FRAME");
      assert.equal(res.json().data.drivingLicenseExtraction?.status, "FAILED");
    });
  });
}
