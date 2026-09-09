import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { setDrivingLicenseOcrProviderForTests } from "src/modules/contracts/ocr/ocr-provider.factory";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import type { PaymentProvider, ProviderPaymentStatus } from "src/modules/contracts/payment/payment-provider.types";
import { hashToken } from "src/lib/security/tokens";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function multipart(
  filename: string,
  mime: string,
  data: Buffer,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = "----prflow";
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

if (!RUN) {
  test(
    "public rental flow integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("public rental flow v2", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `prf-admin-${run}@example.test`, password: "prf-admin-pass-123" };
    let token = "";

    const auth = () => ({ authorization: `Bearer ${token}` });

    function fakeOcr(input: {
      licenseNumber?: string | null;
      expiryDate?: string | null;
      confidence?: number;
    }) {
      setDrivingLicenseOcrProviderForTests({
        name: "test",
        async analyzeDrivingLicense() {
          return {
            ok: true,
            licenseNumber: input.licenseNumber !== undefined ? input.licenseNumber : "DL-OK",
            expiryDate: input.expiryDate !== undefined ? input.expiryDate : "2031-06-01",
            confidence: input.confidence ?? 0.99,
            provider: "test",
          };
        },
      });
    }

    function fakePayments() {
      const statuses = new Map<string, ProviderPaymentStatus>();
      let n = 0;
      const provider: PaymentProvider & { lastRef: string | null } = {
        name: "test",
        configured: true,
        lastRef: null,
        async createPayment() {
          n += 1;
          const ref = `ref-${run}-${n}`;
          statuses.set(ref, "PROCESSING");
          provider.lastRef = ref;
          return {
            ok: true,
            provider: "test",
            providerReference: ref,
            providerStatus: "PROCESSING",
          };
        },
        async getPaymentStatus(ref: string) {
          return { status: statuses.get(ref) ?? "UNKNOWN" };
        },
        async verifyWebhook() {
          return { ok: false as const, reason: "NOT_CONFIGURED" as const };
        },
      };
      return {
        provider,
        confirm() {
          if (provider.lastRef) statuses.set(provider.lastRef, "CONFIRMED");
        },
        fail() {
          if (provider.lastRef) statuses.set(provider.lastRef, "FAILED");
        },
      };
    }

    let offerSeq = 0;
    async function offerAndToken() {
      offerSeq += 1;
      const plate = `P${run}${offerSeq}`.slice(0, 20);
      const vehicleName = `PRF-${run}-${offerSeq}`;
      const vehicle = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(),
        payload: {
          vehicleName,
          plateNumber: plate,
          dailyRate: 400,
          color: "White",
          modelYear: 2024,
        },
      });
      assert.equal(vehicle.statusCode, 201, vehicle.body);
      const vid = vehicle.json().data.id as number;
      const offer = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(),
        payload: {
          vehicleId: vid,
          priceType: "DAILY",
          rentalDays: 4,
          agreedAmount: 1600,
          depositAmount: 200,
        },
      });
      assert.equal(offer.statusCode, 201, offer.body);
      const contractId = offer.json().data.id as string;
      const link = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/rental-link`,
        headers: auth(),
      });
      return {
        contractId,
        contractNumber: offer.json().data.contractNumber as string,
        token: link.json().data.link.token as string,
        agreedAmount: 1600,
        rentalDays: 4,
        vehicleName,
      };
    }

    async function uploadLicense(rentalToken: string, mime = "image/png", data = PNG) {
      const { headers, payload } = multipart("dl.png", mime, data);
      return app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/driving-license`,
        headers,
        payload,
      });
    }

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("public rental integration refuses to run unless DATABASE_URL is haidara_test");
      }
      const { buildApp } = await import("src/app");
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      app = await buildApp();
      prisma = app.prisma;
      const email = normalizeEmail(admin.email);
      const role = await prisma.role.upsert({
        where: { key: `prf_admin_${run}` },
        update: {},
        create: { key: `prf_admin_${run}`, name: "prf admin" },
      });
      for (const key of [
        "vehicles.read",
        "vehicles.manage",
        "contracts.read",
        "contracts.manage",
      ]) {
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
          name: "prf admin",
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
      token = login.json().data.accessToken;
    });

    after(async () => {
      setDrivingLicenseOcrProviderForTests(undefined);
      setPaymentProviderForTests(undefined);
      if (app) await app.close();
    });

    test("invalid MIME and missing license block the form", async () => {
      const { token: rentalToken } = await offerAndToken();
      const bad = await uploadLicense(rentalToken, "text/plain", Buffer.from("hello"));
      assert.equal(bad.statusCode, 422);

      const form = await app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/form`,
        payload: {
          name: "No License",
          mobile: "+971500000010",
          nationality: "AE",
          identityNumber: "784-1",
        },
      });
      assert.equal(form.statusCode, 409);
      assert.equal(form.json().error.context.reason, "DRIVING_LICENSE_REQUIRED");
    });

    test("valid license then form/sign copies server-owned fields and keeps dates null", async () => {
      setPaymentProviderForTests(undefined);
      fakeOcr({ licenseNumber: "DL-OK", expiryDate: "2031-06-01" });
      const ctx = await offerAndToken();
      const uploaded = await uploadLicense(ctx.token);
      assert.equal(uploaded.statusCode, 200, uploaded.body);
      assert.equal(uploaded.json().data.licenseVerification.status, "VALID");
      assert.equal(uploaded.json().data.flow.step, "CONTRACT");

      const again = await app.inject({ method: "GET", url: `/contracts/rental/${ctx.token}` });
      assert.equal(again.statusCode, 200);

      const expiredOcr = await (async () => {
        fakeOcr({ licenseNumber: "DL-OLD", expiryDate: "2020-01-01" });
        return uploadLicense(ctx.token);
      })();
      assert.equal(expiredOcr.json().data.licenseVerification.status, "EXPIRED");
      const blocked = await app.inject({
        method: "POST",
        url: `/contracts/rental/${ctx.token}/form`,
        payload: {
          name: "Expired",
          mobile: "+971500000011",
          nationality: "AE",
          identityNumber: "784-2",
        },
      });
      assert.equal(blocked.statusCode, 409);
      assert.equal(blocked.json().error.context.reason, "DRIVING_LICENSE_EXPIRED");

      fakeOcr({ licenseNumber: "DL-OK", expiryDate: "2031-06-01" });
      await uploadLicense(ctx.token);

      const form = await app.inject({
        method: "POST",
        url: `/contracts/rental/${ctx.token}/form`,
        payload: {
          name: "Lina",
          mobile: "+971500000012",
          nationality: "AE",
          identityNumber: "784-3",
          drivingLicenseNumber: "HACKED",
        },
      });
      assert.equal(form.statusCode, 200, form.body);
      assert.equal(form.json().data.contract.status, "FORM");
      assert.equal(form.json().data.vehicle.displayName, ctx.vehicleName);
      assert.equal(form.json().data.rental.agreedAmount, ctx.agreedAmount);
      assert.equal(form.json().data.rental.rentalDays, ctx.rentalDays);
      assert.equal(form.json().data.contract.contractNumber, ctx.contractNumber);
      assert.equal(form.json().data.licenseVerification.licenseNumber, "DL-OK");
      assert.equal(form.json().data.rental.actualPickupAt, null);
      assert.equal(form.json().data.rental.actualReturnAt, null);

      const accept = await app.inject({
        method: "POST",
        url: `/contracts/rental/${ctx.token}/accept`,
        payload: {},
      });
      assert.equal(accept.statusCode, 200, accept.body);
      assert.equal(accept.json().data.contract.status, "SIGNED");
      const staff = await app.inject({
        method: "GET",
        url: `/contracts/${ctx.contractId}`,
        headers: auth(),
      });
      assert.equal(staff.json().data.snapshot.customer.drivingLicenseNumber, "DL-OK");
      assert.equal(staff.json().data.snapshot.commercial.agreedAmount, 1600);

      const payCtx = await app.inject({
        method: "GET",
        url: `/contracts/rental/${ctx.token}/payment`,
      });
      assert.equal(payCtx.statusCode, 200, payCtx.body);
      assert.equal(payCtx.json().data.agreedAmount, 1600);
      assert.equal(payCtx.json().data.rentalDays, 4);

      const unpaid = await app.inject({
        method: "POST",
        url: `/contracts/rental/${ctx.token}/payment`,
      });
      assert.equal(unpaid.statusCode, 409);
      assert.equal(unpaid.json().error.context.reason, "PAYMENT_PROVIDER_NOT_CONFIGURED");
      const still = await app.inject({
        method: "GET",
        url: `/contracts/${ctx.contractId}`,
        headers: auth(),
      });
      assert.equal(still.json().data.status, "SIGNED");
      assert.equal(still.json().data.payment, null);
    });

    test("injected payment provider confirms only via server status", async () => {
      fakeOcr({});
      const payments = fakePayments();
      setPaymentProviderForTests(payments.provider);
      const ctx = await offerAndToken();
      await uploadLicense(ctx.token);
      await app.inject({
        method: "POST",
        url: `/contracts/rental/${ctx.token}/form`,
        payload: {
          name: "Payee",
          mobile: "+971500000013",
          nationality: "AE",
          identityNumber: "784-4",
        },
      });
      await app.inject({ method: "POST", url: `/contracts/rental/${ctx.token}/accept`, payload: {} });

      const first = await app.inject({
        method: "POST",
        url: `/contracts/rental/${ctx.token}/payment`,
        headers: { "idempotency-key": `pay-${ctx.contractId}` },
      });
      assert.equal(first.statusCode, 200, first.body);
      assert.equal(first.json().data.payment.amount, 1600);
      assert.equal(first.json().data.payment.status, "PROCESSING");
      const statusToken = first.json().data.statusToken as string;
      assert.ok(statusToken);

      const stored = await prisma.contractPayment.findMany({ where: { contractId: ctx.contractId } });
      assert.equal(stored.some((row) => row.statusTokenHash === hashToken(statusToken)), true);
      assert.equal(stored.some((row) => row.statusTokenHash === statusToken), false);

      const replay = await app.inject({
        method: "POST",
        url: `/contracts/rental/${ctx.token}/payment`,
        headers: { "idempotency-key": `pay-${ctx.contractId}` },
      });
      assert.equal(replay.statusCode, 200);
      assert.equal(replay.json().data.statusToken, null);

      const second = await app.inject({
        method: "POST",
        url: `/contracts/rental/${ctx.token}/payment`,
        headers: { "idempotency-key": `pay-${ctx.contractId}-2` },
      });
      assert.equal(second.statusCode, 409);
      assert.equal(second.json().error.context.reason, "PAYMENT_ALREADY_PROCESSING");

      const before = await app.inject({
        method: "GET",
        url: `/contracts/${ctx.contractId}`,
        headers: auth(),
      });
      assert.equal(before.json().data.status, "SIGNED");

      await prisma.contractLink.updateMany({
        where: { contractId: ctx.contractId, type: "RENTAL" },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const expiredLink = await app.inject({ method: "GET", url: `/contracts/rental/${ctx.token}` });
      assert.equal(expiredLink.statusCode, 401);

      payments.confirm();
      const status = await app.inject({
        method: "GET",
        url: `/contracts/payments/status/${statusToken}`,
      });
      assert.equal(status.statusCode, 200, status.body);
      assert.equal(status.json().data.status, "CONFIRMED");
      assert.equal(status.json().data.contractStatus, "PAID");

      const cannotPay = await app.inject({
        method: "POST",
        url: `/contracts/payments/status/${statusToken}`,
      });
      assert.ok(cannotPay.statusCode === 404 || cannotPay.statusCode === 405);
    });

    test("oversized and unreadable licenses are rejected for progression", async () => {
      const { token: rentalToken } = await offerAndToken();
      const huge = Buffer.concat([PNG, Buffer.alloc(5_242_881)]);
      const oversize = await uploadLicense(rentalToken, "image/png", huge);
      assert.equal(oversize.statusCode, 413);

      fakeOcr({ licenseNumber: null, expiryDate: "2031-06-01", confidence: 0.99 });
      const unread = await uploadLicense(rentalToken);
      assert.equal(unread.statusCode, 200);
      assert.equal(unread.json().data.licenseVerification.status, "UNREADABLE");
      const form = await app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/form`,
        payload: {
          name: "Unread",
          mobile: "+971500000014",
          nationality: "AE",
          identityNumber: "784-5",
        },
      });
      assert.equal(form.statusCode, 422);
      assert.equal(form.json().error.context.reason, "DRIVING_LICENSE_UNREADABLE");
    });

    test("FAILED payment allows a new attempt; completed link cannot restart", async () => {
      fakeOcr({});
      const payments = fakePayments();
      setPaymentProviderForTests(payments.provider);
      const ctx = await offerAndToken();
      await uploadLicense(ctx.token);
      await app.inject({
        method: "POST",
        url: `/contracts/rental/${ctx.token}/form`,
        payload: {
          name: "Retry",
          mobile: "+971500000015",
          nationality: "AE",
          identityNumber: "784-6",
        },
      });
      await app.inject({ method: "POST", url: `/contracts/rental/${ctx.token}/accept`, payload: {} });

      const first = await app.inject({
        method: "POST",
        url: `/contracts/rental/${ctx.token}/payment`,
        headers: { "idempotency-key": `fail-${ctx.contractId}` },
      });
      assert.equal(first.statusCode, 200, first.body);
      payments.fail();
      const failed = await app.inject({
        method: "GET",
        url: `/contracts/payments/status/${first.json().data.statusToken}`,
      });
      assert.equal(failed.json().data.status, "FAILED");

      const retry = await app.inject({
        method: "POST",
        url: `/contracts/rental/${ctx.token}/payment`,
        headers: { "idempotency-key": `fail-${ctx.contractId}-2` },
      });
      assert.equal(retry.statusCode, 200, retry.body);
      assert.equal(retry.json().data.payment.status, "PROCESSING");

      payments.confirm();
      const paid = await app.inject({
        method: "GET",
        url: `/contracts/payments/status/${retry.json().data.statusToken}`,
      });
      assert.equal(paid.statusCode, 200, paid.body);
      assert.equal(paid.json().data.status, "CONFIRMED");
      assert.equal(paid.json().data.contractStatus, "PAID");

      const restart = await app.inject({
        method: "POST",
        url: `/contracts/rental/${ctx.token}/form`,
        payload: {
          name: "Restart",
          mobile: "+971500000016",
          nationality: "AE",
          identityNumber: "784-7",
        },
      });
      assert.equal(restart.statusCode, 401);
      assert.equal(restart.json().error.context.reason, "CONTRACT_LINK_USED");
    });
  });
}
