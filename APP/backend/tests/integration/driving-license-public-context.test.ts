import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { setDrivingLicenseDocumentAnalysisForTests } from "src/modules/contracts/ocr/driving-license-ocr.adapter";
import {
  createFakeUaeDrivingLicenseApi,
  getFakeUaeDrivingLicenseExtractCallCount,
} from "../helpers/fake-uae-driving-license-api";
import { companyId as testCompanyId } from "tests/helpers/operating-company";
import { imageMultipart, uploadPublicDocument } from "../helpers/public-identity";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "driving licence public context skipped (RUN_INTEGRATION + TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("driving licence public context (B4)", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `dlc-${run}@example.test`, password: "dlc-pass-123" };
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
          vehicleName: `DLC-${plate}`,
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
      const contractId = offer.json().data.id as string;
      const link = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/rental-link`,
        headers: auth(),
      });
      return { token: link.json().data.link.token as string, contractId };
    }

    async function getRental(token: string) {
      return app.inject({ method: "GET", url: `/contracts/rental/${token}` });
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
        where: { key: `dlc_admin_${run}` },
        update: {},
        create: { key: `dlc_admin_${run}`, name: "dlc admin" },
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
          name: "dlc admin",
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

    test("legacy rental loads with null drivingLicenseExtraction", async () => {
      const { token } = await createRentalToken();
      const res = await getRental(token);
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.json().data.drivingLicenseExtraction, null);
    });

    test("upload vs GET parity and no OCR on reload", async () => {
      fake.setAccept();
      const { token } = await createRentalToken();
      const callsBeforeUpload = getFakeUaeDrivingLicenseExtractCallCount();
      const upload = await uploadPublicDocument(app, token, "driving-license", imageMultipart());
      assert.equal(upload.statusCode, 200, upload.body);
      assert.equal(getFakeUaeDrivingLicenseExtractCallCount(), callsBeforeUpload + 1);

      const fromUpload = upload.json().data.drivingLicenseExtraction;
      assert.ok(fromUpload);
      assert.equal(fromUpload.fields.holderNameEn.value, null);
      assert.equal(fromUpload.engineDocumentStatus, "ACCEPT");

      setDrivingLicenseDocumentAnalysisForTests(async () => ({
        ok: false,
        reason: "PROVIDER_UNAVAILABLE",
        provider: "blocked",
      }));

      const reload1 = await getRental(token);
      const reload2 = await getRental(token);
      assert.equal(reload1.statusCode, 200, reload1.body);
      assert.equal(getFakeUaeDrivingLicenseExtractCallCount(), callsBeforeUpload + 1);

      const fromGet = reload1.json().data.drivingLicenseExtraction;
      assert.deepEqual(fromGet, fromUpload);
      assert.deepEqual(reload2.json().data.drivingLicenseExtraction, fromGet);

      setDrivingLicenseDocumentAnalysisForTests(undefined);
    });

    test("EXPIRED verification with engine ACCEPT on extraction", async () => {
      fake.setAccept({
        expiry_date: {
          value: "11-09-2021",
          status: "ACCEPT",
          ocr_eligible: true,
          confidence: 0.9,
          engine: "date_policy",
        },
      });
      const { token } = await createRentalToken();
      const upload = await uploadPublicDocument(app, token, "driving-license", imageMultipart());
      assert.equal(upload.json().data.licenseVerification.status, "EXPIRED");
      assert.equal(upload.json().data.licenseVerification.licenseNumber, "90527");
      assert.equal(upload.json().data.licenseVerification.expiryDate, "2021-09-11");
      assert.equal(upload.json().data.drivingLicenseExtraction.engineDocumentStatus, "ACCEPT");
      assert.equal(upload.json().data.drivingLicenseExtraction.fields.expiryDate.value, "2021-09-11");
    });

    test("REVIEW_REQUIRED partial extraction in context", async () => {
      fake.setReviewRequired();
      const { token } = await createRentalToken();
      const upload = await uploadPublicDocument(app, token, "driving-license", imageMultipart());
      const ext = upload.json().data.drivingLicenseExtraction;
      assert.equal(ext.status, "FAILED");
      assert.equal(ext.engineDocumentStatus, "REVIEW_REQUIRED");
      assert.equal(ext.fields.licenseNumber.value, "90527");
      assert.equal(ext.fields.expiryDate.value, null);
      assert.equal(ext.fields.expiryDate.ocrStatus, "REJECT");
    });

    test("reupload exposes only current extraction B", async () => {
      fake.setAccept({
        license_number: {
          value: "AAA",
          status: "ACCEPT",
          crop_status: "VALUE_OK",
          ocr_eligible: true,
          confidence: 0.9,
          engine: "tesseract",
        },
      });
      const { token, contractId } = await createRentalToken();
      await uploadPublicDocument(app, token, "driving-license", imageMultipart());

      fake.setAccept({
        license_number: {
          value: "BBB",
          status: "ACCEPT",
          crop_status: "VALUE_OK",
          ocr_eligible: true,
          confidence: 0.9,
          engine: "tesseract",
        },
      });
      await uploadPublicDocument(app, token, "driving-license", imageMultipart());

      const ctx = await getRental(token);
      assert.equal(ctx.json().data.drivingLicenseExtraction.fields.licenseNumber.value, "BBB");

      const docs = await prisma.contractDocument.findMany({
        where: { contractId, type: "DRIVING_LICENSE" },
        orderBy: { createdAt: "asc" },
      });
      const oldExtraction = await prisma.drivingLicenseExtraction.findUnique({
        where: { documentId: docs[0]!.id },
      });
      const newExtraction = await prisma.drivingLicenseExtraction.findUnique({
        where: { documentId: docs[1]!.id },
      });
      assert.equal(oldExtraction?.licenseNumber, "AAA");
      assert.equal(newExtraction?.licenseNumber, "BBB");
    });

    test("Customer placeOfIssue separate from OCR extraction", async () => {
      fake.setAccept({
        place_of_issue: {
          value: "HAB",
          status: "ACCEPT",
          ocr_eligible: true,
          confidence: 0.8,
          engine: "tesseract",
        },
      });
      const { token, contractId } = await createRentalToken();
      await uploadPublicDocument(app, token, "driving-license", imageMultipart());
      const customer = await prisma.customer.create({
        data: { name: "Confirmed", drivingLicensePlaceOfIssue: "ABU DHABI" },
      });
      await prisma.contract.update({ where: { id: contractId }, data: { customerId: customer.id } });

      const ctx = await getRental(token);
      assert.equal(ctx.json().data.drivingLicenseExtraction.fields.placeOfIssue.value, null);
      assert.equal(ctx.json().data.customer.drivingLicensePlaceOfIssue, "ABU DHABI");
    });
  });
}
