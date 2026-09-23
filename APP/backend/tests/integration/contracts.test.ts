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
} from "../helpers/fake-payment-provider";
import { settlePayment, startReconciliationPayment } from "../helpers/payment-integration-helpers";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

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
  async function dummyPhotos(angles: readonly string[] = INSPECTION_ANGLES) {
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
    return angles.map((angle, i) => ({ attachmentId: ids[i]!, angle }));
  }

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lV8AAAAASUVORK5CYII=", "base64");
  function multipart(bytes: Buffer, mime = "image/png") {
    const boundary = `diamond-${run}`;
    return {
      headers: { ...auth(), "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="evidence.png"\r\nContent-Type: ${mime}\r\n\r\n`),
        bytes,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]),
    };
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
      payload: { companyId: await testCompanyId(prisma), vehicleName: `CT-AVAIL-${run}`, plateNumber: `CT A ${run}`, dailyRate: 400 },
    });
    assert.equal(available.statusCode, 201, available.body);
    vehicleId = available.json().data.id;

    const service = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(),
      payload: { companyId: await testCompanyId(prisma), vehicleName: `CT-SVC-${run}`, plateNumber: `CT S ${run}` },
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
          collectionMode: "ELECTRONIC",
      },
    });
    assert.equal(res.statusCode, 409);
    assert.equal(res.json().error.context.reason, "VEHICLE_NOT_AVAILABLE");
  });

  test("PAID reserves an available vehicle and only its Contract can enter Car-Out", async () => {
    const actor = await prisma.user.findUniqueOrThrow({ where: { email: (await import("src/lib/security/normalize")).normalizeEmail(admin.email) } });
    const vehicleResponse = await app.inject({
      method: "POST", url: "/vehicles", headers: auth(),
      payload: { companyId: await testCompanyId(prisma), vehicleName: `CT-RSV-${run}`, plateNumber: `CT RSV ${run}` },
    });
    assert.equal(vehicleResponse.statusCode, 201, vehicleResponse.body);
    const reservedVehicleId = vehicleResponse.json().data.id as number;
    const otherOffer = await app.inject({
      method: "POST", url: "/contracts/offers", headers: auth(),
      payload: { vehicleId: reservedVehicleId, priceType: "DAILY", rentalDays: 2, agreedAmount: 700 , collectionMode: "ELECTRONIC"},
    });
    assert.equal(otherOffer.statusCode, 201, otherOffer.body);
    const otherId = otherOffer.json().data.id as string;
    await prisma.contract.update({ where: { id: otherId }, data: { status: "SIGNED" } });
    const paidContract = await prisma.contract.create({
      data: {
        companyId: await testCompanyId(prisma),
        contractNumber: `CT-RSV-PAID-${run}`, status: "PAID", vehicleId: reservedVehicleId,
        createdByUserId: actor.id, priceType: "DAILY", rentalDays: 2, agreedAmount: 800,
          collectionMode: "ELECTRONIC",
      },
    });
    await prisma.contractPayment.create({
      data: { contractId: paidContract.id, purpose: "RENTAL", targetId: paidContract.id,
        amount: 800, method: "CARD", provider: "stripe", status: "CONFIRMED", confirmedAt: new Date() },
    });

    const fleet = await app.inject({ method: "GET", url: `/vehicles/${reservedVehicleId}`, headers: auth() });
    assert.equal(fleet.statusCode, 200, fleet.body);
    assert.equal(fleet.json().data.operationalStatus, "available");
    assert.equal(fleet.json().data.reservation.isReserved, true);
    assert.equal(fleet.json().data.reservation.contractId, paidContract.id);
    assert.equal(fleet.json().data.reservation.contractNumber, paidContract.contractNumber);
    assert.equal(fleet.json().data.isBookable, false);
    const fleetList = await app.inject({ method: "GET", url: `/vehicles?search=${encodeURIComponent(`CT RSV ${run}`)}`, headers: auth() });
    const reservedCard = fleetList.json().data.find((item: { id: number }) => item.id === reservedVehicleId);
    assert.equal(reservedCard?.reservation.isReserved, true);
    assert.equal(reservedCard?.isBookable, false);
    const detail = await app.inject({ method: "GET", url: `/contracts/${paidContract.id}`, headers: auth() });
    assert.equal(detail.json().data.actions.canCarOut, true);
    const signedDetail = await app.inject({ method: "GET", url: `/contracts/${otherId}`, headers: auth() });
    assert.equal(signedDetail.json().data.status, "SIGNED");
    assert.equal(signedDetail.json().data.actions.canCarOut, false);
    const list = await app.inject({ method: "GET", url: `/contracts?search=${paidContract.contractNumber}`, headers: auth() });
    assert.equal(list.json().data[0].actions.canCarOut, true);

    const blockedOffer = await app.inject({
      method: "POST", url: "/contracts/offers", headers: auth(),
      payload: { vehicleId: reservedVehicleId, priceType: "DAILY", rentalDays: 1, agreedAmount: 500 , collectionMode: "ELECTRONIC"},
    });
    assert.equal(blockedOffer.statusCode, 409);
    assert.equal(blockedOffer.json().error.context.reason, "VEHICLE_ALREADY_RENTED");
    const blockedLink = await app.inject({ method: "POST", url: `/contracts/${otherId}/rental-link`, headers: auth() });
    assert.equal(blockedLink.statusCode, 409);
    const photos = await dummyPhotos(CAR_OUT_REQUIRED_ANGLES);
    const signature = await prisma.attachment.create({
      data: { originalName: "out-signature.png", storageKey: `ct-out-signature-${run}.png`, mimeType: "image/png", size: png.length },
    });

    await prisma.vehicle.update({ where: { id: reservedVehicleId }, data: { operationalStatus: "SERVICE" } });
    const serviceDetail = await app.inject({ method: "GET", url: `/contracts/${paidContract.id}`, headers: auth() });
    assert.equal(serviceDetail.json().data.actions.canCarOut, false);
    const serviceOut = await app.inject({ method: "POST", url: `/contracts/${paidContract.id}/car-out`, headers: auth(), payload: { mileageOut: 10, fuelOut: "F", photos, hirerSignatureAttachmentId: signature.id } });
    assert.equal(serviceOut.statusCode, 409);
    await prisma.vehicle.update({ where: { id: reservedVehicleId }, data: { operationalStatus: "RENTED" } });
    const rentedOut = await app.inject({ method: "POST", url: `/contracts/${paidContract.id}/car-out`, headers: auth(), payload: { mileageOut: 10, fuelOut: "F", photos, hirerSignatureAttachmentId: signature.id } });
    assert.equal(rentedOut.statusCode, 409);

    await prisma.vehicle.update({ where: { id: reservedVehicleId }, data: { operationalStatus: "AVAILABLE" } });
    const conflict = await prisma.contract.create({
      data: { companyId: await testCompanyId(prisma), contractNumber: `CT-RSV-CONFLICT-${run}`, status: "ACTIVE", vehicleId: reservedVehicleId,
        createdByUserId: actor.id, priceType: "DAILY", rentalDays: 1, agreedAmount: 300 },
    });
    const contested = await app.inject({ method: "GET", url: `/contracts/${paidContract.id}`, headers: auth() });
    assert.equal(contested.json().data.actions.canCarOut, false);
    const contestedOut = await app.inject({ method: "POST", url: `/contracts/${paidContract.id}/car-out`, headers: auth(), payload: { mileageOut: 10, fuelOut: "F", photos, hirerSignatureAttachmentId: signature.id } });
    assert.equal(contestedOut.statusCode, 409);
    assert.equal(contestedOut.json().error.context.reason, "VEHICLE_ALREADY_RENTED");
    await prisma.contract.update({ where: { id: conflict.id }, data: { status: "CLOSED" } });

    const out = await app.inject({ method: "POST", url: `/contracts/${paidContract.id}/car-out`, headers: auth(), payload: { mileageOut: 10, fuelOut: "F", photos, hirerSignatureAttachmentId: signature.id } });
    assert.equal(out.statusCode, 200, out.body);
    assert.equal(out.json().data.status, "ACTIVE");
    const after = await app.inject({ method: "GET", url: `/vehicles/${reservedVehicleId}`, headers: auth() });
    assert.equal(after.json().data.operationalStatus, "rented");
    assert.equal(after.json().data.reservation.isReserved, false);
    assert.equal(after.json().data.isBookable, false);
  });

  test("PAID Car-Out draft saves evidence and completes one immutable handover", async () => {
    const actor = await prisma.user.findUniqueOrThrow({ where: { email: (await import("src/lib/security/normalize")).normalizeEmail(admin.email) } });
    const vehicle = await app.inject({ method: "POST", url: "/vehicles", headers: auth(),
      payload: { companyId: await testCompanyId(prisma), vehicleName: `CT-OUT-${run}`, plateNumber: `CT OUT ${run}` } });
    assert.equal(vehicle.statusCode, 201, vehicle.body);
    const vehicleOutId = vehicle.json().data.id as number;
    const signed = await app.inject({ method: "POST", url: "/contracts/offers", headers: auth(),
      payload: { vehicleId: vehicleOutId, priceType: "DAILY", rentalDays: 2, agreedAmount: 600 , collectionMode: "ELECTRONIC"} });
    assert.equal(signed.statusCode, 201, signed.body);
    const contractId = signed.json().data.id as string;
    await prisma.contract.update({ where: { id: contractId }, data: { status: "SIGNED" } });
    const signedDraft = await app.inject({ method: "PATCH", url: `/contracts/${contractId}/car-out`, headers: auth(), payload: { mileageOut: 10 } });
    assert.equal(signedDraft.statusCode, 409);
    await prisma.contract.update({ where: { id: contractId }, data: { status: "PAID" } });
    await prisma.contractPayment.create({ data: { contractId, purpose: "RENTAL", targetId: contractId,
      amount: 600, method: "CARD", provider: "stripe", status: "CONFIRMED", confirmedAt: new Date() } });

    const invalidMileage = await app.inject({ method: "PATCH", url: `/contracts/${contractId}/car-out`, headers: auth(), payload: { mileageOut: "ten" } });
    assert.equal(invalidMileage.statusCode, 422);
    const invalidFuel = await app.inject({ method: "PATCH", url: `/contracts/${contractId}/car-out`, headers: auth(), payload: { fuelOut: "FULL" } });
    assert.equal(invalidFuel.statusCode, 422);
    const draft = await app.inject({ method: "PATCH", url: `/contracts/${contractId}/car-out`, headers: auth(),
      payload: { mileageOut: 123, fuelOut: "3/4", damageOut: [{ zone: "TOP.HOOD", type: "SCRATCH" }] } });
    assert.equal(draft.statusCode, 200, draft.body);
    assert.equal(draft.json().data.status, "DRAFT");
    assert.deepEqual(draft.json().data.damageOut, [{ zone: "TOP.HOOD", type: "SCRATCH" }]);
    const noDamage = await app.inject({ method: "PATCH", url: `/contracts/${contractId}/car-out`, headers: auth(), payload: { damageOut: [] } });
    assert.equal(noDamage.statusCode, 200, noDamage.body);
    assert.deepEqual(noDamage.json().data.damageOut, []);
    const restoredDamage = await app.inject({ method: "PATCH", url: `/contracts/${contractId}/car-out`, headers: auth(),
      payload: { damageOut: [{ zone: "TOP.HOOD", type: "SCRATCH" }] } });
    assert.equal(restoredDamage.statusCode, 200, restoredDamage.body);
    const fleetDraft = await app.inject({ method: "GET", url: `/vehicles/${vehicleOutId}`, headers: auth() });
    assert.equal(fleetDraft.json().data.operationalStatus, "available");
    assert.equal(fleetDraft.json().data.reservation.isReserved, true);
    assert.equal(fleetDraft.json().data.isBookable, false);
    const missing = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-out/complete`, headers: auth() });
    assert.equal(missing.statusCode, 422);
    assert.equal((await prisma.contract.findUniqueOrThrow({ where: { id: contractId } })).status, "PAID");

    const invalidImage = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-out/photos?angle=FRONT`, ...multipart(Buffer.from("not an image")) });
    assert.equal(invalidImage.statusCode, 422);
    const wrongMime = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-out/photos?angle=FRONT`, ...multipart(png, "application/pdf") });
    assert.equal(wrongMime.statusCode, 422);
    const oversized = Buffer.concat([png, Buffer.alloc(5_242_881)]);
    const tooLarge = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-out/photos?angle=FRONT`, ...multipart(oversized) });
    assert.equal(tooLarge.statusCode, 413);
    for (const angle of CAR_OUT_REQUIRED_ANGLES) {
      const uploaded = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-out/photos?angle=${angle}`, ...multipart(png) });
      assert.equal(uploaded.statusCode, 200, `${angle}: ${uploaded.body}`);
    }
    const progress = await app.inject({ method: "GET", url: `/contracts/${contractId}/car-out`, headers: auth() });
    assert.equal(progress.json().data.photoEvidence.completed, 8);
    assert.equal(progress.json().data.photoEvidence.complete, true);
    assert.equal(progress.json().data.status, "DRAFT");
    const oldFrontId = progress.json().data.photoEvidence.photos.find((p: { angle: string }) => p.angle === "FRONT").id as string;
    const replaced = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-out/photos?angle=FRONT`, ...multipart(png) });
    assert.equal(replaced.statusCode, 200, replaced.body);
    const frontId = replaced.json().data.photoEvidence.photos.find((p: { angle: string }) => p.angle === "FRONT").id as string;
    assert.equal(frontId, oldFrontId);
    const deleted = await app.inject({ method: "DELETE", url: `/contracts/${contractId}/car-out/photos/${frontId}`, headers: auth() });
    assert.equal(deleted.statusCode, 200, deleted.body);
    assert.equal(deleted.json().data.photoEvidence.completed, 7);
    const retaken = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-out/photos?angle=FRONT`, ...multipart(png) });
    assert.equal(retaken.statusCode, 200, retaken.body);
    const optionalPhoto = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-out/photos?angle=LEFT`, ...multipart(png) });
    assert.equal(optionalPhoto.statusCode, 200, optionalPhoto.body);
    assert.equal(optionalPhoto.json().data.photoEvidence.completed, 8);

    const legalAttachment = await prisma.attachment.create({ data: { originalName: "legal.png", storageKey: `ct-legal-${run}.png`, mimeType: "image/png", size: png.length } });
    await prisma.officialContractSignature.create({ data: { contractId, slot: "HIRER", attachmentId: legalAttachment.id, capturedAt: new Date() } });
    const noOutSignature = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-out/complete`, headers: auth() });
    assert.equal(noOutSignature.statusCode, 422);
    const outSignature = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-out/signature`, ...multipart(png) });
    assert.equal(outSignature.statusCode, 200, outSignature.body);
    assert.equal(outSignature.json().data.status, "READY");
    await prisma.vehicle.update({ where: { id: vehicleOutId }, data: { operationalStatus: "SERVICE" } });
    const serviceBlocked = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-out/complete`, headers: auth() });
    assert.equal(serviceBlocked.statusCode, 409);
    await prisma.vehicle.update({ where: { id: vehicleOutId }, data: { operationalStatus: "RENTED" } });
    const rentedBlocked = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-out/complete`, headers: auth() });
    assert.equal(rentedBlocked.statusCode, 409);
    await prisma.vehicle.update({ where: { id: vehicleOutId }, data: { operationalStatus: "AVAILABLE" } });
    assert.equal((await prisma.contract.findUniqueOrThrow({ where: { id: contractId } })).status, "PAID");
    const conflict = await prisma.contract.create({ data: {
      companyId: await testCompanyId(prisma),
      contractNumber: `CT-OUT-CONFLICT-${run}`, status: "ACTIVE", vehicleId: vehicleOutId,
      createdByUserId: actor.id, priceType: "DAILY", rentalDays: 1, agreedAmount: 100,
          collectionMode: "ELECTRONIC",
    } });
    const conflictBlocked = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-out/complete`, headers: auth() });
    assert.equal(conflictBlocked.statusCode, 409);
    await prisma.contract.update({ where: { id: conflict.id }, data: { status: "CLOSED" } });
    const before = Date.now();
    const [first, second] = await Promise.all([
      app.inject({ method: "POST", url: `/contracts/${contractId}/car-out/complete`, headers: auth() }),
      app.inject({ method: "POST", url: `/contracts/${contractId}/car-out/complete`, headers: auth() }),
    ]);
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(second.statusCode, 200, second.body);
    assert.equal(first.json().data.carOut.id, second.json().data.carOut.id);
    const completed = first.json().data;
    assert.equal(completed.status, "ACTIVE");
    assert.equal(completed.carOutHandover.status, "COMPLETED");
    assert.ok(Date.parse(completed.carOutHandover.actualHandoverAt) >= before);
    assert.equal(completed.carOutHandover.photoEvidence.photos.length, 9);
    assert.deepEqual(completed.carOutHandover.damageOut, [{ zone: "TOP.HOOD", type: "SCRATCH" }]);
    assert.equal((await prisma.contractCarOut.count({ where: { contractId } })), 1);
    assert.equal((await prisma.contract.findUniqueOrThrow({ where: { id: contractId }, include: { carIn: true } })).carIn, null);
    const fleetAfter = await app.inject({ method: "GET", url: `/vehicles/${vehicleOutId}`, headers: auth() });
    assert.equal(fleetAfter.json().data.operationalStatus, "rented");
    assert.equal(fleetAfter.json().data.reservation.isReserved, false);
    const editAfter = await app.inject({ method: "PATCH", url: `/contracts/${contractId}/car-out`, headers: auth(), payload: { mileageOut: 999 } });
    assert.equal(editAfter.statusCode, 409);
    const photoAfter = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-out/photos?angle=FRONT`, ...multipart(png) });
    assert.equal(photoAfter.statusCode, 409);
    const deleteAfter = await app.inject({ method: "DELETE", url: `/contracts/${contractId}/car-out/photos/${frontId}`, headers: auth() });
    assert.equal(deleteAfter.statusCode, 409);
    const signatureAfter = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-out/signature`, ...multipart(png) });
    assert.equal(signatureAfter.statusCode, 409);
    const saved = await prisma.contractCarOut.findUniqueOrThrow({ where: { contractId } });
    assert.equal(saved.mileageOut, 123);
    assert.equal(saved.fuelOut, "3/4");
    assert.equal(saved.vehicleId, vehicleOutId);
    assert.notEqual(saved.hirerSignatureAttachmentId, legalAttachment.id);
    assert.equal(saved.occurredAt.getTime() >= before, true);
    assert.equal(actor.id, saved.performedByUserId);
  });

  test("RETOUT Car-In draft saves evidence and completes one immutable handover with a mandatory signature", async () => {
    const actor = await prisma.user.findUniqueOrThrow({ where: { email: (await import("src/lib/security/normalize")).normalizeEmail(admin.email) } });
    const vehicle = await app.inject({ method: "POST", url: "/vehicles", headers: auth(),
      payload: { companyId: await testCompanyId(prisma), vehicleName: `CT-IN-${run}`, plateNumber: `CT IN ${run}` } });
    assert.equal(vehicle.statusCode, 201, vehicle.body);
    const vehicleInId = vehicle.json().data.id as number;
    const signed = await app.inject({ method: "POST", url: "/contracts/offers", headers: auth(),
      payload: { vehicleId: vehicleInId, priceType: "DAILY", rentalDays: 2, agreedAmount: 600 , collectionMode: "ELECTRONIC"} });
    assert.equal(signed.statusCode, 201, signed.body);
    const contractId = signed.json().data.id as string;

    const notRetoutDraft = await app.inject({ method: "PATCH", url: `/contracts/${contractId}/car-in`, headers: auth(), payload: { mileageIn: 10 } });
    assert.equal(notRetoutDraft.statusCode, 409);
    const notRetoutComplete = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-in/complete`, headers: auth() });
    assert.equal(notRetoutComplete.statusCode, 409);

    await prisma.contract.update({ where: { id: contractId }, data: { status: "RETOUT" } });
    await prisma.vehicle.update({ where: { id: vehicleInId }, data: { operationalStatus: "RENTED" } });

    const noCarOutDraft = await app.inject({ method: "PATCH", url: `/contracts/${contractId}/car-in`, headers: auth(), payload: { mileageIn: 10 } });
    assert.equal(noCarOutDraft.statusCode, 409);
    assert.equal(noCarOutDraft.json().error.context.reason, "CONTRACT_CAR_OUT_REQUIRED");

    await prisma.contractCarOut.create({ data: {
      contractId, performedByUserId: actor.id, occurredAt: new Date(), mileageOut: 10, fuelOut: "F",
    } });

    const invalidMileage = await app.inject({ method: "PATCH", url: `/contracts/${contractId}/car-in`, headers: auth(), payload: { mileageIn: "ten" } });
    assert.equal(invalidMileage.statusCode, 422);
    const invalidFuel = await app.inject({ method: "PATCH", url: `/contracts/${contractId}/car-in`, headers: auth(), payload: { fuelIn: "FULL" } });
    assert.equal(invalidFuel.statusCode, 422);

    const emptyState = await app.inject({ method: "GET", url: `/contracts/${contractId}/car-in`, headers: auth() });
    assert.equal(emptyState.statusCode, 200, emptyState.body);
    assert.equal(emptyState.json().data.status, "NOT_STARTED");
    assert.equal(emptyState.json().data.mileageIn, null);
    assert.equal(emptyState.json().data.signature.present, false);

    const draft = await app.inject({ method: "PATCH", url: `/contracts/${contractId}/car-in`, headers: auth(),
      payload: { mileageIn: 321, fuelIn: "1/4", damageIn: [{ zone: "LEFT.FRONT_DOOR", type: "DENT" }] } });
    assert.equal(draft.statusCode, 200, draft.body);
    assert.equal(draft.json().data.status, "DRAFT");
    assert.deepEqual(draft.json().data.damageIn, [{ zone: "LEFT.FRONT_DOOR", type: "DENT" }]);
    const notesLater = await app.inject({ method: "PATCH", url: `/contracts/${contractId}/car-in`, headers: auth(), payload: { notes: "customer late" } });
    assert.equal(notesLater.statusCode, 200, notesLater.body);

    const restored = await app.inject({ method: "GET", url: `/contracts/${contractId}/car-in`, headers: auth() });
    assert.equal(restored.json().data.mileageIn, 321);
    assert.equal(restored.json().data.fuelIn, "1/4");
    assert.equal(restored.json().data.notes, "customer late");
    assert.deepEqual(restored.json().data.damageIn, [{ zone: "LEFT.FRONT_DOOR", type: "DENT" }]);

    assert.equal((await prisma.contract.findUniqueOrThrow({ where: { id: contractId } })).status, "RETOUT");
    assert.equal((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleInId } })).operationalStatus, "RENTED");

    const missingSignatureAndPhotos = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-in/complete`, headers: auth() });
    assert.equal(missingSignatureAndPhotos.statusCode, 422);
    assert.equal((await prisma.contract.findUniqueOrThrow({ where: { id: contractId } })).status, "RETOUT");

    // The old Car-In-only vocabulary (INSPECTION_ANGLES) is rejected on the new staged endpoint.
    const oldAngle = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-in/photos?angle=TIRES`, ...multipart(png) });
    assert.equal(oldAngle.statusCode, 422);

    const invalidImage = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-in/photos?angle=FRONT`, ...multipart(Buffer.from("not an image")) });
    assert.equal(invalidImage.statusCode, 422);
    for (const angle of CAR_OUT_REQUIRED_ANGLES) {
      const uploaded = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-in/photos?angle=${angle}`, ...multipart(png) });
      assert.equal(uploaded.statusCode, 200, `${angle}: ${uploaded.body}`);
    }
    const progress = await app.inject({ method: "GET", url: `/contracts/${contractId}/car-in`, headers: auth() });
    assert.equal(progress.json().data.photoEvidence.completed, 8);
    assert.equal(progress.json().data.photoEvidence.complete, true);
    assert.equal(progress.json().data.status, "DRAFT");
    const oldFrontId = progress.json().data.photoEvidence.photos.find((p: { angle: string }) => p.angle === "FRONT").id as string;
    const replaced = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-in/photos?angle=FRONT`, ...multipart(png) });
    assert.equal(replaced.statusCode, 200, replaced.body);
    const frontId = replaced.json().data.photoEvidence.photos.find((p: { angle: string }) => p.angle === "FRONT").id as string;
    assert.equal(frontId, oldFrontId);

    const optionalPhoto = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-in/photos?angle=LEFT`, ...multipart(png) });
    assert.equal(optionalPhoto.statusCode, 200, optionalPhoto.body);
    assert.equal(optionalPhoto.json().data.photoEvidence.completed, 8);
    const leftId = optionalPhoto.json().data.photoEvidence.photos.find((p: { angle: string }) => p.angle === "LEFT").id as string;
    const deletedOptional = await app.inject({ method: "DELETE", url: `/contracts/${contractId}/car-in/photos/${leftId}`, headers: auth() });
    assert.equal(deletedOptional.statusCode, 200, deletedOptional.body);
    assert.equal(deletedOptional.json().data.photoEvidence.completed, 8);

    const stillMissingSignature = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-in/complete`, headers: auth() });
    assert.equal(stillMissingSignature.statusCode, 422);

    const wrongMimeSignature = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-in/signature`, ...multipart(png, "application/pdf") });
    assert.equal(wrongMimeSignature.statusCode, 422);
    const inSignature = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-in/signature`, ...multipart(png) });
    assert.equal(inSignature.statusCode, 200, inSignature.body);
    assert.equal(inSignature.json().data.status, "READY");
    assert.equal(inSignature.json().data.signature.present, true);

    const streamed = await app.inject({ method: "GET", url: `/contracts/${contractId}/car-in/signature/stream`, headers: auth() });
    assert.equal(streamed.statusCode, 200);

    await prisma.vehicle.update({ where: { id: vehicleInId }, data: { operationalStatus: "SERVICE" } });
    const serviceBlocked = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-in/complete`, headers: auth() });
    assert.equal(serviceBlocked.statusCode, 409);
    assert.equal(serviceBlocked.json().error.context.reason, "VEHICLE_NOT_RENTED");
    await prisma.vehicle.update({ where: { id: vehicleInId }, data: { operationalStatus: "RENTED" } });

    const before = Date.now();
    const [first, second] = await Promise.all([
      app.inject({ method: "POST", url: `/contracts/${contractId}/car-in/complete`, headers: auth() }),
      app.inject({ method: "POST", url: `/contracts/${contractId}/car-in/complete`, headers: auth() }),
    ]);
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(second.statusCode, 200, second.body);
    assert.equal(first.json().data.carIn.id, second.json().data.carIn.id);
    const completed = first.json().data;
    assert.equal(completed.status, "REVIEW");
    assert.equal(completed.carInHandover.status, "COMPLETED");
    assert.ok(Date.parse(completed.carInHandover.actualReturnAt) >= before);
    assert.equal(completed.carInHandover.photoEvidence.photos.length, 8);
    assert.deepEqual(completed.carInHandover.damageIn, [{ zone: "LEFT.FRONT_DOOR", type: "DENT" }]);
    assert.equal(completed.carInHandover.signature.present, true);
    assert.equal((await prisma.contractCarIn.count({ where: { contractId } })), 1);
    const finalVehicle = await app.inject({ method: "GET", url: `/vehicles/${vehicleInId}`, headers: auth() });
    assert.equal(finalVehicle.json().data.operationalStatus, "available");

    const draftAfter = await app.inject({ method: "PATCH", url: `/contracts/${contractId}/car-in`, headers: auth(), payload: { mileageIn: 999 } });
    assert.equal(draftAfter.statusCode, 409);
    const photoAfter = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-in/photos?angle=FRONT`, ...multipart(png) });
    assert.equal(photoAfter.statusCode, 409);
    const deleteAfter = await app.inject({ method: "DELETE", url: `/contracts/${contractId}/car-in/photos/${frontId}`, headers: auth() });
    assert.equal(deleteAfter.statusCode, 409);
    const signatureAfter = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-in/signature`, ...multipart(png) });
    assert.equal(signatureAfter.statusCode, 409);

    const savedRow = await prisma.contractCarIn.findUniqueOrThrow({ where: { contractId } });
    assert.equal(savedRow.mileageIn, 321);
    assert.equal(savedRow.fuelIn, "1/4");
    assert.equal(savedRow.notes, "customer late");
    assert.equal(savedRow.occurredAt.getTime() >= before, true);
  });

  test("full lifecycle: form → signed → paid → car-out → return → car-in → close", async () => {
    const vehicleRes = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(),
      payload: { companyId: await testCompanyId(prisma), vehicleName: `CT-LIFE-${run}`, plateNumber: `CT L ${run}`, dailyRate: 400 },
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
          collectionMode: "ELECTRONIC",
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
    await prisma.contractCardPaymentMethod.create({
      data: {
        contractId, provider: "stripe", stripeCustomerId: `cus_test_${run}`,
        stripePaymentMethodId: `pm_test_${run}`, cardBrand: "visa", cardLast4: "4242",
      },
    });
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

    const outPhotos = await dummyPhotos(CAR_OUT_REQUIRED_ANGLES);
    const carOut = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/car-out`,
      headers: auth(),
      payload: {
        mileageOut: 1000,
        fuelOut: "F",
        photos: outPhotos,
        damage: [{ zone: "TOP.HOOD", type: "SCRATCH" }],
        hirerSignatureAttachmentId: (await prisma.attachment.create({
          data: { originalName: "out-signature.png", storageKey: `ct-life-sig-${run}.png`, mimeType: "image/png", size: 8 },
        })).id,
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
    // Issuing and opening the link does not start the return.
    assert.equal(publicReturn.json().data.status, "ACTIVE");
    const stillActive = await app.inject({ method: "GET", url: `/contracts/${contractId}`, headers: auth() });
    assert.equal(stillActive.json().data.status, "ACTIVE");
    assert.equal(stillActive.json().data.actions.canRenew, true);
    assert.equal(stillActive.json().data.actions.canCarIn, false);
    const earlyCarIn = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/car-in`,
      headers: auth(),
      payload: { mileageIn: 1400, fuelIn: "1/2", photos: await dummyPhotos() },
    });
    assert.equal(earlyCarIn.statusCode, 409, earlyCarIn.body);

    const confirmReturn = await app.inject({ method: "POST", url: `/contracts/return/${returnToken}/confirm` });
    assert.equal(confirmReturn.statusCode, 200, confirmReturn.body);
    assert.equal(confirmReturn.json().data.status, "RETOUT");
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
    assert.equal(retoutDetail.json().data.actions.canRenew, false);
    const retoutList = await app.inject({
      method: "GET",
      url: `/contracts?search=${retoutDetail.json().data.contractNumber}`,
      headers: auth(),
    });
    const retoutRow = (retoutList.json().data as Array<{ id: string; actions: { canCarIn: boolean } }>)
      .find((row) => row.id === contractId);
    assert.equal(retoutRow?.actions.canCarIn, true);
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

    // `inPhotos` keeps the legacy INSPECTION_ANGLES shape only for the public
    // return-token re-hit below, which still goes through the untouched
    // legacy single-shot `persistCarIn` path.
    const inPhotos = await dummyPhotos();
    const draftSaved = await app.inject({
      method: "PATCH",
      url: `/contracts/${contractId}/car-in`,
      headers: auth(),
      payload: { mileageIn: 1400, fuelIn: "1/2", notes: "office return", damageIn: [{ zone: "LEFT.FRONT_DOOR", type: "DENT" }] },
    });
    assert.equal(draftSaved.statusCode, 200, draftSaved.body);
    for (const angle of CAR_OUT_REQUIRED_ANGLES) {
      const uploaded = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-in/photos?angle=${angle}`, ...multipart(png) });
      assert.equal(uploaded.statusCode, 200, `${angle}: ${uploaded.body}`);
    }
    const inSignatureUpload = await app.inject({ method: "POST", url: `/contracts/${contractId}/car-in/signature`, ...multipart(png) });
    assert.equal(inSignatureUpload.statusCode, 200, inSignatureUpload.body);
    const staffCarIn = await app.inject({
      method: "POST",
      url: `/contracts/${contractId}/car-in/complete`,
      headers: auth(),
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

    const reconciliationPayment = await startReconciliationPayment(app, token, contractId);
    payments.confirm();
    await settlePayment(app, payments, reconciliationPayment.payment.id);

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
      payload: { companyId: await testCompanyId(prisma), vehicleName: `CT-DBL-${run}`, plateNumber: `CT D ${run}` },
    });
    const vid = v.json().data.id as number;
    const a = await app.inject({
      method: "POST",
      url: "/contracts/offers",
      headers: auth(),
      payload: { vehicleId: vid, priceType: "DAILY", rentalDays: 2, agreedAmount: 800 , collectionMode: "ELECTRONIC"},
    });
    const b = await app.inject({
      method: "POST",
      url: "/contracts/offers",
      headers: auth(),
      payload: { vehicleId: vid, priceType: "DAILY", rentalDays: 2, agreedAmount: 900 , collectionMode: "ELECTRONIC"},
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
    for (const id of [idA, idB]) {
      await prisma.contractCardPaymentMethod.create({
        data: {
          contractId: id, provider: "stripe", stripeCustomerId: `cus_test_${id}`,
          stripePaymentMethodId: `pm_test_${id}`, cardBrand: "visa", cardLast4: "4242",
        },
      });
    }
    const [startA, startB] = await Promise.all([
      app.inject({ method: "POST", url: `/contracts/rental/${tokenA}/payment`, headers: { "idempotency-key": `race-${idA}` } }),
      app.inject({ method: "POST", url: `/contracts/rental/${tokenB}/payment`, headers: { "idempotency-key": `race-${idB}` } }),
    ]);
    assert.equal(startA.statusCode, 200, startA.body);
    assert.equal(startB.statusCode, 200, startB.body);
    const attemptA = await prisma.contractPayment.findFirstOrThrow({ where: { contractId: idA, purpose: "RENTAL" }, orderBy: { createdAt: "desc" } });
    const attemptB = await prisma.contractPayment.findFirstOrThrow({ where: { contractId: idB, purpose: "RENTAL" }, orderBy: { createdAt: "desc" } });
    payments.confirm(attemptA.providerReference!);
    payments.confirm(attemptB.providerReference!);
    const [payA, payB] = await Promise.all([
      app.inject({ method: "GET", url: `/contracts/payments/status/${startA.json().data.statusToken as string}` }),
      app.inject({ method: "GET", url: `/contracts/payments/status/${startB.json().data.statusToken as string}` }),
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
      payload: { companyId: await testCompanyId(prisma), vehicleName: `CT-REV-${run}`, plateNumber: `CT R ${run}` },
    });
    const vid = v.json().data.id as number;
    const { normalizeEmail } = await import("src/lib/security/normalize");
    const actor = await prisma.user.findUniqueOrThrow({
      where: { email: normalizeEmail(admin.email) },
    });
    const customer = await prisma.customer.create({ data: { name: `CT Review ${run}` } });
    const old = await prisma.contract.create({
      data: {
        companyId: await testCompanyId(prisma),
        contractNumber: `CT-OLD-${run}`,
        status: "REVIEW",
        vehicleId: vid,
        customerId: customer.id,
        createdByUserId: actor.id,
        priceType: "DAILY",
        rentalDays: 2,
        agreedAmount: 800,
          collectionMode: "ELECTRONIC",
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
        companyId: await testCompanyId(prisma),
        contractNumber: `CT-NEW-${run}`,
        status: "PAID",
        vehicleId: vid,
        customerId: customer.id,
        createdByUserId: actor.id,
        priceType: "DAILY",
        rentalDays: 2,
        agreedAmount: 900,
          collectionMode: "ELECTRONIC",
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
    const photos = await dummyPhotos(CAR_OUT_REQUIRED_ANGLES);
    const out = await app.inject({
      method: "POST",
      url: `/contracts/${next.id}/car-out`,
      headers: auth(),
      payload: {
        mileageOut: 50,
        fuelOut: "F",
        photos,
        hirerSignatureAttachmentId: (await prisma.attachment.create({
          data: { originalName: "out-signature.png", storageKey: `ct-next-sig-${run}.png`, mimeType: "image/png", size: 8 },
        })).id,
      },
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
          collectionMode: "ELECTRONIC",
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
      payload: {
        companyId: await testCompanyId(prisma),
        vehicleName: `CT-DEP-${run}`,
        plateNumber: `CT D ${run}`,
        dailyRate: 400,
      },
    });
    const vid = v.json().data.id as number;
    const actor = await prisma.user.findUniqueOrThrow({
      where: { email: (await import("src/lib/security/normalize")).normalizeEmail(admin.email) },
    });
    const customer = await prisma.customer.create({ data: { name: `CT Dep ${run}` } });
    const legacy = await prisma.contract.create({
      data: {
        companyId: await testCompanyId(prisma),
        contractNumber: `CT-DEP-${run}`,
        status: "REVIEW",
        vehicleId: vid,
        customerId: customer.id,
        createdByUserId: actor.id,
        priceType: "DAILY",
        rentalDays: 2,
        agreedAmount: 800,
          collectionMode: "ELECTRONIC",
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
