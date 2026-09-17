import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import {
  createFakeDocumentOcrProvider,
  fakePassportResult,
  SYNTHETIC_PASSPORT,
} from "../helpers/fake-document-ocr-provider";
import {
  imageMultipart,
  injectDocumentOcr,
  TEST_PNG,
  uploadPublicDocument,
} from "../helpers/public-identity";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test(
    "public identity flow integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("official contract phase 1 — document capture + provider-agnostic OCR", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = `PID${Date.now().toString(36).toUpperCase()}`;
    const admin = { email: `pid-admin-${run}@example.test`, password: "pid-admin-pass-123" };
    let staffToken = "";
    const ocr = createFakeDocumentOcrProvider();
    const auth = () => ({ authorization: `Bearer ${staffToken}` });

    let seq = 0;
    async function offerAndToken() {
      seq += 1;
      const vehicleName = `PID-${run}-${seq}`;
      const vehicle = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(),
        payload: {
          vehicleName,
          plateNumber: `I${run}${seq}`.slice(0, 20),
          dailyRate: 300,
          color: "Black",
          modelYear: 2025,
        },
      });
      assert.equal(vehicle.statusCode, 201, vehicle.body);
      const offer = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(),
        payload: { vehicleId: vehicle.json().data.id, priceType: "DAILY", rentalDays: 3, agreedAmount: 900 },
      });
      assert.equal(offer.statusCode, 201, offer.body);
      const contractId = offer.json().data.id as string;
      const link = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/rental-link`,
        headers: auth(),
      });
      return { contractId, token: link.json().data.link.token as string, vehicleName };
    }

    const license = (t: string) => uploadPublicDocument(app, t, "driving-license");
    const passport = (t: string, file = imageMultipart("passport.png")) =>
      uploadPublicDocument(app, t, "passport", file);

    async function validLicense(t: string) {
      ocr.setLicense({ licenseNumber: "DL-ID-1", expiryDate: "2031-06-01" });
      const res = await license(t);
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.json().data.licenseVerification.status, "VALID");
      return res;
    }

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("public identity integration refuses to run unless DATABASE_URL is haidara_test");
      }
      const { buildApp } = await import("src/app");
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      app = await buildApp();
      prisma = app.prisma;
      const role = await prisma.role.upsert({
        where: { key: `pid_admin_${run}` },
        update: {},
        create: { key: `pid_admin_${run}`, name: "pid admin" },
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
      const user = await prisma.user.create({
        data: {
          email: normalizeEmail(admin.email),
          name: "pid admin",
          status: "ACTIVE",
          passwordHash: await hashPassword(admin.password),
        },
      });
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      const login = await app.inject({ method: "POST", url: "/auth/login", payload: admin });
      staffToken = login.json().data.accessToken;
      await injectDocumentOcr(ocr.provider);
    });

    after(async () => {
      await injectDocumentOcr(undefined);
      if (app) await app.close();
    });

    test("identity starts not ready; passport is blocked before a VALID license", async () => {
      const ctx = await offerAndToken();
      const initial = await app.inject({ method: "GET", url: `/contracts/rental/${ctx.token}` });
      assert.equal(initial.statusCode, 200);
      const identity = initial.json().data.identity;
      assert.equal(identity.identityReady, false);
      assert.equal(identity.licenseStatus, "LICENSE_REQUIRED");
      assert.equal(identity.passport.status, "REQUIRED");

      const early = await passport(ctx.token);
      assert.equal(early.statusCode, 409, early.body);
      assert.equal(early.json().error.context.reason, "PASSPORT_LICENSE_REQUIRED");

      ocr.setLicense({ licenseNumber: "DL-OLD", expiryDate: "2020-01-01" });
      const expired = await license(ctx.token);
      assert.equal(expired.json().data.licenseVerification.status, "EXPIRED");
      assert.equal(expired.json().data.identity.licenseStatus, "LICENSE_INVALID");
      const blocked = await passport(ctx.token);
      assert.equal(blocked.statusCode, 409);
      assert.equal(blocked.json().error.context.reason, "PASSPORT_LICENSE_REQUIRED");

      const docs = await prisma.contractDocument.count({
        where: { contractId: ctx.contractId, type: "PASSPORT" },
      });
      assert.equal(docs, 0);
    });

    test("client cannot fake license validity with extra fields", async () => {
      const ctx = await offerAndToken();
      ocr.setLicense({ licenseNumber: null, expiryDate: "2031-01-01" });
      const boundary = "----fakevalid";
      const payload = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="licenseValid"\r\n\r\ntrue\r\n`),
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="dl.png"\r\nContent-Type: image/png\r\n\r\n`,
        ),
        TEST_PNG,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const res = await app.inject({
        method: "POST",
        url: `/contracts/rental/${ctx.token}/driving-license?licenseValid=true`,
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload,
      });
      assert.equal(res.statusCode, 200, res.body);
      assert.notEqual(res.json().data.licenseVerification.status, "VALID");
      const early = await passport(ctx.token);
      assert.equal(early.statusCode, 409);
    });

    test("valid license + passport READY → normalized fields, identityReady, no raw OCR, no Customer, no snapshot", async () => {
      const ctx = await offerAndToken();
      await validLicense(ctx.token);
      const customersBefore = await prisma.customer.count();
      ocr.setPassport(() => ({
        ...fakePassportResult({ ...SYNTHETIC_PASSPORT, VendorSurname: "LEAK" }),
        rawVendorResponse: { secretKey: "must-not-leak" },
      }) as never);

      const res = await passport(ctx.token);
      assert.equal(res.statusCode, 200, res.body);
      const data = res.json().data;
      assert.equal(data.identity.passport.status, "READY");
      assert.equal(data.identity.passport.fields.fullName, "TEST PERSON");
      assert.equal(data.identity.passport.fields.passportNumber, "TEST123456");
      assert.equal(data.identity.passport.fields.nationality, "TEST");
      assert.equal(data.identity.passport.fields.dateOfBirth, null);
      assert.equal(data.identity.passport.fields.passportExpiryDate, null);
      assert.equal(data.identity.identityReady, true);
      assert.equal(data.flow.step, "CONTRACT");
      assert.equal(res.body.includes("rawVendorResponse"), false);
      assert.equal(res.body.includes("must-not-leak"), false);
      assert.equal(res.body.includes("VendorSurname"), false);
      assert.equal(res.body.includes('"provider"'), false);

      // Server-controlled vehicle/rental context is untouched by document capture.
      assert.equal(data.vehicle.displayName.includes(ctx.vehicleName) || data.vehicle.displayName.length > 0, true);
      assert.equal(data.rental.agreedAmount, 900);
      assert.equal(data.rental.rentalDays, 3);

      const draft = await app.inject({ method: "GET", url: `/contracts/rental/${ctx.token}/identity` });
      assert.equal(draft.statusCode, 200, draft.body);
      assert.deepEqual(
        {
          fullName: draft.json().data.fullName,
          passportNumber: draft.json().data.passportNumber,
          driverLicenseNumber: draft.json().data.driverLicenseNumber,
          driverLicenseExpiryDate: draft.json().data.driverLicenseExpiryDate,
          identityReady: draft.json().data.identityReady,
          licenseStatus: draft.json().data.licenseStatus,
          passportStatus: draft.json().data.passportStatus,
        },
        {
          fullName: "TEST PERSON",
          passportNumber: "TEST123456",
          driverLicenseNumber: "DL-ID-1",
          driverLicenseExpiryDate: "2031-06-01",
          identityReady: true,
          licenseStatus: "LICENSE_VALID",
          passportStatus: "PASSPORT_READY",
        },
      );
      assert.equal(draft.body.includes("PASSPORT_OCR"), false);

      const contract = await prisma.contract.findUniqueOrThrow({
        where: { id: ctx.contractId },
        include: { acceptance: true },
      });
      assert.equal(contract.customerId, null);
      assert.equal(contract.acceptance, null);
      assert.equal(contract.status, "AWAITING");
      assert.equal(await prisma.customer.count(), customersBefore);

      // Document contents never reach AuditLog or outbox payloads.
      const audit = await prisma.auditLog.findMany({ where: { entityId: ctx.contractId } });
      const outbox = await prisma.domainOutboxEvent.findMany({ where: { aggregateId: ctx.contractId } });
      const persisted = JSON.stringify([audit, outbox]);
      assert.equal(persisted.includes("TEST PERSON"), false);
      assert.equal(persisted.includes("TEST123456"), false);
      assert.ok(outbox.some((e) => e.eventType === "contract.passport_processed"));
    });

    test("provider unconfigured, unrecognized, unreadable, and throwing providers fail safely", async () => {
      const ctx = await offerAndToken();
      await validLicense(ctx.token);

      await injectDocumentOcr(undefined);
      const unconfigured = await passport(ctx.token);
      await injectDocumentOcr(ocr.provider);
      assert.equal(unconfigured.statusCode, 200, unconfigured.body);
      assert.equal(unconfigured.json().data.identity.passport.status, "PROVIDER_UNAVAILABLE");
      assert.equal(unconfigured.json().data.identity.identityReady, false);
      assert.equal(unconfigured.body.includes("DOCUMENT_OCR_PROVIDER_NOT_CONFIGURED"), false);

      ocr.setPassport(() => ({ ok: false, reason: "DOCUMENT_OCR_NOT_RECOGNIZED" }));
      const notRecognized = await passport(ctx.token);
      assert.equal(notRecognized.json().data.identity.passport.status, "NOT_RECOGNIZED");

      ocr.setPassport(() => fakePassportResult({ nationality: "TEST" }));
      const unreadable = await passport(ctx.token);
      assert.equal(unreadable.json().data.identity.passport.status, "FAILED");
      assert.equal(unreadable.json().data.identity.passport.fields, null);

      ocr.setPassport(() => {
        throw new Error("vendor 500 https://secret.example key=abc");
      });
      const thrown = await passport(ctx.token);
      assert.equal(thrown.statusCode, 200, thrown.body);
      assert.equal(thrown.json().data.identity.passport.status, "FAILED");
      assert.equal(thrown.body.includes("secret.example"), false);

      const form = await app.inject({
        method: "POST",
        url: `/contracts/rental/${ctx.token}/form`,
        payload: { name: "Blocked", mobile: "+971500000070", nationality: "AE", passportNumber: "X12345" },
      });
      assert.equal(form.statusCode, 409);
      assert.equal(form.json().error.context.reason, "CONTRACT_IDENTITY_NOT_READY");
    });

    test("stale passport attempt cannot overwrite a newer retake", async () => {
      const ctx = await offerAndToken();
      await validLicense(ctx.token);

      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let calls = 0;
      ocr.setPassport(async () => {
        calls += 1;
        if (calls === 1) {
          await gate;
          return fakePassportResult({ fullName: "STALE PERSON", passportNumber: "STALE0001" });
        }
        return fakePassportResult({ fullName: "TEST PERSON", passportNumber: "TEST123456" });
      });

      const slowA = passport(ctx.token);
      for (let i = 0; i < 200 && calls === 0; i++) await new Promise((r) => setTimeout(r, 10));
      assert.equal(calls, 1);
      const fastB = await passport(ctx.token);
      assert.equal(fastB.json().data.identity.passport.fields.passportNumber, "TEST123456");
      release();
      const a = await slowA;
      assert.equal(a.statusCode, 200, a.body);

      const final = await app.inject({ method: "GET", url: `/contracts/rental/${ctx.token}` });
      assert.equal(final.json().data.identity.passport.fields.passportNumber, "TEST123456");
      assert.equal(final.json().data.identity.passport.fields.fullName, "TEST PERSON");
      const active = await prisma.contractDocument.count({
        where: { contractId: ctx.contractId, type: "PASSPORT", supersededAt: null },
      });
      assert.equal(active, 1);
    });

    test("retaking passport replaces the authoritative attempt; retaking an invalid license revokes readiness", async () => {
      const ctx = await offerAndToken();
      await validLicense(ctx.token);
      ocr.setPassport(() => fakePassportResult());
      const first = await passport(ctx.token);
      assert.equal(first.json().data.identity.identityReady, true);

      ocr.setPassport(() => ({ ok: false, reason: "DOCUMENT_OCR_NOT_RECOGNIZED" }));
      const retake = await passport(ctx.token);
      assert.equal(retake.json().data.identity.passport.status, "NOT_RECOGNIZED");
      assert.equal(retake.json().data.identity.identityReady, false);
      assert.equal(retake.json().data.flow.step, "LICENSE_VERIFICATION");

      ocr.setPassport(() => fakePassportResult());
      assert.equal((await passport(ctx.token)).json().data.identity.identityReady, true);

      ocr.setLicense({ licenseNumber: "DL-OLD", expiryDate: "2020-01-01" });
      const badLicense = await license(ctx.token);
      assert.equal(badLicense.json().data.identity.identityReady, false);
      assert.equal(badLicense.json().data.identity.licenseStatus, "LICENSE_INVALID");
      const draft = await app.inject({ method: "GET", url: `/contracts/rental/${ctx.token}/identity` });
      assert.equal(draft.json().data.identityReady, false);
      assert.equal(draft.json().data.driverLicenseNumber, null);
    });

    test("license validation works independently while passport OCR is unavailable", async () => {
      // A provider that reads licenses only: passport stays unavailable.
      const licenseOnly = createFakeDocumentOcrProvider();
      await injectDocumentOcr({
        ...licenseOnly.provider,
        capabilities: { supportsDriverLicense: true, supportsPassport: false },
      });
      try {
        const ctx = await offerAndToken();
        licenseOnly.setLicense({ licenseNumber: "DL-IND-1", expiryDate: "2031-06-01" });
        const valid = await license(ctx.token);
        assert.equal(valid.statusCode, 200, valid.body);
        assert.equal(valid.json().data.licenseVerification.status, "VALID");
        assert.equal(valid.json().data.identity.licenseStatus, "LICENSE_VALID");

        const pass = await passport(ctx.token);
        assert.equal(pass.statusCode, 200, pass.body);
        assert.equal(pass.json().data.identity.passport.status, "PROVIDER_UNAVAILABLE");
        assert.equal(pass.json().data.identity.identityReady, false);
        assert.equal(pass.json().data.flow.step, "LICENSE_VERIFICATION");
        const attachment = await prisma.contractDocument.count({
          where: { contractId: ctx.contractId, type: "PASSPORT", supersededAt: null },
        });
        assert.equal(attachment, 1, "passport capture is still stored");

        const other = await offerAndToken();
        licenseOnly.setLicense({ licenseNumber: "DL-OLD", expiryDate: "2020-01-01" });
        const expired = await license(other.token);
        assert.equal(expired.json().data.licenseVerification.status, "EXPIRED");
        assert.equal((await passport(other.token)).statusCode, 409);
      } finally {
        await injectDocumentOcr(ocr.provider);
      }
    });

    test("fully unconfigured runtime: license and passport both report provider unavailable", async () => {
      await injectDocumentOcr(undefined);
      try {
        const ctx = await offerAndToken();
        const res = await license(ctx.token);
        assert.equal(res.statusCode, 200, res.body);
        assert.equal(res.json().data.licenseVerification.status, "PROVIDER_UNAVAILABLE");
        assert.equal((await passport(ctx.token)).json().error.context.reason, "PASSPORT_LICENSE_REQUIRED");
      } finally {
        await injectDocumentOcr(ocr.provider);
      }
    });

    test("existing FORM contracts stay on the contract step without identity capture", async () => {
      const ctx = await offerAndToken();
      await prisma.contract.update({ where: { id: ctx.contractId }, data: { status: "FORM" } });
      const res = await app.inject({ method: "GET", url: `/contracts/rental/${ctx.token}` });
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.json().data.contract.status, "FORM");
      assert.equal(res.json().data.identity.identityReady, false);
      assert.equal(res.json().data.flow.step, "CONTRACT");
    });

    test("expired and invalid public tokens return link errors (no staff session semantics)", async () => {
      const ctx = await offerAndToken();
      const valid = await app.inject({ method: "GET", url: `/contracts/rental/${ctx.token}` });
      assert.equal(valid.statusCode, 200);

      const invalid = await app.inject({ method: "GET", url: "/contracts/rental/not-a-real-token-000000000000000000" });
      assert.equal(invalid.statusCode, 401);
      assert.equal(invalid.json().error.context.reason, "CONTRACT_LINK_INVALID");

      await prisma.contractLink.updateMany({
        where: { contractId: ctx.contractId, type: "RENTAL" },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      for (const url of [`/contracts/rental/${ctx.token}`, `/contracts/rental/${ctx.token}/identity`]) {
        const expired = await app.inject({ method: "GET", url });
        assert.equal(expired.statusCode, 401, expired.body);
        assert.equal(expired.json().error.code, "TOKEN_EXPIRED");
        assert.equal(expired.json().error.context.reason, "CONTRACT_LINK_EXPIRED");
      }
      const expiredUpload = await passport(ctx.token);
      assert.equal(expiredUpload.statusCode, 401);
      assert.equal(expiredUpload.json().error.context.reason, "CONTRACT_LINK_EXPIRED");
    });

    test("public token is required; arbitrary contract ids are not addressable", async () => {
      const bogus = await passport("not-a-real-token-0000000000000000000000");
      assert.equal(bogus.statusCode, 401, bogus.body);
      const ctx = await offerAndToken();
      const byId = await app.inject({ method: "GET", url: `/contracts/rental/${ctx.contractId}/identity` });
      assert.equal(byId.statusCode, 401);
      const staffOnly = await app.inject({ method: "GET", url: `/contracts/${ctx.contractId}` });
      assert.equal(staffOnly.statusCode, 401);
    });

    test("passport file validation: MIME by content, SVG, size", async () => {
      const ctx = await offerAndToken();
      await validLicense(ctx.token);
      const svg = await passport(
        ctx.token,
        imageMultipart("p.svg", "image/svg+xml", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")),
      );
      assert.equal(svg.statusCode, 422, svg.body);
      const spoofed = await passport(ctx.token, imageMultipart("p.png", "image/png", Buffer.from("MZ-not-an-image")));
      assert.equal(spoofed.statusCode, 422, spoofed.body);
      const huge = await passport(
        ctx.token,
        imageMultipart("p.png", "image/png", Buffer.concat([TEST_PNG, Buffer.alloc(5_242_881)])),
      );
      assert.equal(huge.statusCode, 413, huge.body);
      const docs = await prisma.contractDocument.count({
        where: { contractId: ctx.contractId, type: "PASSPORT" },
      });
      assert.equal(docs, 0);
    });
  });
}
