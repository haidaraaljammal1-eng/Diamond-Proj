import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { setDrivingLicenseDocumentAnalysisForTests } from "src/modules/contracts/ocr/driving-license-ocr.adapter";
import { createFakeUaeDrivingLicenseApi } from "../helpers/fake-uae-driving-license-api";
import { companyId as testCompanyId } from "tests/helpers/operating-company";
import { imageMultipart, uploadPublicDocument } from "../helpers/public-identity";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "driving licence engine bridge integration skipped (RUN_INTEGRATION + TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("driving licence engine HTTP bridge", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `dlb-${run}@example.test`, password: "dlb-pass-123" };
    let staffToken = "";
    const fake = createFakeUaeDrivingLicenseApi();

    const auth = () => ({ authorization: `Bearer ${staffToken}` });

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
        where: { key: `dlb_admin_${run}` },
        update: {},
        create: { key: `dlb_admin_${run}`, name: "dlb admin" },
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
          name: "dlb admin",
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

    test("POST /contracts/rental/:token/driving-license uses licence engine client", async () => {
      const plate = `D${run}`.slice(0, 10);
      const vehicle = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(),
        payload: {
          companyId: await testCompanyId(prisma),
          vehicleName: `DLB-${plate}`,
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
      const rentalToken = link.json().data.link.token as string;
      const res = await uploadPublicDocument(app, rentalToken, "driving-license", imageMultipart());
      assert.equal(res.statusCode, 200, res.body);
      const lv = res.json().data.licenseVerification;
      assert.equal(lv.status, "VALID");
      assert.equal(lv.licenseNumber, "90527");
      const ext = res.json().data.drivingLicenseExtraction;
      assert.equal(ext.engineDocumentStatus, "ACCEPT");
      assert.equal(ext.fields.holderNameEn.value, null);
    });
  });
}
