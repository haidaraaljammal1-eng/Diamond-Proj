import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { setDrivingLicenseDocumentAnalysisForTests } from "src/modules/contracts/ocr/driving-license-ocr.adapter";
import {
  activeDrivingLicenseExtraction,
  findDrivingLicenseExtractionByDocumentId,
} from "src/modules/contracts/driving-license-extraction.repository";
import { createFakeUaeDrivingLicenseApi } from "../helpers/fake-uae-driving-license-api";
import { companyId as testCompanyId } from "tests/helpers/operating-company";
import { imageMultipart, uploadPublicDocument } from "../helpers/public-identity";
import { formatStoredExpiry } from "src/modules/contracts/driving-license-policy";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "driving licence extraction persistence skipped (RUN_INTEGRATION + TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("driving licence extraction persistence (B3)", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `dle-${run}@example.test`, password: "dle-pass-123" };
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
          vehicleName: `DLE-${plate}`,
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
      await fake.install();
      const { buildApp } = await import("src/app");
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      app = await buildApp();
      prisma = app.prisma;
      const email = normalizeEmail(admin.email);
      const role = await prisma.role.upsert({
        where: { key: `dle_admin_${run}` },
        update: {},
        create: { key: `dle_admin_${run}`, name: "dle admin" },
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
          name: "dle admin",
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

    test("ACCEPT: persists two-field OCR columns, fieldsMeta, does not write Customer", async () => {
      fake.setAccept();
      const { token, contractId } = await createRentalToken();
      const customerBefore = await prisma.customer.findFirst({ where: { contracts: { some: { id: contractId } } } });
      const res = await uploadPublicDocument(app, token, "driving-license", imageMultipart());
      assert.equal(res.statusCode, 200, res.body);

      const doc = await prisma.contractDocument.findFirst({
        where: { contractId, type: "DRIVING_LICENSE", supersededAt: null },
      });
      assert.ok(doc);
      const row = await findDrivingLicenseExtractionByDocumentId(prisma, doc!.id);
      assert.ok(row);
      assert.equal(row!.licenseNumber, "90527");
      assert.equal(row!.holderNameEn, null);
      assert.equal(row!.nationality, null);
      assert.equal(formatStoredExpiry(row!.expiryDate), "2030-01-01");
      assert.equal(row!.dateOfBirth, null);
      assert.equal(row!.issueDate, null);
      assert.equal(row!.placeOfIssue, null);
      assert.equal(row!.engineDocumentStatus, "ACCEPT");
      assert.equal(row!.status, "READY");
      const meta = row!.fieldsMeta as Record<string, { status: string }>;
      assert.equal(meta.license_number?.status, "ACCEPT");

      const verification = await prisma.drivingLicenseVerification.findFirst({
        where: { documentId: doc!.id },
      });
      assert.equal(verification?.extractionId, row!.id);

      const contract = await prisma.contract.findUniqueOrThrow({
        where: { id: contractId },
        include: { customer: true },
      });
      if (customerBefore) {
        assert.equal(contract.customer?.drivingLicensePlaceOfIssue, customerBefore.drivingLicensePlaceOfIssue);
      } else {
        assert.equal(contract.customerId, null);
      }
    });

    test("REVIEW_REQUIRED: partial extraction, verification UNREADABLE", async () => {
      fake.setReviewRequired();
      const { token } = await createRentalToken();
      const res = await uploadPublicDocument(app, token, "driving-license", imageMultipart());
      assert.equal(res.statusCode, 200, res.body);
      const lv = res.json().data.licenseVerification;
      assert.equal(lv.status, "UNREADABLE");

      const doc = await prisma.contractDocument.findFirst({
        where: { type: "DRIVING_LICENSE", supersededAt: null },
        orderBy: { createdAt: "desc" },
      });
      const row = await findDrivingLicenseExtractionByDocumentId(prisma, doc!.id);
      assert.ok(row);
      assert.equal(row!.status, "FAILED");
      assert.equal(row!.engineDocumentStatus, "REVIEW_REQUIRED");
      assert.equal(row!.licenseNumber, "90527");
      assert.equal(row!.expiryDate, null);
      const meta = row!.fieldsMeta as Record<string, { status: string }>;
      assert.equal(meta.expiry_date?.status, "REJECT");
    });

    test("EXPIRED policy vs engine ACCEPT on extraction row", async () => {
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
      const res = await uploadPublicDocument(app, token, "driving-license", imageMultipart());
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.json().data.licenseVerification.status, "EXPIRED");

      const doc = await prisma.contractDocument.findFirst({
        where: { type: "DRIVING_LICENSE", supersededAt: null },
        orderBy: { createdAt: "desc" },
      });
      const row = await findDrivingLicenseExtractionByDocumentId(prisma, doc!.id);
      assert.equal(row!.engineDocumentStatus, "ACCEPT");
      assert.equal(formatStoredExpiry(row!.expiryDate), "2021-09-11");
    });

    test("OCR vs Customer: extraction immutable when customer field updated", async () => {
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
        data: {
          name: "Confirmed User",
          drivingLicensePlaceOfIssue: "ABU DHABI",
        },
      });
      await prisma.contract.update({
        where: { id: contractId },
        data: { customerId: customer.id },
      });
      const active = await activeDrivingLicenseExtraction(prisma, contractId);
      assert.equal(active?.placeOfIssue, null);
      const refreshed = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
      assert.equal(refreshed.drivingLicensePlaceOfIssue, "ABU DHABI");
    });

    test("reupload retains historical extraction and active points to latest", async () => {
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
      const firstDoc = await prisma.contractDocument.findFirst({
        where: { contractId, type: "DRIVING_LICENSE" },
        orderBy: { createdAt: "asc" },
      });
      const firstExtraction = await findDrivingLicenseExtractionByDocumentId(prisma, firstDoc!.id);
      assert.equal(firstExtraction?.licenseNumber, "AAA");

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
      const docs = await prisma.contractDocument.findMany({
        where: { contractId, type: "DRIVING_LICENSE" },
        orderBy: { createdAt: "asc" },
      });
      assert.equal(docs.length, 2);
      assert.ok(docs[0]!.supersededAt);
      assert.equal(docs[1]!.supersededAt, null);

      const oldRow = await findDrivingLicenseExtractionByDocumentId(prisma, docs[0]!.id);
      const newRow = await findDrivingLicenseExtractionByDocumentId(prisma, docs[1]!.id);
      assert.equal(oldRow?.licenseNumber, "AAA");
      assert.equal(newRow?.licenseNumber, "BBB");

      const active = await activeDrivingLicenseExtraction(prisma, contractId);
      assert.equal(active?.id, newRow?.id);
    });

    test("provider failure: no extraction row", async () => {
      fake.setError("LICENSE_OCR_UNAVAILABLE");
      const { token, contractId } = await createRentalToken();
      const res = await uploadPublicDocument(app, token, "driving-license", imageMultipart());
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.json().data.licenseVerification.status, "PROVIDER_UNAVAILABLE");
      const count = await prisma.drivingLicenseExtraction.count({ where: { contractId } });
      assert.equal(count, 0);
    });

    test("DB reload: extraction readable without adapter response", async () => {
      fake.setAccept();
      const { token, contractId } = await createRentalToken();
      await uploadPublicDocument(app, token, "driving-license", imageMultipart());
      setDrivingLicenseDocumentAnalysisForTests(async () => ({
        ok: false,
        reason: "PROVIDER_UNAVAILABLE",
        provider: "blocked",
      }));

      const active = await activeDrivingLicenseExtraction(prisma, contractId);
      assert.ok(active);
      assert.equal(active!.holderNameEn, null);
      assert.ok(active!.fieldsMeta);
    });
  });
}
