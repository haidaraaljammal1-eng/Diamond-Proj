import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { CAR_OUT_REQUIRED_ANGLES } from "src/modules/contracts/contracts.constants";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import {
  confirmRentalPaymentViaStatusToken,
  createFakePaymentProvider,
  linkCardViaFakeProvider,
  reconcileFakeProviderPayment,
} from "../helpers/fake-payment-provider";
import { injectDocumentOcr, seedReadyIdentity } from "../helpers/public-identity";
import { companyId as testCompanyId } from "tests/helpers/operating-company";
import {
  CONTRACTS_INTEGRATION_ALL_PERMS,
  permissionCategory,
} from "tests/helpers/contracts-integration-rbac";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("contracts renewal cancel skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("contracts electronic renewal cancel", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `rc-admin-${run}@example.test`, password: "rc-admin-pass-123" };
    let token = "";
    let seq = 0;

    const auth = () => ({ authorization: `Bearer ${token}` });

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lV8AAAAASUVORK5CYII=",
      "base64",
    );

    function multipart(bytes: Buffer, mime = "image/png") {
      const boundary = `diamond-rc-${run}`;
      return {
        headers: { ...auth(), "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="evidence.png"\r\nContent-Type: ${mime}\r\n\r\n`,
          ),
          bytes,
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]),
      };
    }

    async function seedUser() {
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      const email = normalizeEmail(admin.email);
      const role = await prisma.role.upsert({
        where: { key: `rc_admin_${run}` },
        update: {},
        create: { key: `rc_admin_${run}`, name: "rc admin" },
      });
      for (const key of CONTRACTS_INTEGRATION_ALL_PERMS) {
        const perm = await prisma.permission.upsert({
          where: { key },
          update: {},
          create: { key, category: permissionCategory(key), description: key },
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
        create: { email, name: "rc admin", status: "ACTIVE", passwordHash },
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

    async function completeStagedCarOut(contractId: string, mileageOut = 1000) {
      const patch = await app.inject({
        method: "PATCH",
        url: `/contracts/${contractId}/car-out`,
        headers: auth(),
        payload: { mileageOut, fuelOut: "F" },
      });
      assert.equal(patch.statusCode, 200, patch.body);
      for (const angle of CAR_OUT_REQUIRED_ANGLES) {
        const uploaded = await app.inject({
          method: "POST",
          url: `/contracts/${contractId}/car-out/photos?angle=${angle}`,
          ...multipart(png),
        });
        assert.equal(uploaded.statusCode, 200, `${angle}: ${uploaded.body}`);
      }
      const sig = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/car-out/signature`,
        ...multipart(png),
      });
      assert.equal(sig.statusCode, 200, sig.body);
      const carOut = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/car-out/complete`,
        headers: auth(),
      });
      assert.equal(carOut.statusCode, 200, carOut.body);
      return carOut;
    }

    async function createActiveContract() {
      seq += 1;
      const vehicleRes = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(),
        payload: {
          companyId: await testCompanyId(prisma),
          vehicleName: `RC-${run}-${seq}`,
          plateNumber: `RC ${run}${seq}`,
          dailyRate: 400,
        },
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
          collectionMode: "ELECTRONIC",
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
      await seedReadyIdentity(app, rentalToken, { licenseNumber: "DL-RC", expiryDate: "2030-01-01" });
      const form = await app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/form`,
        payload: {
          name: "Cancel Test Customer",
          mobile: "+971500000019",
          nationality: "AE",
          identityNumber: "784-1990-888",
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
      const payments = createFakePaymentProvider(`${run}-rental-${seq}`);
      setPaymentProviderForTests(payments.provider);
      await linkCardViaFakeProvider(app, payments, rentalToken, contractId);
      await confirmRentalPaymentViaStatusToken(app, payments, rentalToken, `rc-pay-${contractId}`);
      const carOut = await completeStagedCarOut(contractId);
      assert.equal(carOut.json().data.status, "ACTIVE");
      return { contractId, contractNumber, vehicleId };
    }

    async function issueElectronicLink(contractId: string, days = 3, amount = 450) {
      const issued = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/renewal-link`,
        headers: auth(),
        payload: { additionalDays: days, additionalAmount: amount },
      });
      assert.equal(issued.statusCode, 200, issued.body);
      return issued.json().data.link.token as string;
    }

    async function officeRenew(contractId: string, days = 2, amount = 300) {
      return app.inject({
        method: "POST",
        url: `/contracts/${contractId}/renew`,
        headers: auth(),
        payload: { additionalDays: days, additionalAmount: amount },
      });
    }

    async function cancelRenewal(contractId: string, renewalId: string) {
      return app.inject({
        method: "POST",
        url: `/contracts/${contractId}/renewals/${renewalId}/cancel`,
        headers: auth(),
      });
    }

    before(async () => {
      process.env.LEGACY_CARD_LINK_ENABLED = "true";
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("renewal cancel tests require haidara_test");
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

    test("PENDING electronic renewal cancels and invalidates the link", async () => {
      const active = await createActiveContract();
      const renewToken = await issueElectronicLink(active.contractId, 2, 280);
      const renewal = await prisma.contractRenewal.findFirstOrThrow({
        where: { contractId: active.contractId },
      });

      const cancelled = await cancelRenewal(active.contractId, renewal.id);
      assert.equal(cancelled.statusCode, 200, cancelled.body);
      assert.equal(cancelled.json().data.renewals.length, 0);

      const stale = await app.inject({ method: "GET", url: `/contracts/renew/${renewToken}` });
      assert.ok(stale.statusCode >= 400 && stale.statusCode < 500, stale.body);
    });

    test("AWAITING_PAYMENT without checkout cancels", async () => {
      const active = await createActiveContract();
      const renewToken = await issueElectronicLink(active.contractId, 1, 150);
      await app.inject({ method: "POST", url: `/contracts/renew/${renewToken}/confirm`, payload: {} });
      const renewal = await prisma.contractRenewal.findFirstOrThrow({
        where: { contractId: active.contractId },
      });
      assert.ok(renewal.approvedAt);
      assert.equal(renewal.appliedAt, null);

      const cancelled = await cancelRenewal(active.contractId, renewal.id);
      assert.equal(cancelled.statusCode, 200, cancelled.body);
      assert.equal(cancelled.json().data.renewals.length, 0);
    });

    test("AWAITING_PAYMENT with active checkout is neutralized then cancelled", async () => {
      const active = await createActiveContract();
      const payments = createFakePaymentProvider(`${run}-cancel-checkout`);
      setPaymentProviderForTests(payments.provider);
      const renewToken = await issueElectronicLink(active.contractId, 2, 220);
      await app.inject({ method: "POST", url: `/contracts/renew/${renewToken}/confirm`, payload: {} });
      const payStart = await app.inject({
        method: "POST",
        url: `/contracts/renew/${renewToken}/payment`,
      });
      assert.equal(payStart.statusCode, 200, payStart.body);

      const renewal = await prisma.contractRenewal.findFirstOrThrow({
        where: { contractId: active.contractId },
      });
      const payment = await prisma.contractPayment.findFirstOrThrow({
        where: { purpose: "RENEWAL", targetId: renewal.id, status: { in: ["PENDING", "PROCESSING"] } },
      });

      const cancelled = await cancelRenewal(active.contractId, renewal.id);
      assert.equal(cancelled.statusCode, 200, cancelled.body);

      const terminal = await prisma.contractPayment.findUniqueOrThrow({ where: { id: payment.id } });
      assert.equal(terminal.status, "CANCELLED");
      assert.equal(await prisma.contractRenewal.count({ where: { id: renewal.id } }), 0);
    });

    test("provider already paid rejects cancellation and reconciles payment", async () => {
      const active = await createActiveContract();
      const payments = createFakePaymentProvider(`${run}-cancel-paid`);
      setPaymentProviderForTests(payments.provider);
      const renewToken = await issueElectronicLink(active.contractId, 2, 310);
      await app.inject({ method: "POST", url: `/contracts/renew/${renewToken}/confirm`, payload: {} });
      await app.inject({ method: "POST", url: `/contracts/renew/${renewToken}/payment` });
      payments.confirm();
      const renewal = await prisma.contractRenewal.findFirstOrThrow({
        where: { contractId: active.contractId },
      });

      const cancelled = await cancelRenewal(active.contractId, renewal.id);
      assert.equal(cancelled.statusCode, 409, cancelled.body);
      assert.equal(cancelled.json().error.context.reason, "ALREADY_PAID");
      const after = await prisma.contractRenewal.findUniqueOrThrow({ where: { id: renewal.id } });
      assert.ok(after.settledPaymentId);
      assert.equal(
        await prisma.contractPayment.count({
          where: { purpose: "RENEWAL", targetId: renewal.id, status: "CONFIRMED" },
        }),
        1,
      );
    });

    test("PAID renewal rejects cancellation", async () => {
      const active = await createActiveContract();
      const payments = createFakePaymentProvider(`${run}-cancel-settled`);
      setPaymentProviderForTests(payments.provider);
      const renewToken = await issueElectronicLink(active.contractId, 1, 120);
      await app.inject({ method: "POST", url: `/contracts/renew/${renewToken}/confirm`, payload: {} });
      const payStart = await app.inject({
        method: "POST",
        url: `/contracts/renew/${renewToken}/payment`,
      });
      assert.equal(payStart.statusCode, 200, payStart.body);
      payments.confirm();
      const renewal = await prisma.contractRenewal.findFirstOrThrow({
        where: { contractId: active.contractId },
      });
      const payment = await prisma.contractPayment.findFirstOrThrow({
        where: { purpose: "RENEWAL", targetId: renewal.id },
      });
      await reconcileFakeProviderPayment(app, payments, payment.id);

      const cancelled = await cancelRenewal(active.contractId, renewal.id);
      assert.equal(cancelled.statusCode, 409, cancelled.body);
      assert.equal(cancelled.json().error.context.reason, "RENEWAL_CANCEL_NOT_ALLOWED");
    });

    test("OFFICE_UNPAID renewal rejects cancellation", async () => {
      const active = await createActiveContract();
      const office = await officeRenew(active.contractId, 2, 190);
      assert.equal(office.statusCode, 200, office.body);
      const renewalId = (office.json().data.renewals as Array<{ id: string }>)[0]!.id;

      const cancelled = await cancelRenewal(active.contractId, renewalId);
      assert.equal(cancelled.statusCode, 409, cancelled.body);
      assert.equal(cancelled.json().error.context.reason, "RENEWAL_CANCEL_NOT_ALLOWED");
    });

    test("race: payment confirmation vs cancel stays consistent", async () => {
      const active = await createActiveContract();
      const payments = createFakePaymentProvider(`${run}-cancel-race`);
      setPaymentProviderForTests(payments.provider);
      const renewToken = await issueElectronicLink(active.contractId, 1, 140);
      await app.inject({ method: "POST", url: `/contracts/renew/${renewToken}/confirm`, payload: {} });
      const payStart = await app.inject({
        method: "POST",
        url: `/contracts/renew/${renewToken}/payment`,
      });
      assert.equal(payStart.statusCode, 200, payStart.body);
      const renewal = await prisma.contractRenewal.findFirstOrThrow({
        where: { contractId: active.contractId },
      });
      const payment = await prisma.contractPayment.findFirstOrThrow({
        where: { purpose: "RENEWAL", targetId: renewal.id },
      });

      const [cancelled] = await Promise.all([
        cancelRenewal(active.contractId, renewal.id),
        (async () => {
          payments.confirm();
        })(),
      ]);
      assert.ok(
        cancelled.statusCode === 200 || cancelled.statusCode === 409,
        cancelled.body,
      );

      const stillThere = await prisma.contractRenewal.findUnique({ where: { id: renewal.id } });
      const terminal = await prisma.contractPayment.findUnique({ where: { id: payment.id } });
      if (stillThere) {
        assert.ok(
          stillThere.settledPaymentId || terminal?.status === "CONFIRMED",
          "renewal kept only when payment settled",
        );
      } else {
        assert.ok(
          terminal?.status === "CANCELLED" || terminal?.status === "CONFIRMED",
          "removed renewal leaves payment cancelled or fully settled, not orphaned mid-flight",
        );
        if (terminal?.status === "CONFIRMED") {
          assert.fail("confirmed payment must not remain after successful cancel");
        }
      }
    });
  });
}
