import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { INSPECTION_ANGLES } from "src/modules/contracts/contracts.constants";
import { setDrivingLicenseOcrProviderForTests } from "src/modules/contracts/ocr/ocr-provider.factory";
import { hashToken } from "src/lib/security/tokens";

/**
 * Contract renewal focused integration. Requires RUN_INTEGRATION=true and
 * TEST_DATABASE_URL pointing at disposable haidara_test — never Development haidara.
 */
const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "contracts renewal integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("contracts renewal", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `rn-admin-${run}@example.test`, password: "rn-admin-pass-123" };
    let token = "";
    let seq = 0;

    const PERMS = [
      "vehicles.read",
      "vehicles.manage",
      "contracts.read",
      "contracts.manage",
      "contracts.activate",
      "contracts.car_out",
      "contracts.return",
      "contracts.reconcile",
      "contracts.close",
      "contracts.renew",
    ];

    const auth = () => ({ authorization: `Bearer ${token}` });

    async function seedUser() {
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      const email = normalizeEmail(admin.email);
      const role = await prisma.role.upsert({
        where: { key: `rn_admin_${run}` },
        update: {},
        create: { key: `rn_admin_${run}`, name: "rn admin" },
      });
      for (const key of PERMS) {
        const perm = await prisma.permission.upsert({
          where: { key },
          update: {},
          create: { key, category: key.split(".")[0], description: key },
        });
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          update: {},
          create: { roleId: role.id, permissionId: perm.id },
        });
      }
      const passwordHash = await hashPassword(admin.password);
      await prisma.user.upsert({
        where: { email },
        update: { status: "ACTIVE", passwordHash },
        create: { email, name: "rn admin", status: "ACTIVE", passwordHash },
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }

    async function login() {
      const res = await app.inject({ method: "POST", url: "/auth/login", payload: admin });
      assert.equal(res.statusCode, 200, res.body);
      token = res.json().data.accessToken;
    }

    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

    async function seedValidLicense(rentalToken: string) {
      setDrivingLicenseOcrProviderForTests({
        name: "test",
        async analyzeDrivingLicense() {
          return {
            ok: true,
            licenseNumber: "DL-RN",
            expiryDate: "2030-01-01",
            confidence: 0.99,
            provider: "test",
          };
        },
      });
      const boundary = "----rnlicense";
      const payload = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="dl.png"\r\nContent-Type: image/png\r\n\r\n`,
        ),
        PNG,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const up = await app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/driving-license`,
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload,
      });
      assert.equal(up.statusCode, 200, up.body);
    }

    async function dummyPhotos() {
      const ids: string[] = [];
      for (let i = 0; i < 8; i++) {
        seq += 1;
        const row = await prisma.attachment.create({
          data: {
            originalName: `rn-${run}-${seq}.png`,
            storageKey: `rn-${run}-${seq}.png`,
            mimeType: "image/png",
            size: 8,
          },
        });
        ids.push(row.id);
      }
      return INSPECTION_ANGLES.map((angle, i) => ({ attachmentId: ids[i]!, angle }));
    }

    async function createActiveContract() {
      seq += 1;
      const vehicleRes = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(),
        payload: { vehicleName: `RN-${run}-${seq}`, plateNumber: `RN ${run}${seq}`, dailyRate: 400 },
      });
      assert.equal(vehicleRes.statusCode, 201, vehicleRes.body);
      const vehicleId = vehicleRes.json().data.id as number;
      const offer = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(),
        payload: {
          vehicleId,
          priceType: "DAILY",
          rentalDays: 3,
          agreedAmount: 1500,
          depositAmount: 500,
        },
      });
      assert.equal(offer.statusCode, 201, offer.body);
      const contractId = offer.json().data.id as string;
      const contractNumber = offer.json().data.contractNumber as string;
      const linkRes = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/rental-link`,
        headers: auth(),
      });
      assert.equal(linkRes.statusCode, 200, linkRes.body);
      const rentalToken = linkRes.json().data.link.token as string;
      await seedValidLicense(rentalToken);
      const form = await app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/form`,
        payload: {
          name: "Renewal Customer",
          mobile: "+971500000009",
          nationality: "AE",
          identityNumber: "784-1990-999",
          drivingLicenseNumber: "FORGED",
        },
      });
      assert.equal(form.statusCode, 200, form.body);
      const accept = await app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/accept`,
        payload: {},
      });
      assert.equal(accept.statusCode, 200, accept.body);
      const pay = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/payment/confirm`,
        headers: auth(),
        payload: { method: "MANUAL" },
      });
      assert.equal(pay.statusCode, 200, pay.body);
      const carOut = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/car-out`,
        headers: auth(),
        payload: { mileageOut: 1000, fuelOut: "F", photos: await dummyPhotos() },
      });
      assert.equal(carOut.statusCode, 200, carOut.body);
      assert.equal(carOut.json().data.status, "ACTIVE");
      return { contractId, contractNumber, vehicleId };
    }

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("renewal integration refuses to run unless DATABASE_URL is haidara_test");
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      await seedUser();
      await login();
    });

    after(async () => {
      setDrivingLicenseOcrProviderForTests(undefined);
      await app.close();
    });

    test("ACTIVE can generate a renewal link; non-ACTIVE cannot", async () => {
      const awaiting = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(),
        payload: { vehicleName: `RN-WAIT-${run}`, plateNumber: `RW ${run}`, dailyRate: 400 },
      });
      assert.equal(awaiting.statusCode, 201, awaiting.body);
      const offer = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(),
        payload: {
          vehicleId: awaiting.json().data.id,
          priceType: "DAILY",
          rentalDays: 2,
          agreedAmount: 800,
        },
      });
      assert.equal(offer.statusCode, 201, offer.body);
      const blocked = await app.inject({
        method: "POST",
        url: `/contracts/${offer.json().data.id}/renewal-link`,
        headers: auth(),
        payload: { additionalDays: 3, additionalAmount: 400 },
      });
      assert.equal(blocked.statusCode, 409, blocked.body);
      assert.equal(blocked.json().error.context.reason, "CONTRACT_INVALID_TRANSITION");

      const { contractId } = await createActiveContract();
      const issued = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/renewal-link`,
        headers: auth(),
        payload: { additionalDays: 5, additionalAmount: 900 },
      });
      assert.equal(issued.statusCode, 200, issued.body);
      assert.equal(issued.json().data.link.type, "RENEWAL");
      const raw = issued.json().data.link.token as string;
      assert.ok(raw.length >= 16);
      const stored = await prisma.contractLink.findMany({ where: { contractId, type: "RENEWAL" } });
      assert.equal(stored.some((row) => row.tokenHash === raw), false);
    });

    test("invalid and expired renewal tokens are rejected", async () => {
      const invalid = await app.inject({
        method: "GET",
        url: "/contracts/renew/not-a-real-token",
      });
      assert.equal(invalid.statusCode, 401);
      assert.equal(invalid.json().error.context.reason, "CONTRACT_LINK_INVALID");

      const { contractId } = await createActiveContract();
      const issued = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/renewal-link`,
        headers: auth(),
        payload: { additionalDays: 2, additionalAmount: 300 },
      });
      const renewToken = issued.json().data.link.token as string;
      await prisma.contractLink.update({
        where: { tokenHash: hashToken(renewToken) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const expired = await app.inject({ method: "GET", url: `/contracts/renew/${renewToken}` });
      assert.equal(expired.statusCode, 401, expired.body);
      assert.equal(expired.json().error.context.reason, "CONTRACT_LINK_EXPIRED");
    });

    test("public confirm applies the stored offer on the same ACTIVE contract", async () => {
      const { contractId, contractNumber, vehicleId } = await createActiveContract();
      const beforeCount = await prisma.contract.count({ where: { vehicleId } });
      const issued = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/renewal-link`,
        headers: auth(),
        payload: { additionalDays: 4, additionalAmount: 700 },
      });
      assert.equal(issued.statusCode, 200, issued.body);
      const renewToken = issued.json().data.link.token as string;

      const preview = await app.inject({ method: "GET", url: `/contracts/renew/${renewToken}` });
      assert.equal(preview.statusCode, 200, preview.body);
      assert.equal(preview.json().data.status, "ACTIVE");
      assert.equal(preview.json().data.contractNumber, contractNumber);
      assert.equal(preview.json().data.id, undefined);
      assert.equal(preview.json().data.renewal.additionalDays, 4);
      assert.equal(preview.json().data.renewal.additionalAmount, 700);
      assert.equal(preview.json().data.renewal.confirmed, false);

      const confirm = await app.inject({
        method: "POST",
        url: `/contracts/renew/${renewToken}/confirm`,
        payload: { additionalDays: 99, additionalAmount: 1 },
      });
      assert.equal(confirm.statusCode, 200, confirm.body);
      assert.equal(confirm.json().data.contractNumber, contractNumber);
      assert.equal(confirm.json().data.status, "ACTIVE");
      assert.equal(confirm.json().data.rentalDays, 7);
      assert.equal(confirm.json().data.agreedAmount, 2200);
      assert.equal(confirm.json().data.renewal.additionalDays, 4);
      assert.equal(confirm.json().data.renewal.additionalAmount, 700);
      assert.equal(confirm.json().data.renewal.confirmed, true);

      const replay = await app.inject({
        method: "POST",
        url: `/contracts/renew/${renewToken}/confirm`,
        payload: { additionalDays: 99, additionalAmount: 1 },
      });
      assert.equal(replay.statusCode, 200, replay.body);
      assert.equal(replay.json().data.rentalDays, 7);
      assert.equal(replay.json().data.agreedAmount, 2200);
      assert.equal(replay.json().data.contractNumber, contractNumber);

      const detail = await app.inject({
        method: "GET",
        url: `/contracts/${contractId}`,
        headers: auth(),
      });
      assert.equal(detail.statusCode, 200, detail.body);
      assert.equal(detail.json().data.status, "ACTIVE");
      assert.equal(detail.json().data.contractNumber, contractNumber);
      assert.equal(detail.json().data.rentalDays, 7);
      assert.equal(detail.json().data.agreedAmount, 2200);
      assert.equal(detail.json().data.vehicle.operationalStatus, "RENTED");
      const history = detail.json().data.renewals as Array<{
        additionalDays: number;
        additionalAmount: number;
        approvedAt: string | null;
      }>;
      assert.equal(history.length, 1);
      assert.equal(history[0]?.additionalDays, 4);
      assert.equal(history[0]?.additionalAmount, 700);
      assert.ok(history[0]?.approvedAt);

      const vehicle = await app.inject({
        method: "GET",
        url: `/vehicles/${vehicleId}`,
        headers: auth(),
      });
      assert.equal(vehicle.statusCode, 200);
      assert.equal(vehicle.json().data.operationalStatus, "rented");
      assert.equal(vehicle.json().data.currentRental.contractId, contractId);

      const afterCount = await prisma.contract.count({ where: { vehicleId } });
      assert.equal(afterCount, beforeCount);

      const reloaded = await app.inject({ method: "GET", url: `/contracts/renew/${renewToken}` });
      assert.equal(reloaded.statusCode, 200, reloaded.body);
      assert.equal(reloaded.json().data.renewal.confirmed, true);
    });

    test("non-ACTIVE contract cannot confirm a previously issued renewal", async () => {
      const { contractId } = await createActiveContract();
      const issued = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/renewal-link`,
        headers: auth(),
        payload: { additionalDays: 2, additionalAmount: 200 },
      });
      const renewToken = issued.json().data.link.token as string;
      const returned = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/return-link`,
        headers: auth(),
      });
      assert.equal(returned.statusCode, 200, returned.body);
      const confirm = await app.inject({
        method: "POST",
        url: `/contracts/renew/${renewToken}/confirm`,
        payload: {},
      });
      assert.equal(confirm.statusCode, 409, confirm.body);
      assert.equal(confirm.json().error.context.reason, "CONTRACT_INVALID_TRANSITION");
    });
  });
}
