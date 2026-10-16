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

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("public rental renter edit marker skipped", { skip: true });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("public rental renter review edit marker", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `rem-${run}@example.test`, password: "rem-pass-123" };
    let staffToken = "";
    const fake = createFakeUaeDrivingLicenseApi();
    const passportApi = createFakePassportNumberApi();

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
        where: { key: `rem_admin_${run}` },
        update: {},
        create: { key: `rem_admin_${run}`, name: "rem admin" },
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
          name: "rem admin",
          status: "ACTIVE",
          passwordHash: await hashPassword(admin.password),
        },
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
      const systemAdmin = await prisma.role.findUnique({ where: { key: "system_admin" } });
      assert.ok(systemAdmin, "seeded system_admin role required");
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: systemAdmin.id } },
        update: {},
        create: { userId: user.id, roleId: systemAdmin.id },
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

    async function rentalToken() {
      const plate = randomBytes(5).toString("hex").toUpperCase().slice(0, 10);
      const vehicle = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(),
        payload: {
          companyId: await testCompanyId(prisma),
          vehicleName: `REM-${plate}`,
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
      await uploadPublicDocument(app, token, "driving-license", imageMultipart());
      await passportApi.install();
      await uploadPublicDocument(app, token, "passport", imageMultipart());
      await passportApi.clear();
      return { token, contractId };
    }

    test("marker null until edit opened; idempotent on repeat clicks", async () => {
      const { token, contractId } = await rentalToken();
      const before = await prisma.contract.findUnique({ where: { id: contractId } });
      assert.equal(before!.renterDataEditedAt, null);

      const staffBefore = await app.inject({
        method: "GET",
        url: `/contracts/${contractId}`,
        headers: auth(),
      });
      assert.equal(staffBefore.statusCode, 200, staffBefore.body);
      assert.equal(staffBefore.json().data.renterDataEditedAt, null);

      const first = await app.inject({
        method: "POST",
        url: `/contracts/rental/${token}/renter-review/edit-opened`,
      });
      assert.equal(first.statusCode, 200, first.body);
      const firstAt = new Date(first.json().data.renterDataEditedAt as string);

      const second = await app.inject({
        method: "POST",
        url: `/contracts/rental/${token}/renter-review/edit-opened`,
      });
      assert.equal(second.statusCode, 200, second.body);
      assert.equal(second.json().data.renterDataEditedAt, first.json().data.renterDataEditedAt);

      const row = await prisma.contract.findUnique({ where: { id: contractId } });
      assert.ok(row!.renterDataEditedAt);
      assert.equal(row!.renterDataEditedAt!.toISOString(), firstAt.toISOString());
      assert.equal(row!.status, "AWAITING");

      const staffAfter = await app.inject({
        method: "GET",
        url: `/contracts/${contractId}`,
        headers: auth(),
      });
      assert.ok(staffAfter.json().data.renterDataEditedAt);
    });
  });
}
