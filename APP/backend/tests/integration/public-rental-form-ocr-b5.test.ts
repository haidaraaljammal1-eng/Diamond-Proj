import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { setDrivingLicenseDocumentAnalysisForTests } from "src/modules/contracts/ocr/driving-license-ocr.adapter";
import { createFakeUaeDrivingLicenseApi } from "../helpers/fake-uae-driving-license-api";
import { createFakePassportNumberApi } from "../helpers/fake-passport-number-api";
import { companyId as testCompanyId } from "tests/helpers/operating-company";
import { imageMultipart, uploadPublicDocument } from "../helpers/public-identity";
import { formatStoredExpiry } from "src/modules/contracts/driving-license-policy";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("public rental form OCR B5 skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("public rental form OCR confirmed fields (B5)", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `b5-${run}@example.test`, password: "b5-pass-123" };
    let staffToken = "";
    const fake = createFakeUaeDrivingLicenseApi();
    const passportApi = createFakePassportNumberApi();

    const auth = () => ({ authorization: `Bearer ${staffToken}` });

    async function rentalWithLicense() {
      const plate = randomBytes(5).toString("hex").toUpperCase().slice(0, 10);
      const vehicle = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(),
        payload: {
          companyId: await testCompanyId(prisma),
          vehicleName: `B5-${plate}`,
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
      const contractId = offer.json().data.id as string;
      const link = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/rental-link`,
        headers: auth(),
      });
      const token = link.json().data.link.token as string;
      fake.setAccept({
        place_of_issue: { value: "HAB", status: "ACCEPT", ocr_eligible: true, confidence: 0.8, engine: "tesseract" },
        name_en: { value: "OCR NAME", status: "ACCEPT", ocr_eligible: true, confidence: 0.9, engine: "tesseract" },
      });
      await uploadPublicDocument(app, token, "driving-license", imageMultipart());
      await passportApi.install();
      const passport = await uploadPublicDocument(app, token, "passport", imageMultipart());
      assert.equal(passport.statusCode, 200, passport.body);
      await passportApi.clear();
      return { token, contractId };
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
        where: { key: `b5_admin_${run}` },
        update: {},
        create: { key: `b5_admin_${run}`, name: "b5 admin" },
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
          name: "b5 admin",
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
      staffToken = login.json().data.accessToken as string;
    });

    after(async () => {
      await fake.clear();
      await passportApi.clear();
      setDrivingLicenseDocumentAnalysisForTests(undefined);
      await app.close();
    });

    test("form submit persists confirmed metadata; extraction unchanged", async () => {
      const { token, contractId } = await rentalWithLicense();
      const extractionBefore = await prisma.drivingLicenseExtraction.findFirst({
        where: { contractId },
      });
      assert.ok(extractionBefore);
      assert.equal(extractionBefore!.placeOfIssue, null);
      assert.equal(extractionBefore!.holderNameEn, null);

      const form = await app.inject({
        method: "POST",
        url: `/contracts/rental/${token}/form`,
        payload: {
          name: "CORRECT NAME",
          mobile: "+971501112233",
          nationality: "INDIA",
          identityNumber: "7841990123456789",
          dateOfBirth: "1990-05-03",
          drivingLicenseIssueDate: "2020-01-01",
          drivingLicensePlaceOfIssue: "ABU DHABI",
        },
      });
      assert.equal(form.statusCode, 200, form.body);

      const customer = await prisma.customer.findFirst({
        where: { contracts: { some: { id: contractId } } },
      });
      assert.ok(customer);
      assert.equal(customer!.name, "CORRECT NAME");
      assert.equal(formatStoredExpiry(customer!.dateOfBirth), "1990-05-03");
      assert.equal(formatStoredExpiry(customer!.drivingLicenseIssueDate), "2020-01-01");
      assert.equal(customer!.drivingLicensePlaceOfIssue, "ABU DHABI");

      const extractionAfter = await prisma.drivingLicenseExtraction.findUnique({
        where: { id: extractionBefore!.id },
      });
      assert.equal(extractionAfter!.placeOfIssue, null);
      assert.equal(extractionAfter!.holderNameEn, null);

      const ctx = await app.inject({ method: "GET", url: `/contracts/rental/${token}` });
      assert.equal(ctx.json().data.customer.drivingLicensePlaceOfIssue, "ABU DHABI");
      assert.equal(ctx.json().data.drivingLicenseExtraction.fields.placeOfIssue.value, null);
    });
  });
}
