import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { injectDocumentOcr, seedReadyIdentity } from "../helpers/public-identity";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { INSPECTION_ANGLES } from "src/modules/contracts/contracts.constants";
import { setPaymentProviderForTests } from "src/modules/contracts/payment/payment-provider.factory";
import {
  confirmRentalPaymentViaStatusToken,
  createFakePaymentProvider,
} from "../helpers/fake-payment-provider";

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


  async function seedValidLicense(rentalToken: string) {
    await seedReadyIdentity(app, rentalToken, { licenseNumber: "DL-1", expiryDate: "2030-01-01" });
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
    await injectDocumentOcr(undefined);
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

    const payments = createFakePaymentProvider(run);
    setPaymentProviderForTests(payments.provider);
    const paid = await confirmRentalPaymentViaStatusToken(
      app,
      payments,
      rentalToken,
      `pay-${contractId}`,
    );
    assert.equal(paid.contractStatus, "PAID");

    const manualDisabled = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/payment/confirm`,
      headers: auth(),
      payload: { method: "MANUAL" },
    });
    assert.equal(manualDisabled.statusCode, 409);
    assert.equal(manualDisabled.json().error.context.reason, "MANUAL_PAYMENT_DISABLED");

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
      payload: {
        mileageOut: 1000,
        fuelOut: "F",
        photos: outPhotos,
        damage: [{ zone: "TOP.HOOD", type: "SCRATCH" }],
      },
    });
    assert.equal(carOut.statusCode, 200, carOut.body);
    const outDraft = await prisma.officialContractReviewDraft.findUniqueOrThrow({ where: { contractId } });
    assert.deepEqual(outDraft.damageOut, [{ zone: "TOP.HOOD", type: "SCRATCH" }]);
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
      payload: { additionalDays: 2, additionalAmount: 800 },
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
    assert.equal(typeof publicReturn.json().data.office.displayName, "string");
    assert.ok(publicReturn.json().data.office.displayName.length > 0);
    assert.equal(publicReturn.json().data.reconciliation, undefined);

    const afterReturn = await app.inject({
      method: "GET",
      url: `/vehicles/${lifeVehicleId}`,
      headers: auth(),
    });
    assert.equal(afterReturn.json().data.operationalStatus, "rented");
    assert.equal(afterReturn.json().data.currentRental.status, "retout");

    const retoutDetail = await app.inject({
      method: "GET",
      url: `/contracts/${contractId}`,
      headers: auth(),
    });
    assert.equal(retoutDetail.json().data.status, "RETOUT");
    assert.equal(retoutDetail.json().data.actions.canCarIn, true);
    assert.equal(retoutDetail.json().data.vehicle.operationalStatus, "RENTED");

    const closeOnRetout = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/close`,
      headers: auth(),
    });
    assert.equal(closeOnRetout.statusCode, 409);

    const staffCarInUnauth = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/car-in`,
      payload: { mileageIn: 1400, fuelIn: "1/2", photos: await dummyPhotos() },
    });
    assert.equal(staffCarInUnauth.statusCode, 401);

    const inPhotos = await dummyPhotos();
    const staffCarIn = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/car-in`,
      headers: auth(),
      payload: {
        mileageIn: 1400,
        fuelIn: "1/2",
        notes: "office return",
        photos: inPhotos,
        damage: [{ zone: "LEFT.FRONT_DOOR", type: "DENT" }],
      },
    });
    assert.equal(staffCarIn.statusCode, 200, staffCarIn.body);
    const inDraft = await prisma.officialContractReviewDraft.findUniqueOrThrow({ where: { contractId } });
    assert.deepEqual(inDraft.damageIn, [{ zone: "LEFT.FRONT_DOOR", type: "DENT" }]);
    assert.deepEqual(inDraft.damageOut, [{ zone: "TOP.HOOD", type: "SCRATCH" }]);
    assert.equal(staffCarIn.json().data.status, "REVIEW");
    assert.equal(staffCarIn.json().data.carIn.mileageIn, 1400);
    assert.equal(staffCarIn.json().data.carIn.photos.length, 8);
    assert.equal(staffCarIn.json().data.vehicle.operationalStatus, "AVAILABLE");
    assert.equal(staffCarIn.json().data.actions.canCarIn, false);

    const publicReturnAfter = await app.inject({
      method: "GET",
      url: `/contracts/return/${returnToken}`,
    });
    assert.equal(publicReturnAfter.statusCode, 200, publicReturnAfter.body);
    assert.equal(publicReturnAfter.json().data.status, "REVIEW");
    assert.equal(publicReturnAfter.json().data.office.displayName, publicReturn.json().data.office.displayName);

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
    assert.equal(afterIn.json().data.operationalStatus, "available");
    assert.equal(afterIn.json().data.currentRental, null);

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
          { type: "DAMAGE", description: "bumper scuff", amount: 100 },
          { type: "FUEL", description: "fuel gap", amount: 80 },
          { type: "LATE", description: "late return", amount: 50 },
          { type: "OTHER", description: "cleaning", amount: 270 },
        ],
      },
    });
    assert.equal(rec.statusCode, 200, rec.body);
    assert.equal(rec.json().data.reconciliation.chargesTotal, 500);
    assert.equal(rec.json().data.reconciliation.finalAmount, 500);
    assert.equal(rec.json().data.reconciliation.depositAmount, undefined);
    assert.equal(rec.json().data.reconciliation.deductions, undefined);
    assert.deepEqual(
      rec.json().data.reconciliation.lines.map((line: { type: string }) => line.type).sort(),
      ["DAMAGE", "FUEL", "LATE", "OTHER"],
    );

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
      return t;
    }
    const payments = createFakePaymentProvider(`${run}-race`);
    setPaymentProviderForTests(payments.provider);
    const tokenA = await sign(idA);
    const tokenB = await sign(idB);
    async function tryPayRental(token: string, key: string) {
      const start = await app.inject({
        method: "POST",
        url: `/contracts/rental/${token}/payment`,
        headers: { "idempotency-key": key },
      });
      if (start.statusCode !== 200) return start;
      payments.confirm();
      return app.inject({
        method: "GET",
        url: `/contracts/payments/status/${start.json().data.statusToken as string}`,
      });
    }
    const [payA, payB] = await Promise.all([
      tryPayRental(tokenA, `race-${idA}`),
      tryPayRental(tokenB, `race-${idB}`),
    ]);
    const codes = [payA.statusCode, payB.statusCode].sort();
    assert.deepEqual(codes, [200, 409]);
    const failed = payA.statusCode === 409 ? payA : payB;
    assert.equal(failed.json().error.context.reason, "VEHICLE_ALREADY_RENTED");
  });

  test("REVIEW after Car-In is not currentRental and close does not steal a newer rental", async () => {
    const v = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(),
      payload: { vehicleName: `CT-REV-${run}`, plateNumber: `CT R ${run}` },
    });
    const vid = v.json().data.id as number;
    const { normalizeEmail } = await import("src/lib/security/normalize");
    const actor = await prisma.user.findUniqueOrThrow({
      where: { email: normalizeEmail(admin.email) },
    });
    const customer = await prisma.customer.create({ data: { name: `CT Review ${run}` } });
    const old = await prisma.contract.create({
      data: {
        contractNumber: `CT-OLD-${run}`,
        status: "REVIEW",
        vehicleId: vid,
        customerId: customer.id,
        createdByUserId: actor.id,
        priceType: "DAILY",
        rentalDays: 2,
        agreedAmount: 800,
        depositAmount: 0,
        carOut: {
          create: {
            performedByUserId: actor.id,
            occurredAt: new Date("2026-09-01T08:00:00.000Z"),
            mileageOut: 10,
            fuelOut: "F",
          },
        },
        carIn: {
          create: {
            occurredAt: new Date("2026-09-01T11:00:00.000Z"),
            mileageIn: 40,
            fuelIn: "1/2",
          },
        },
        reconciliation: {
          create: {
            chargesTotal: 0,
            depositAmount: 0,
            deductions: 0,
            finalAmount: 0,
            approvedAt: new Date("2026-09-01T11:20:00.000Z"),
          },
        },
      },
    });
    await prisma.vehicle.update({ where: { id: vid }, data: { operationalStatus: "AVAILABLE" } });
    const idle = await app.inject({ method: "GET", url: `/vehicles/${vid}`, headers: auth() });
    assert.equal(idle.json().data.operationalStatus, "available");
    assert.equal(idle.json().data.currentRental, null);

    const next = await prisma.contract.create({
      data: {
        contractNumber: `CT-NEW-${run}`,
        status: "PAID",
        vehicleId: vid,
        customerId: customer.id,
        createdByUserId: actor.id,
        priceType: "DAILY",
        rentalDays: 2,
        agreedAmount: 900,
      },
    });
    await prisma.contractPayment.create({
      data: {
        contractId: next.id,
        purpose: "RENTAL",
        targetId: next.id,
        amount: 900,
        method: "MANUAL",
        status: "CONFIRMED",
        confirmedAt: new Date(),
        createdByUserId: actor.id,
      },
    });
    const photos = await dummyPhotos();
    const out = await app.inject({
      method: "POST",
      url: `/contracts/${next.id}/car-out`,
      headers: auth(),
      payload: { mileageOut: 50, fuelOut: "F", photos },
    });
    assert.equal(out.statusCode, 200, out.body);
    const rented = await app.inject({ method: "GET", url: `/vehicles/${vid}`, headers: auth() });
    assert.equal(rented.json().data.operationalStatus, "rented");
    assert.equal(rented.json().data.currentRental.contractId, next.id);

    const closeOld = await app.inject({
      method: "POST",
      url: `/contracts/${old.id}/close`,
      headers: auth(),
    });
    assert.equal(closeOld.statusCode, 200, closeOld.body);
    assert.equal(closeOld.json().data.status, "CLOSED");
    const still = await app.inject({ method: "GET", url: `/vehicles/${vid}`, headers: auth() });
    assert.equal(still.json().data.operationalStatus, "rented");
    assert.equal(still.json().data.currentRental.contractId, next.id);
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

  test("legacy stored deposit values do not reduce reconciliation finalAmount in API output", async () => {
    const v = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(),
      payload: { vehicleName: `CT-DEP-${run}`, plateNumber: `CT D ${run}` },
    });
    const vid = v.json().data.id as number;
    const actor = await prisma.user.findUniqueOrThrow({
      where: { email: (await import("src/lib/security/normalize")).normalizeEmail(admin.email) },
    });
    const customer = await prisma.customer.create({ data: { name: `CT Dep ${run}` } });
    const legacy = await prisma.contract.create({
      data: {
        contractNumber: `CT-DEP-${run}`,
        status: "REVIEW",
        vehicleId: vid,
        customerId: customer.id,
        createdByUserId: actor.id,
        priceType: "DAILY",
        rentalDays: 2,
        agreedAmount: 800,
        depositAmount: 500,
        carOut: {
          create: {
            performedByUserId: actor.id,
            occurredAt: new Date("2026-09-01T08:00:00.000Z"),
            mileageOut: 10,
            fuelOut: "F",
          },
        },
        carIn: {
          create: {
            occurredAt: new Date("2026-09-01T11:00:00.000Z"),
            mileageIn: 40,
            fuelIn: "1/2",
          },
        },
        reconciliation: {
          create: {
            chargesTotal: 570,
            depositAmount: 500,
            deductions: 500,
            finalAmount: 70,
            approvedAt: new Date("2026-09-01T11:20:00.000Z"),
            lines: {
              create: [
                { type: "DAMAGE", description: "damage", amount: 300 },
                { type: "FUEL", description: "fuel", amount: 50 },
                { type: "LATE", description: "late", amount: 100 },
                { type: "VIOLATION", description: "rta", amount: 120 },
              ],
            },
          },
        },
      },
    });

    const detail = await app.inject({
      method: "GET",
      url: `/contracts/${legacy.id}`,
      headers: auth(),
    });
    assert.equal(detail.statusCode, 200, detail.body);
    assert.equal(detail.json().data.reconciliation.chargesTotal, 570);
    assert.equal(detail.json().data.reconciliation.finalAmount, 570);
    assert.equal(detail.json().data.depositAmount, undefined);
  });
  });
}
