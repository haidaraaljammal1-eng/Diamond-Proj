import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { INSPECTION_ANGLES } from "src/modules/contracts/contracts.constants";
import { setDrivingLicenseOcrProviderForTests } from "src/modules/contracts/ocr/ocr-provider.factory";

/**
 * Contracts V1 integration. Requires RUN_INTEGRATION=true and TEST_DATABASE_URL
 * pointing at a disposable database — never the Diamond development fleet DB.
 */
const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "contracts integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("contracts integration", { concurrency: false }, () => {

  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();
  const admin = { email: `ct-admin-${run}@example.test`, password: "ct-admin-pass-123" };
  let token = "";
  let vehicleId = 0;
  let serviceVehicleId = 0;

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

  async function seedUser() {
    const { hashPassword } = await import("src/lib/security/password");
    const { normalizeEmail } = await import("src/lib/security/normalize");
    const email = normalizeEmail(admin.email);
    const role = await prisma.role.upsert({
      where: { key: `ct_admin_${run}` },
      update: {},
      create: { key: `ct_admin_${run}`, name: "ct admin" },
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
      create: { email, name: "ct admin", status: "ACTIVE", passwordHash },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  const auth = () => ({ authorization: `Bearer ${token}` });

  async function login() {
    const res = await app.inject({ method: "POST", url: "/auth/login", payload: admin });
    assert.equal(res.statusCode, 200, res.body);
    token = res.json().data.accessToken;
  }

  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

  function licenseMultipart() {
    const boundary = "----ctlicense";
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="dl.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      PNG,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return { payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
  }

  async function seedValidLicense(rentalToken: string) {
    setDrivingLicenseOcrProviderForTests({
      name: "test",
      async analyzeDrivingLicense() {
        return {
          ok: true,
          licenseNumber: "DL-1",
          expiryDate: "2030-01-01",
          confidence: 0.99,
          provider: "test",
        };
      },
    });
    const { headers, payload } = licenseMultipart();
    const up = await app.inject({
      method: "POST",
      url: `/contracts/rental/${rentalToken}/driving-license`,
      headers,
      payload,
    });
    assert.equal(up.statusCode, 200, up.body);
  }

  let photoSeq = 0;
  async function dummyPhotos() {
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      photoSeq += 1;
      const row = await prisma.attachment.create({
        data: {
          originalName: `ct-${run}-${photoSeq}.png`,
          storageKey: `ct-${run}-${photoSeq}.png`,
          mimeType: "image/png",
          size: 8,
        },
      });
      ids.push(row.id);
    }
    return INSPECTION_ANGLES.map((angle, i) => ({ attachmentId: ids[i]!, angle }));
  }

  before(async () => {
    const { env } = await import("src/config/env");
    if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
      throw new Error("contracts integration refuses to run unless DATABASE_URL is haidara_test");
    }
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    await seedUser();
    await login();

    const available = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(),
      payload: { vehicleName: `CT-AVAIL-${run}`, plateNumber: `CT A ${run}`, dailyRate: 400 },
    });
    assert.equal(available.statusCode, 201, available.body);
    vehicleId = available.json().data.id;

    const service = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(),
      payload: { vehicleName: `CT-SVC-${run}`, plateNumber: `CT S ${run}` },
    });
    assert.equal(service.statusCode, 201, service.body);
    serviceVehicleId = service.json().data.id;
    const setService = await app.inject({
      method: "PUT",
      url: `/vehicles/${serviceVehicleId}`,
      headers: auth(),
      payload: { operationalStatus: "service" },
    });
    assert.equal(setService.statusCode, 200, setService.body);
  });

  after(async () => {
    setDrivingLicenseOcrProviderForTests(undefined);
    await app.close();
  });

  test("SERVICE vehicle cannot start a rental offer", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/contracts/offers",
      headers: auth(),
      payload: {
        vehicleId: serviceVehicleId,
        priceType: "DAILY",
        rentalDays: 3,
        agreedAmount: 1200,
      },
    });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.context.reason, "VEHICLE_NOT_AVAILABLE");
  });

  test("full lifecycle: form → signed → paid → car-out → return → car-in → close", async () => {
    const vehicleRes = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(),
      payload: { vehicleName: `CT-LIFE-${run}`, plateNumber: `CT L ${run}`, dailyRate: 400 },
    });
    assert.equal(vehicleRes.statusCode, 201, vehicleRes.body);
    const lifeVehicleId = vehicleRes.json().data.id as number;
    const offer = await app.inject({
      method: "POST",
      url: "/contracts/offers",
      headers: auth(),
      payload: {
        vehicleId: lifeVehicleId,
        priceType: "DAILY",
        rentalDays: 3,
        agreedAmount: 1500,
        depositAmount: 500,
      },
    });
    assert.equal(offer.statusCode, 201, offer.body);
    const contractId = offer.json().data.id as string;
    assert.match(offer.json().data.contractNumber, /^DE-\d{4}-\d{6}$/);

    const linkRes = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/rental-link`,
      headers: auth(),
    });
    assert.equal(linkRes.statusCode, 200, linkRes.body);
    const rentalToken = linkRes.json().data.link.token as string;
    const stored = await prisma.contractLink.findMany({ where: { contractId } });
    assert.equal(stored.some((row) => row.tokenHash === rentalToken), false);

    const publicRental = await app.inject({
      method: "GET",
      url: `/contracts/rental/${rentalToken}`,
    });
    assert.equal(publicRental.statusCode, 200, publicRental.body);
    const rentalView = publicRental.json().data as {
      contract: { contractNumber: string; status: string };
      flow: { step: string };
      customer: unknown;
    };
    assert.equal(rentalView.contract.contractNumber, offer.json().data.contractNumber);
    assert.equal(rentalView.flow.step, "LICENSE_VERIFICATION");
    assert.equal((publicRental.json().data as { id?: string }).id, undefined);
    assert.equal(rentalView.customer, null);
    assert.equal((publicRental.json().data as { snapshot?: unknown }).snapshot, undefined);
    assert.equal((publicRental.json().data as { actions?: unknown }).actions, undefined);

    await seedValidLicense(rentalToken);

    const form = await app.inject({
      method: "POST",
      url: `/contracts/rental/${rentalToken}/form`,
      payload: {
        name: "Omar Test",
        mobile: "+971500000001",
        nationality: "AE",
        identityNumber: "784-1990-123",
        drivingLicenseNumber: "FORGED",
      },
    });
    assert.equal(form.statusCode, 200, form.body);
    assert.equal(form.json().data.contract.status, "FORM");
    assert.equal(form.json().data.licenseVerification.licenseNumber, "DL-1");

    const staffUnauth = await app.inject({ method: "GET", url: `/contracts/${contractId}` });
    assert.equal(staffUnauth.statusCode, 401);

    const invalid = await app.inject({ method: "GET", url: "/contracts/rental/not-a-real-token" });
    assert.equal(invalid.statusCode, 401);

    const accept = await app.inject({
      method: "POST",
      url: `/contracts/rental/${rentalToken}/accept`,
      payload: {},
    });
    assert.equal(accept.statusCode, 200, accept.body);
    assert.equal(accept.json().data.contract.status, "SIGNED");

    const reused = await app.inject({ method: "GET", url: `/contracts/rental/${rentalToken}` });
    assert.equal(reused.statusCode, 200, reused.body);
    assert.equal(reused.json().data.contract.status, "SIGNED");
    assert.equal(reused.json().data.flow.step, "PAYMENT");

    const signed = await app.inject({
      method: "GET",
      url: `/contracts/${contractId}`,
      headers: auth(),
    });
    const snapshotName = signed.json().data.snapshot.customer.name;
    assert.equal(snapshotName, "Omar Test");
    assert.equal(signed.json().data.snapshot.customer.drivingLicenseNumber, "DL-1");
    assert.equal(signed.json().data.snapshot.contractNumber, offer.json().data.contractNumber);
    await prisma.customer.update({
      where: { id: signed.json().data.customerId },
      data: { name: "Changed Later" },
    });

    const payHeaders = { ...auth(), "idempotency-key": `pay-${contractId}` };
    const pay = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/payment/confirm`,
      headers: payHeaders,
      payload: { method: "MANUAL" },
    });
    assert.equal(pay.statusCode, 200, pay.body);
    assert.equal(pay.json().data.status, "PAID");

    const payReplay = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/payment/confirm`,
      headers: payHeaders,
      payload: { method: "MANUAL" },
    });
    assert.equal(payReplay.statusCode, 200, payReplay.body);
    assert.equal(payReplay.json().data.status, "PAID");

    const payMismatch = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/payment/confirm`,
      headers: payHeaders,
      payload: { method: "BANK_TRANSFER" },
    });
    assert.equal(payMismatch.statusCode, 409, payMismatch.body);
    assert.equal(payMismatch.json().error.context.reason, "IDEMPOTENCY_KEY_CONFLICT");

    const vehiclePaid = await app.inject({
      method: "GET",
      url: `/vehicles/${lifeVehicleId}`,
      headers: auth(),
    });
    assert.equal(vehiclePaid.statusCode, 200);
    assert.equal(vehiclePaid.json().data.operationalStatus, "available");
    assert.equal(vehiclePaid.json().data.currentRental.contractId, contractId);
    assert.equal(vehiclePaid.json().data.currentRental.status, "paid");
    assert.equal(vehiclePaid.json().data.currentRental.customerName, "Omar Test");

    const listPaid = await app.inject({
      method: "GET",
      url: `/vehicles?search=${encodeURIComponent(`CT L ${run}`)}`,
      headers: auth(),
    });
    assert.equal(listPaid.statusCode, 200, listPaid.body);
    const paidCard = (listPaid.json().data as Array<{ id: number; currentRental: { status: string } | null }>).find(
      (row) => row.id === lifeVehicleId,
    );
    assert.equal(paidCard?.currentRental?.status, "paid");

    const blockedPaidEdit = await app.inject({
      method: "PUT",
      url: `/vehicles/${lifeVehicleId}`,
      headers: auth(),
      payload: { dailyRate: 999 },
    });
    assert.equal(blockedPaidEdit.statusCode, 409);

    const blockedPaidDeactivate = await app.inject({
      method: "POST",
      url: `/vehicles/${lifeVehicleId}/deactivate`,
      headers: auth(),
    });
    assert.equal(blockedPaidDeactivate.statusCode, 409);

    const outPhotos = await dummyPhotos();
    const carOut = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/car-out`,
      headers: auth(),
      payload: { mileageOut: 1000, fuelOut: "F", photos: outPhotos },
    });
    assert.equal(carOut.statusCode, 200, carOut.body);
    assert.equal(carOut.json().data.status, "ACTIVE");
    assert.equal(carOut.json().data.vehicle.operationalStatus, "RENTED");

    const vehicleActive = await app.inject({
      method: "GET",
      url: `/vehicles/${lifeVehicleId}`,
      headers: auth(),
    });
    assert.equal(vehicleActive.statusCode, 200);
    assert.equal(vehicleActive.json().data.currentRental.contractId, contractId);
    assert.equal(vehicleActive.json().data.currentRental.status, "active");
    assert.equal(vehicleActive.json().data.operationalStatus, "rented");

    const renewalLink = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/renewal-link`,
      headers: auth(),
    });
    assert.equal(renewalLink.statusCode, 200, renewalLink.body);
    const renewToken = renewalLink.json().data.link.token as string;
    const publicRenew = await app.inject({
      method: "GET",
      url: `/contracts/renew/${renewToken}`,
    });
    assert.equal(publicRenew.statusCode, 200, publicRenew.body);
    assert.equal(publicRenew.json().data.status, "ACTIVE");
    assert.equal(publicRenew.json().data.id, undefined);

    const blockedEdit = await app.inject({
      method: "PUT",
      url: `/vehicles/${lifeVehicleId}`,
      headers: auth(),
      payload: { dailyRate: 999 },
    });
    assert.equal(blockedEdit.statusCode, 409);

    const returnLink = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/return-link`,
      headers: auth(),
    });
    assert.equal(returnLink.statusCode, 200, returnLink.body);
    const returnToken = returnLink.json().data.link.token as string;
    const publicReturn = await app.inject({
      method: "GET",
      url: `/contracts/return/${returnToken}`,
    });
    assert.equal(publicReturn.statusCode, 200, publicReturn.body);
    assert.equal(publicReturn.json().data.status, "RETOUT");
    assert.equal(publicReturn.json().data.id, undefined);

    const inPhotos = await dummyPhotos();
    const carIn = await app.inject({
      method: "POST",
      url: `/contracts/return/${returnToken}/car-in`,
      payload: { mileageIn: 1400, fuelIn: "1/2", photos: inPhotos },
    });
    assert.equal(carIn.statusCode, 200, carIn.body);
    assert.equal(carIn.json().data.status, "REVIEW");

    const afterIn = await app.inject({
      method: "GET",
      url: `/vehicles/${lifeVehicleId}`,
      headers: auth(),
    });
    assert.equal(afterIn.json().data.operationalStatus, "rented");
    assert.equal(afterIn.json().data.currentRental.status, "review");

    const closeEarly = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/close`,
      headers: auth(),
    });
    assert.equal(closeEarly.statusCode, 409);

    const rec = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/reconcile`,
      headers: auth(),
      payload: {
        lines: [
          { type: "FUEL", description: "fuel gap", amount: 80 },
          { type: "SALIK", description: "salik ref only", amount: 40, sourceDomain: "salik" },
        ],
      },
    });
    assert.equal(rec.statusCode, 200, rec.body);
    assert.equal(rec.json().data.reconciliation.chargesTotal, 120);
    assert.equal(rec.json().data.reconciliation.finalAmount, -380);

    const closed = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/close`,
      headers: auth(),
    });
    assert.equal(closed.statusCode, 200, closed.body);
    assert.equal(closed.json().data.status, "CLOSED");
    assert.equal(closed.json().data.vehicle.operationalStatus, "AVAILABLE");
    assert.equal(closed.json().data.snapshot.customer.name, "Omar Test");

    const afterClose = await app.inject({
      method: "GET",
      url: `/vehicles/${lifeVehicleId}`,
      headers: auth(),
    });
    assert.equal(afterClose.json().data.operationalStatus, "available");
    assert.equal(afterClose.json().data.currentRental, null);
  });

  test("second blocking contract on the same vehicle is rejected", async () => {
    const v = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(),
      payload: { vehicleName: `CT-DBL-${run}`, plateNumber: `CT D ${run}` },
    });
    const vid = v.json().data.id as number;
    const a = await app.inject({
      method: "POST",
      url: "/contracts/offers",
      headers: auth(),
      payload: { vehicleId: vid, priceType: "DAILY", rentalDays: 2, agreedAmount: 800 },
    });
    const b = await app.inject({
      method: "POST",
      url: "/contracts/offers",
      headers: auth(),
      payload: { vehicleId: vid, priceType: "DAILY", rentalDays: 2, agreedAmount: 900 },
    });
    assert.equal(a.statusCode, 201);
    assert.equal(b.statusCode, 201);
    const idA = a.json().data.id as string;
    const idB = b.json().data.id as string;

    async function sign(id: string) {
      const link = await app.inject({
        method: "POST",
        url: `/contracts/${id}/rental-link`,
        headers: auth(),
      });
      const t = link.json().data.link.token as string;
      await seedValidLicense(t);
      await app.inject({
        method: "POST",
        url: `/contracts/rental/${t}/form`,
        payload: {
          name: "Nada",
          mobile: "+971500000009",
          nationality: "AE",
          passportNumber: "P123",
        },
      });
      await app.inject({ method: "POST", url: `/contracts/rental/${t}/accept`, payload: {} });
    }
    await sign(idA);
    await sign(idB);
    const [payA, payB] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/contracts/${idA}/payment/confirm`,
        headers: auth(),
        payload: { method: "MANUAL" },
      }),
      app.inject({
        method: "POST",
        url: `/contracts/${idB}/payment/confirm`,
        headers: auth(),
        payload: { method: "MANUAL" },
      }),
    ]);
    const codes = [payA.statusCode, payB.statusCode].sort();
    assert.deepEqual(codes, [200, 409]);
    const failed = payA.statusCode === 409 ? payA : payB;
    assert.equal(failed.json().error.context.reason, "VEHICLE_ALREADY_RENTED");
  });

  test("expired and revoked rental links are rejected", async () => {
    const offer = await app.inject({
      method: "POST",
      url: "/contracts/offers",
      headers: auth(),
      payload: {
        vehicleId,
        priceType: "CUSTOM",
        rentalDays: 1,
        agreedAmount: 100,
      },
    });
    const id = offer.json().data.id as string;
    const first = await app.inject({
      method: "POST",
      url: `/contracts/${id}/rental-link`,
      headers: auth(),
    });
    const oldToken = first.json().data.link.token as string;
    const second = await app.inject({
      method: "POST",
      url: `/contracts/${id}/rental-link`,
      headers: auth(),
    });
    assert.equal(second.statusCode, 200);
    const revoked = await app.inject({ method: "GET", url: `/contracts/rental/${oldToken}` });
    assert.equal(revoked.statusCode, 401);

    const fresh = second.json().data.link.token as string;
    const hash = (await import("src/lib/security/tokens")).hashToken(fresh);
    await prisma.contractLink.update({
      where: { tokenHash: hash },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await app.inject({ method: "GET", url: `/contracts/rental/${fresh}` });
    assert.equal(expired.statusCode, 401);
  });
  });
}
