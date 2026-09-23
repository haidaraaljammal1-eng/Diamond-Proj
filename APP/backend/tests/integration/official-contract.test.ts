import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { createFakeDocumentOcrProvider } from "../helpers/fake-document-ocr-provider";
import { injectDocumentOcr, seedReadyIdentity } from "../helpers/public-identity";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "official contract integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("official contract — backend domain + public API", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = `OC${Date.now().toString(36).toUpperCase()}`;
    const admin = { email: `oc-admin-${run}@example.test`, password: "oc-admin-pass-123" };
    let staffToken = "";
    let staffUserId = 0;
    const auth = () => ({ authorization: `Bearer ${staffToken}` });

    let seq = 0;
    async function offer(input: { priceType?: string; rentalDays?: number; agreedAmount?: number } = {}) {
      seq += 1;
      const vehicleName = `OC-${run}-${seq}`;
      const vehicle = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(),
        payload: {
          companyId: await testCompanyId(prisma),
          vehicleName,
          plateNumber: `O${run}${seq}`.slice(0, 20),
          dailyRate: 350,
          color: "Silver",
          modelYear: 2024,
        },
      });
      assert.equal(vehicle.statusCode, 201, vehicle.body);
      const vehicleId = vehicle.json().data.id as number;
      const created = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(),
        payload: {
          vehicleId,
          priceType: input.priceType ?? "WEEKLY",
          rentalDays: input.rentalDays ?? 7,
          agreedAmount: input.agreedAmount ?? 2100,
          collectionMode: "ELECTRONIC",
        },
      });
      assert.equal(created.statusCode, 201, created.body);
      const contractId = created.json().data.id as string;
      const link = await app.inject({ method: "POST", url: `/contracts/${contractId}/rental-link`, headers: auth() });
      return {
        vehicleId,
        vehicleName,
        contractId,
        contractNumber: created.json().data.contractNumber as string,
        token: link.json().data.link.token as string,
      };
    }

    const getOfficial = (token: string) =>
      app.inject({ method: "GET", url: `/contracts/rental/${token}/official-contract` });
    const patchOfficial = (token: string, payload: Record<string, unknown>) =>
      app.inject({ method: "PATCH", url: `/contracts/rental/${token}/official-contract`, payload });

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("official contract integration refuses to run unless DATABASE_URL is haidara_test");
      }
      const { buildApp } = await import("src/app");
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      app = await buildApp();
      prisma = app.prisma;
      const role = await prisma.role.create({ data: { key: `oc_admin_${run}`, name: "oc admin" } });
      for (const key of ["vehicles.read", "vehicles.manage", "contracts.read", "contracts.manage"]) {
        const perm = await prisma.permission.upsert({
          where: { key },
          update: {},
          create: { key, category: key.split(".")[0]!, description: key },
        });
        await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
      }
      const user = await prisma.user.create({
        data: {
          email: normalizeEmail(admin.email),
          name: "oc admin",
          status: "ACTIVE",
          passwordHash: await hashPassword(admin.password),
        },
      });
      staffUserId = user.id;
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      staffToken = (await app.inject({ method: "POST", url: "/auth/login", payload: admin })).json().data
        .accessToken;
    });

    after(async () => {
      await injectDocumentOcr(undefined);
      if (app) await app.close();
    });

    test("assembles one DTO from Contract, Vehicle, normalized identity; nullable review fields", async () => {
      const ctx = await offer();
      await seedReadyIdentity(app, ctx.token, { licenseNumber: "DL-OC-1", expiryDate: "2031-02-03" });

      const res = await getOfficial(ctx.token);
      assert.equal(res.statusCode, 200, res.body);
      const v = res.json().data;
      assert.equal(v.contract.agreementNumber, ctx.contractNumber);
      assert.equal(v.contract.status, "AWAITING");
      assert.equal(v.contract.templateVersion, "DIAMOND_CONTRACT_V1");
      assert.equal(v.vehicle.vehicleType, ctx.vehicleName);
      assert.equal(v.vehicle.color, "Silver");
      assert.equal(v.vehicle.yearMade, 2024);
      assert.equal(v.vehicle.plateCode, null);
      assert.equal(v.hirer.name, "TEST PERSON");
      assert.equal(v.hirer.nationality, "TEST");
      assert.equal(v.hirer.passportNumber, "TEST123456");
      assert.equal(v.hirer.driverLicenseNumber, "DL-OC-1");
      assert.equal(v.hirer.driverLicenseExpiryDate, "2031-02-03");
      assert.equal(v.hirer.address, null);
      assert.equal(v.hirer.telephone, null);
      assert.deepEqual(v.additionalDriver, { name: null, nationality: null, driverLicenseNumber: null });
      assert.deepEqual(v.sponsor, { name: null, idNumber: null });
      assert.equal(v.rental.numberOfDays, 7);
      assert.equal(v.rental.periodConsistent, true);
      assert.equal(v.rental.includedKmPerDay, null);
      assert.equal(v.rental.extraKmRate, null);
      assert.equal(v.vehicleOut.status, "NOT_AVAILABLE");
      assert.equal(v.vehicleIn.status, "NOT_AVAILABLE");
      assert.equal(v.signatures.hirer.status, "NOT_SIGNED");
      assert.equal(v.permissions.canEdit, true);

      const body = res.body.toLowerCase();
      for (const banned of ["deposit", "\"cardnumber\"", "cvv", "expiry\":", "provider", "confidence", "storagekey", "attachmentid", "customerid", "vehicleid"]) {
        assert.equal(body.includes(banned), false, banned);
      }
    });

    test("price policy: official contract has no rental price; internal pricing unchanged", async () => {
      const ctx = await offer({ priceType: "DAILY", rentalDays: 3, agreedAmount: 7777 });
      await seedReadyIdentity(app, ctx.token);
      await prisma.vehicle.update({ where: { id: ctx.vehicleId }, data: { dailyRate: 9191, monthlyRate: 91919 } });

      const res = await getOfficial(ctx.token);
      assert.equal(res.statusCode, 200, res.body);
      for (const banned of [
        "rateAmount",
        "agreedAmount",
        "rateType",
        "priceType",
        "dailyRate",
        "weeklyRate",
        "monthlyRate",
        "currency",
        "7777",
        "9191",
        "91919",
        "DAILY",
      ]) {
        assert.equal(res.body.includes(banned), false, banned);
      }

      // Internal pricing is untouched and still served to staff and the payment flow.
      const contract = await prisma.contract.findUniqueOrThrow({ where: { id: ctx.contractId } });
      assert.equal(contract.agreedAmount, 7777);
      assert.equal(contract.priceType, "DAILY");
      const staff = await app.inject({ method: "GET", url: `/contracts/${ctx.contractId}`, headers: auth() });
      assert.equal(staff.statusCode, 200, staff.body);
      assert.equal(staff.json().data.agreedAmount, 7777);
      const rentalContext = await app.inject({ method: "GET", url: `/contracts/rental/${ctx.token}` });
      assert.equal(rentalContext.json().data.rental.agreedAmount, 7777);
    });

    test("GET does not mutate Vehicle or Customer", async () => {
      const ctx = await offer({ priceType: "DAILY", rentalDays: 3, agreedAmount: 777 });
      await seedReadyIdentity(app, ctx.token);
      const vehicleBefore = await prisma.vehicle.findUniqueOrThrow({ where: { id: ctx.vehicleId } });
      const customersBefore = await prisma.customer.count();

      assert.equal((await getOfficial(ctx.token)).statusCode, 200);

      const vehicleAfter = await prisma.vehicle.findUniqueOrThrow({ where: { id: ctx.vehicleId } });
      assert.equal(vehicleAfter.operationalStatus, vehicleBefore.operationalStatus);
      assert.equal(vehicleAfter.updatedAt.getTime(), vehicleBefore.updatedAt.getTime());
      assert.equal(await prisma.customer.count(), customersBefore);
    });

    test("customer review: allowed fields persist as overrides; OCR rows untouched; no OCR call; audit has no PII", async () => {
      const ctx = await offer();
      await seedReadyIdentity(app, ctx.token);
      const passportBefore = await prisma.passportExtraction.findFirstOrThrow({ where: { contractId: ctx.contractId } });
      const licenseBefore = await prisma.drivingLicenseVerification.findFirstOrThrow({ where: { contractId: ctx.contractId } });

      const counter = createFakeDocumentOcrProvider();
      await injectDocumentOcr(counter.provider);
      const res = await patchOfficial(ctx.token, {
        address: "TEST ADDRESS 1",
        telephone: "+971 50 000 0001",
        sponsorName: "TEST SPONSOR",
      });
      assert.equal(res.statusCode, 200, res.body);
      const v = res.json().data;
      assert.equal(v.hirer.name, "TEST PERSON", "OCR identity name stays locked on the review link");
      assert.equal(v.hirer.address, "TEST ADDRESS 1");
      assert.equal(v.hirer.telephone, "+971500000001");
      assert.equal(v.hirer.nationality, "TEST", "unpatched field still resolves from OCR");
      assert.equal(v.sponsor.name, "TEST SPONSOR");

      await getOfficial(ctx.token);
      assert.deepEqual(counter.calls, [], "GET/PATCH never call an OCR provider");

      const passportAfter = await prisma.passportExtraction.findUniqueOrThrow({ where: { id: passportBefore.id } });
      assert.equal(passportAfter.fullName, "TEST PERSON");
      assert.equal(passportAfter.updatedAt.getTime(), passportBefore.updatedAt.getTime());
      const licenseAfter = await prisma.drivingLicenseVerification.findUniqueOrThrow({ where: { id: licenseBefore.id } });
      assert.equal(licenseAfter.updatedAt.getTime(), licenseBefore.updatedAt.getTime());

      const contract = await prisma.contract.findUniqueOrThrow({ where: { id: ctx.contractId } });
      assert.equal(contract.customerId, null);
      assert.equal(contract.status, "AWAITING");
      assert.equal(contract.snapshot, null);

      const cleared = await patchOfficial(ctx.token, { address: null });
      assert.equal(cleared.json().data.hirer.address, null, "clearing an override removes the manual value");

      const audit = await prisma.auditLog.findMany({
        where: { entityId: ctx.contractId, action: "contract.official_review_updated" },
      });
      assert.ok(audit.length >= 1);
      const auditJson = JSON.stringify(audit);
      assert.equal(auditJson.includes("TEST ADDRESS 1"), false);
      assert.ok(auditJson.includes("address"));
    });

    test("mass assignment: system-locked fields are rejected and nothing is saved", async () => {
      const ctx = await offer();
      await seedReadyIdentity(app, ctx.token);
      for (const payload of [
        { hirerName: "X", agreementNumber: "DE-FAKE" },
        { vehicleType: "Ferrari" },
        { rateAmount: 1 },
        { agreedAmount: 1 },
        { numberOfDays: 999 },
        { plannedStartAt: "2020-01-01T00:00:00.000Z" },
        { vehicleOut: { mileage: 1 } },
        { vehicleIn: { mileage: 1 } },
        { driverLicenseNumber: "FAKE" },
        { depositAmount: 100 },
        { cardNumber: "4242424242424242" },
      ]) {
        const res = await patchOfficial(ctx.token, payload);
        assert.equal(res.statusCode, 422, `${JSON.stringify(payload)} → ${res.body}`);
      }
      assert.equal(await prisma.officialContractReviewDraft.count({ where: { contractId: ctx.contractId } }), 0);
      const v = (await getOfficial(ctx.token)).json().data;
      assert.equal(v.contract.agreementNumber, ctx.contractNumber);
      assert.equal(v.rental.numberOfDays, 7);
    });

    test("review is blocked before identity is ready and after signature", async () => {
      const early = await offer();
      const blocked = await patchOfficial(early.token, { address: "X ADDRESS" });
      assert.equal(blocked.statusCode, 409, blocked.body);
      assert.equal(blocked.json().error.context.reason, "CONTRACT_IDENTITY_NOT_READY");

      const signed = await offer();
      await seedReadyIdentity(app, signed.token);
      await prisma.contract.update({ where: { id: signed.contractId }, data: { status: "SIGNED" } });
      const locked = await patchOfficial(signed.token, { address: "X ADDRESS" });
      assert.equal(locked.statusCode, 409);
      assert.equal(locked.json().error.context.reason, "OFFICIAL_CONTRACT_REVIEW_LOCKED");
    });

    test("existing FORM contract loads without restarting identity capture", async () => {
      const ctx = await offer();
      const customer = await prisma.customer.create({
        data: { name: `Legacy ${run}`, nationality: "AE", mobile: "+971500000099", identityNumber: "784-9" },
      });
      await prisma.contract.update({
        where: { id: ctx.contractId },
        data: { status: "FORM", customerId: customer.id },
      });
      const res = await getOfficial(ctx.token);
      assert.equal(res.statusCode, 200, res.body);
      const v = res.json().data;
      assert.equal(v.contract.status, "FORM");
      assert.equal(v.hirer.name, `Legacy ${run}`);
      assert.equal(v.hirer.telephone, "+971500000099");
      assert.equal(v.identity.identityReady, false);
      assert.equal(v.permissions.canEdit, true);
      const patched = await patchOfficial(ctx.token, { address: "LEGACY ADDRESS" });
      assert.equal(patched.statusCode, 200, patched.body);
      const customerAfter = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
      assert.equal(customerAfter.address, null, "Customer master data is not mutated by review");
    });

    test("Car-Out / Car-In project actual custody values; review does not imply possession", async () => {
      const ctx = await offer();
      await seedReadyIdentity(app, ctx.token);
      const outAt = new Date("2026-09-20T10:15:00.000Z");
      await prisma.contract.update({ where: { id: ctx.contractId }, data: { status: "ACTIVE" } });
      await prisma.contractCarOut.create({
        data: { contractId: ctx.contractId, performedByUserId: staffUserId, occurredAt: outAt, mileageOut: 15000, fuelOut: "F" },
      });
      let v = (await getOfficial(ctx.token)).json().data;
      assert.equal(v.vehicleOut.status, "RECORDED");
      assert.equal(v.vehicleOut.mileage, 15000);
      assert.equal(v.vehicleOut.fuel, "F");
      assert.equal(new Date(v.vehicleOut.occurredAt).toISOString(), outAt.toISOString());
      assert.equal(v.vehicleIn.status, "NOT_AVAILABLE");
      assert.equal(v.permissions.canEdit, false);

      const inAt = new Date("2026-09-27T08:00:00.000Z");
      await prisma.contract.update({ where: { id: ctx.contractId }, data: { status: "REVIEW" } });
      await prisma.contractCarIn.create({
        data: { contractId: ctx.contractId, occurredAt: inAt, mileageIn: 15820, fuelIn: "1/2" },
      });
      v = (await getOfficial(ctx.token)).json().data;
      assert.equal(v.vehicleIn.status, "RECORDED");
      assert.equal(v.vehicleIn.mileage, 15820);
      assert.equal(v.vehicleIn.fuel, "1/2");
      assert.equal(v.contract.status, "REVIEW");

      const patch = await patchOfficial(ctx.token, { telephone: "+971500000002" });
      assert.equal(patch.statusCode, 409);
    });

    test("token security: invalid, expired, cross-contract, arbitrary contract id", async () => {
      const a = await offer();
      const b = await offer();
      await seedReadyIdentity(app, a.token);
      await seedReadyIdentity(app, b.token);
      await patchOfficial(b.token, { sponsorName: "SPONSOR OF B" });

      const readA = (await getOfficial(a.token)).json().data;
      assert.equal(readA.contract.agreementNumber, a.contractNumber);
      assert.equal(readA.sponsor.name, null);

      const invalid = await getOfficial("not-a-real-token-00000000000000000000");
      assert.equal(invalid.statusCode, 401);
      assert.equal(invalid.json().error.context.reason, "CONTRACT_LINK_INVALID");

      const byId = await getOfficial(a.contractId);
      assert.equal(byId.statusCode, 401);

      await prisma.contractLink.updateMany({
        where: { contractId: a.contractId, type: "RENTAL" },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const expired = await getOfficial(a.token);
      assert.equal(expired.statusCode, 401);
      assert.equal(expired.json().error.code, "TOKEN_EXPIRED");
      assert.equal(expired.json().error.context.reason, "CONTRACT_LINK_EXPIRED");
      const expiredPatch = await patchOfficial(a.token, { address: "X ADDRESS" });
      assert.equal(expiredPatch.statusCode, 401);
    });
  });
}
