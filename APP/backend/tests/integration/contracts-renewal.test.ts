import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { injectDocumentOcr, seedReadyIdentity } from "../helpers/public-identity";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { CAR_OUT_REQUIRED_ANGLES, INSPECTION_ANGLES } from "src/modules/contracts/contracts.constants";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import {
  confirmRentalPaymentViaStatusToken,
  createFakePaymentProvider,
  linkCardViaFakeProvider,
} from "../helpers/fake-payment-provider";
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


    async function seedValidLicense(rentalToken: string) {
      await seedReadyIdentity(app, rentalToken, { licenseNumber: "DL-RN", expiryDate: "2030-01-01" });
    }

    async function dummyPhotos(angles: readonly string[] = INSPECTION_ANGLES) {
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
      return angles.map((angle, i) => ({ attachmentId: ids[i]!, angle }));
    }

    async function outSignature() {
      seq += 1;
      const row = await prisma.attachment.create({
        data: { originalName: "out-signature.png", storageKey: `rn-${run}-${seq}-sig.png`, mimeType: "image/png", size: 8 },
      });
      return row.id;
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
      seq += 1;
      const payments = createFakePaymentProvider(`${run}-${seq}`);
      setPaymentProviderForTests(payments.provider);
      await linkCardViaFakeProvider(app, payments, rentalToken, contractId);
      await confirmRentalPaymentViaStatusToken(app, payments, rentalToken, `rn-pay-${contractId}`);
      const carOut = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/car-out`,
        headers: auth(),
        payload: { mileageOut: 1000, fuelOut: "F", photos: await dummyPhotos(CAR_OUT_REQUIRED_ANGLES), hirerSignatureAttachmentId: await outSignature() },
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
      await injectDocumentOcr(undefined);
      setPaymentProviderForTests(undefined);
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

    test("public confirm applies the stored offer after renewal payment", async () => {
      const { contractId, contractNumber, vehicleId } = await createActiveContract();
      const payments = createFakePaymentProvider(`${run}-renewal-pay`);
      setPaymentProviderForTests(payments.provider);
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
      assert.equal(confirm.json().data.rentalDays, 3);
      assert.equal(confirm.json().data.agreedAmount, 1500);
      assert.equal(confirm.json().data.renewal.awaitingPayment, true);
      assert.equal(confirm.json().data.renewal.confirmed, false);

      const payStart = await app.inject({
        method: "POST",
        url: `/contracts/renew/${renewToken}/payment`,
      });
      assert.equal(payStart.statusCode, 200, payStart.body);
      const statusToken = payStart.json().data.statusToken as string;
      payments.confirm();
      const payStatus = await app.inject({
        method: "GET",
        url: `/contracts/payments/status/${statusToken}`,
      });
      assert.equal(payStatus.statusCode, 200, payStatus.body);
      assert.equal(payStatus.json().data.status, "CONFIRMED");

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

    test("issuing a return link keeps the contract ACTIVE and renewable", async () => {
      const { contractId, vehicleId } = await createActiveContract();
      const returned = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/return-link`,
        headers: auth(),
      });
      assert.equal(returned.statusCode, 200, returned.body);

      const detail = await app.inject({ method: "GET", url: `/contracts/${contractId}`, headers: auth() });
      assert.equal(detail.json().data.status, "ACTIVE");
      assert.equal(detail.json().data.actions.canRenew, true);
      assert.equal(detail.json().data.actions.canGenerateReturnLink, true);
      assert.equal(detail.json().data.actions.canCarIn, false);
      assert.equal(detail.json().data.vehicle.operationalStatus, "RENTED");
      const vehicle = await app.inject({ method: "GET", url: `/vehicles/${vehicleId}`, headers: auth() });
      assert.equal(vehicle.json().data.operationalStatus, "rented");

      // Accidental link, then the hirer asks to extend: renewal still works.
      const issued = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/renewal-link`,
        headers: auth(),
        payload: { additionalDays: 2, additionalAmount: 300 },
      });
      assert.equal(issued.statusCode, 200, issued.body);
      const renewToken = issued.json().data.link.token as string;
      const confirm = await app.inject({ method: "POST", url: `/contracts/renew/${renewToken}/confirm`, payload: {} });
      assert.equal(confirm.statusCode, 200, confirm.body);
      assert.equal(confirm.json().data.status, "ACTIVE");
    });

    test("a confirmed return blocks a previously issued renewal", async () => {
      const { contractId, vehicleId } = await createActiveContract();
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
      const returnToken = returned.json().data.link.token as string;

      const confirmReturn = await app.inject({ method: "POST", url: `/contracts/return/${returnToken}/confirm` });
      assert.equal(confirmReturn.statusCode, 200, confirmReturn.body);
      assert.equal(confirmReturn.json().data.status, "RETOUT");
      const again = await app.inject({ method: "POST", url: `/contracts/return/${returnToken}/confirm` });
      assert.equal(again.statusCode, 200, again.body);
      assert.equal(again.json().data.status, "RETOUT");

      const detail = await app.inject({ method: "GET", url: `/contracts/${contractId}`, headers: auth() });
      assert.equal(detail.json().data.status, "RETOUT");
      assert.equal(detail.json().data.actions.canRenew, false);
      assert.equal(detail.json().data.actions.canCarIn, true);
      assert.equal(detail.json().data.vehicle.operationalStatus, "RENTED");
      const vehicle = await app.inject({ method: "GET", url: `/vehicles/${vehicleId}`, headers: auth() });
      assert.equal(vehicle.json().data.operationalStatus, "rented");

      const confirmRenewal = await app.inject({ method: "POST", url: `/contracts/renew/${renewToken}/confirm`, payload: {} });
      assert.ok(confirmRenewal.statusCode >= 400 && confirmRenewal.statusCode < 500, confirmRenewal.body);
      const staffRenew = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/renew`,
        headers: auth(),
        payload: { additionalDays: 1, additionalAmount: 100 },
      });
      assert.equal(staffRenew.statusCode, 409, staffRenew.body);
    });

    test("return confirmation racing a renewal leaves one consistent state", async () => {
      const { contractId } = await createActiveContract();
      const returned = await app.inject({ method: "POST", url: `/contracts/${contractId}/return-link`, headers: auth() });
      const returnToken = returned.json().data.link.token as string;
      const [confirm, renew] = await Promise.all([
        app.inject({ method: "POST", url: `/contracts/return/${returnToken}/confirm` }),
        app.inject({
          method: "POST",
          url: `/contracts/${contractId}/renew`,
          headers: auth(),
          payload: { additionalDays: 1, additionalAmount: 100 },
        }),
      ]);
      assert.equal(confirm.statusCode, 200, confirm.body);
      const final = await app.inject({ method: "GET", url: `/contracts/${contractId}`, headers: auth() });
      assert.equal(final.json().data.status, "RETOUT");
      // Renewal either committed first (while ACTIVE) or was refused after RETOUT.
      assert.ok(renew.statusCode === 200 || renew.statusCode === 409, renew.body);
    });

    async function startRenewalPayment(contractId: string, label: string) {
      const payments = createFakePaymentProvider(`${run}-${label}`);
      setPaymentProviderForTests(payments.provider);
      const issued = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/renewal-link`,
        headers: auth(),
        payload: { additionalDays: 4, additionalAmount: 700 },
      });
      assert.equal(issued.statusCode, 200, issued.body);
      const renewToken = issued.json().data.link.token as string;
      const confirm = await app.inject({ method: "POST", url: `/contracts/renew/${renewToken}/confirm`, payload: {} });
      assert.equal(confirm.statusCode, 200, confirm.body);
      const payStart = await app.inject({ method: "POST", url: `/contracts/renew/${renewToken}/payment` });
      assert.equal(payStart.statusCode, 200, payStart.body);
      return { payments, statusToken: payStart.json().data.statusToken as string };
    }

    async function confirmReturnViaLink(contractId: string) {
      const link = await app.inject({ method: "POST", url: `/contracts/${contractId}/return-link`, headers: auth() });
      assert.equal(link.statusCode, 200, link.body);
      const returnToken = link.json().data.link.token as string;
      const confirmed = await app.inject({ method: "POST", url: `/contracts/return/${returnToken}/confirm` });
      assert.equal(confirmed.statusCode, 200, confirmed.body);
      assert.equal(confirmed.json().data.status, "RETOUT");
    }

    test("an in-flight renewal payment never extends a contract whose return was confirmed", async () => {
      const { contractId, vehicleId } = await createActiveContract();
      const { payments, statusToken } = await startRenewalPayment(contractId, "race-return-first");

      // The hirer confirms the return while the renewal payment is still pending.
      await confirmReturnViaLink(contractId);

      // The provider then reports the renewal payment as captured.
      payments.confirm();
      const payStatus = await app.inject({ method: "GET", url: `/contracts/payments/status/${statusToken}` });
      assert.equal(payStatus.statusCode, 200, payStatus.body);
      assert.equal(payStatus.json().data.status, "CONFIRMED", "captured money stays recorded");

      const detail = await app.inject({ method: "GET", url: `/contracts/${contractId}`, headers: auth() });
      assert.equal(detail.json().data.status, "RETOUT", "no rollback to ACTIVE");
      assert.equal(detail.json().data.rentalDays, 3, "no extension applied");
      assert.equal(detail.json().data.agreedAmount, 1500);
      assert.equal(detail.json().data.actions.canRenew, false);
      assert.equal(detail.json().data.vehicle.operationalStatus, "RENTED");

      const renewals = await prisma.contractRenewal.findMany({ where: { contractId } });
      assert.equal(renewals.length, 1, "no duplicate renewal record");
      assert.equal(renewals[0]?.appliedAt, null);
      assert.equal(await prisma.contractPayment.count({ where: { contractId, purpose: "RENEWAL" } }), 1, "no second attempt");
      const notice = await prisma.domainOutboxEvent.count({ where: { aggregateId: contractId, eventType: "contract.renewal_not_applied" } });
      assert.equal(notice, 1, "staff are told the captured renewal was not applied");

      // Replaying the provider status does not apply it later either.
      const replay = await app.inject({ method: "GET", url: `/contracts/payments/status/${statusToken}` });
      assert.equal(replay.json().data.status, "CONFIRMED");
      const after = await app.inject({ method: "GET", url: `/contracts/${contractId}`, headers: auth() });
      assert.equal(after.json().data.rentalDays, 3);
      assert.equal(after.json().data.status, "RETOUT");
      const vehicle = await app.inject({ method: "GET", url: `/vehicles/${vehicleId}`, headers: auth() });
      assert.equal(vehicle.json().data.operationalStatus, "rented");
    });

    test("a renewal applied first is kept when the return is confirmed afterwards", async () => {
      const { contractId } = await createActiveContract();
      const { payments, statusToken } = await startRenewalPayment(contractId, "race-renewal-first");
      payments.confirm();
      const payStatus = await app.inject({ method: "GET", url: `/contracts/payments/status/${statusToken}` });
      assert.equal(payStatus.json().data.status, "CONFIRMED");
      const renewed = await app.inject({ method: "GET", url: `/contracts/${contractId}`, headers: auth() });
      assert.equal(renewed.json().data.status, "ACTIVE");
      assert.equal(renewed.json().data.rentalDays, 7);

      await confirmReturnViaLink(contractId);
      const detail = await app.inject({ method: "GET", url: `/contracts/${contractId}`, headers: auth() });
      assert.equal(detail.json().data.status, "RETOUT");
      assert.equal(detail.json().data.rentalDays, 7);
      assert.equal(detail.json().data.agreedAmount, 2200);
    });
  });
}
