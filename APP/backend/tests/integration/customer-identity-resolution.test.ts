import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { createFakeDocumentOcrProvider } from "../helpers/fake-document-ocr-provider";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

function isIdentityAmbiguous(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "context" in error &&
    (error as { context?: { reason?: string } }).context?.reason === "CUSTOMER_IDENTITY_AMBIGUOUS"
  );
}

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function multipart(filename: string, mime: string, data: Buffer) {
  const boundary = "----cid";
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
    "customer identity resolution integration skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("customer identity resolution", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = { email: `cid-admin-${run}@example.test`, password: "cid-admin-pass-123" };
    let token = "";

    const auth = () => ({ authorization: `Bearer ${token}` });
    const ocr = createFakeDocumentOcrProvider();

    async function fakeOcr(input: { licenseNumber?: string; expiryDate?: string }) {
      ocr.setLicense(input);
      const { setDocumentOcrProviderForTests } = await import(
        "src/modules/document-ocr/document-ocr-provider.factory"
      );
      setDocumentOcrProviderForTests(ocr.provider);
    }

    async function seedIdentity(rentalToken: string, licenseNumber: string) {
      await fakeOcr({ licenseNumber, expiryDate: "2031-06-01" });
      const dl = multipart("dl.png", "image/png", PNG);
      const pp = multipart("pp.png", "image/png", PNG);
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: `/contracts/rental/${rentalToken}/driving-license`,
            headers: dl.headers,
            payload: dl.payload,
          })
        ).statusCode,
        200,
      );
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: `/contracts/rental/${rentalToken}/passport`,
            headers: pp.headers,
            payload: pp.payload,
          })
        ).statusCode,
        200,
      );
    }

    async function offerToken() {
      const plate = `C${run}${Math.random().toString(36).slice(2, 6)}`.slice(0, 12);
      const vehicle = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(),
        payload: {
          companyId: await testCompanyId(prisma),
          vehicleName: `CID-${plate}`,
          plateNumber: plate,
          dailyRate: 400,
          color: "White",
          modelYear: 2024,
        },
      });
      assert.equal(vehicle.statusCode, 201);
      const offer = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(),
        payload: { vehicleId: vehicle.json().data.id, priceType: "DAILY", rentalDays: 4, agreedAmount: 1600 , collectionMode: "ELECTRONIC"},
      });
      assert.equal(offer.statusCode, 201);
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
      };
    }

    async function submitForm(
      rentalToken: string,
      input: { name: string; mobile: string; identityNumber: string; license?: string },
    ) {
      if (input.license) await seedIdentity(rentalToken, input.license);
      else await seedIdentity(rentalToken, `DL-${rentalToken.slice(0, 8)}`);
      const res = await app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/form`,
        payload: {
          name: input.name,
          mobile: input.mobile,
          nationality: "AE",
          identityNumber: input.identityNumber,
        },
      });
      return res;
    }

    async function accept(rentalToken: string) {
      return app.inject({
        method: "POST",
        url: `/contracts/rental/${rentalToken}/accept`,
        payload: {},
      });
    }

    before(async () => {
      if (!process.env.TEST_DATABASE_URL || !/haidara_test(?:\?|$)/.test(process.env.TEST_DATABASE_URL)) {
        throw new Error("customer identity integration requires TEST_DATABASE_URL=haidara_test");
      }
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      const { buildApp } = await import("src/app");
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      app = await buildApp();
      prisma = app.prisma;
      const email = normalizeEmail(admin.email);
      const role = await prisma.role.upsert({
        where: { key: `cid_admin_${run}` },
        update: {},
        create: { key: `cid_admin_${run}`, name: "cid admin" },
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
          name: "cid admin",
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
      const { setDocumentOcrProviderForTests } = await import(
        "src/modules/document-ocr/document-ocr-provider.factory"
      );
      setDocumentOcrProviderForTests(undefined);
      if (app) await app.close();
    });

    test("reuses existing customer for same strong identity with different license", async () => {
      const mobile = `+9715009${run.slice(-5)}1`;
      const identity = `784-cid-${run}`;
      const a = await offerToken();
      const b = await offerToken();
      const formA = await submitForm(a.token, {
        name: "CID A",
        mobile,
        identityNumber: identity,
        license: `DL-A-${run}`,
      });
      assert.equal(formA.statusCode, 200, formA.body);
      const customerA = (await prisma.contract.findUnique({ where: { id: a.contractId } }))?.customerId;
      assert.ok(customerA);

      const formB = await submitForm(b.token, {
        name: "CID B",
        mobile,
        identityNumber: identity,
        license: `DL-B-${run}`,
      });
      assert.equal(formB.statusCode, 200, formB.body);
      const customerB = (await prisma.contract.findUnique({ where: { id: b.contractId } }))?.customerId;
      assert.equal(customerB, customerA);

      const count = await prisma.customer.count({
        where: { identityNumber: identity.toLowerCase(), isActive: true },
      });
      assert.equal(count, 1);
    });

    test("creates a new customer when no strong identity matches", async () => {
      const mobile = `+9715009${run.slice(-5)}2`;
      const identity = `784-new-${run}`;
      const ctx = await offerToken();
      const form = await submitForm(ctx.token, {
        name: "New Only",
        mobile,
        identityNumber: identity,
        license: `DL-NEW-${run}`,
      });
      assert.equal(form.statusCode, 200, form.body);
      const customerId = (await prisma.contract.findUnique({ where: { id: ctx.contractId } }))?.customerId;
      assert.ok(customerId);
      const row = await prisma.customer.findUnique({ where: { id: customerId } });
      assert.equal(row?.identityNumber, identity.toLowerCase());
    });

    test("does not merge on phone alone", async () => {
      const mobile = `+9715009${run.slice(-5)}3`;
      const ctxA = await offerToken();
      const ctxB = await offerToken();
      const formA = await submitForm(ctxA.token, {
        name: "Phone A",
        mobile,
        identityNumber: `784-phone-a-${run}`,
        license: `DL-PA-${run}`,
      });
      assert.equal(formA.statusCode, 200);
      const formB = await submitForm(ctxB.token, {
        name: "Phone B",
        mobile,
        identityNumber: `784-phone-b-${run}`,
        license: `DL-PB-${run}`,
      });
      assert.equal(formB.statusCode, 200);
      const customerA = (await prisma.contract.findUnique({ where: { id: ctxA.contractId } }))?.customerId;
      const customerB = (await prisma.contract.findUnique({ where: { id: ctxB.contractId } }))?.customerId;
      assert.notEqual(customerA, customerB);
    });

    test("fails closed on conflicting strong identifiers", async () => {
      const { normalizeIdentifier } = await import("src/lib/security/normalize");
      const { withTransaction } = await import("src/lib/db/transaction");
      const { resolveCustomerIdFromIdentity } = await import(
        "src/modules/contracts/contract-customer-materialization"
      );
      const identityA = normalizeIdentifier(`784-conf-a-${run}`);
      const licenseB = normalizeIdentifier(`dl-conf-b-${run}`);
      await prisma.customer.create({
        data: {
          name: "Conflict A",
          mobile: `+9715009${run.slice(-5)}4`,
          identityNumber: identityA,
          drivingLicenseNumber: normalizeIdentifier(`dl-conf-a-${run}`),
          drivingLicenseExpiry: new Date("2031-06-01"),
        },
      });
      await prisma.customer.create({
        data: {
          name: "Conflict B",
          mobile: `+9715009${run.slice(-5)}5`,
          drivingLicenseNumber: licenseB,
          drivingLicenseExpiry: new Date("2031-06-01"),
        },
      });

      await assert.rejects(
        () =>
          withTransaction(prisma, (tx) =>
            resolveCustomerIdFromIdentity(tx, {
              name: "Conflict Attempt",
              mobile: `+9715009${run.slice(-5)}6`,
              email: null,
              nationality: "AE",
              identityNumber: identityA,
              passportNumber: null,
              drivingLicenseNumber: licenseB,
              drivingLicenseExpiry: new Date("2031-06-01"),
              address: null,
            }),
          ),
        isIdentityAmbiguous,
      );
    });

    test("public A/B signing binds the same customer", async () => {
      const mobile = `+9715009${run.slice(-5)}7`;
      const identity = `784-ab-${run}`;
      const a = await offerToken();
      const b = await offerToken();
      assert.equal(
        (await submitForm(a.token, { name: "AB A", mobile, identityNumber: identity, license: `DL-AB-A-${run}` }))
          .statusCode,
        200,
      );
      assert.equal((await accept(a.token)).statusCode, 200);
      const contractA = await prisma.contract.findUnique({ where: { id: a.contractId } });
      assert.equal(
        (await submitForm(b.token, { name: "AB B", mobile, identityNumber: identity, license: `DL-AB-B-${run}` }))
          .statusCode,
        200,
      );
      assert.equal((await accept(b.token)).statusCode, 200);
      const contractB = await prisma.contract.findUnique({ where: { id: b.contractId } });
      assert.equal(contractB?.customerId, contractA?.customerId);
    });

    test("concurrent same-identity form submissions resolve to one customer", async () => {
      const mobile = `+9715009${run.slice(-5)}8`;
      const identity = `784-conc-${run}`;
      const tokens = await Promise.all([offerToken(), offerToken(), offerToken()]);
      await Promise.all(tokens.map((t) => seedIdentity(t.token, `DL-CONC-${t.token.slice(0, 6)}`)));

      const results = await Promise.all(
        tokens.map((t) =>
          app.inject({
            method: "POST",
            url: `/contracts/rental/${t.token}/form`,
            payload: {
              name: "Concurrent",
              mobile,
              nationality: "AE",
              identityNumber: identity,
            },
          }),
        ),
      );
      for (const res of results) assert.equal(res.statusCode, 200, res.body);
      const contracts = await prisma.contract.findMany({
        where: { id: { in: tokens.map((t) => t.contractId) } },
        select: { customerId: true },
      });
      const ids = new Set(contracts.map((c) => c.customerId));
      assert.equal(ids.size, 1);
      assert.equal(
        await prisma.customer.count({ where: { identityNumber: identity.toLowerCase(), isActive: true } }),
        1,
      );
    });

    test("resolvePublicFormCustomerId rejects rebinding an existing contract customer", async () => {
      const { withTransaction } = await import("src/lib/db/transaction");
      const { resolvePublicFormCustomerId } = await import(
        "src/modules/contracts/contract-customer-materialization"
      );
      const mobile = `+9715009${run.slice(-5)}9`;
      const identity = `784-rebind-${run}`;
      const wrong = await prisma.customer.create({
        data: {
          name: "Wrong",
          mobile,
          identityNumber: `784-other-${run}`,
          drivingLicenseNumber: `DL-WRONG-${run}`,
          drivingLicenseExpiry: new Date("2031-06-01"),
        },
      });
      const ctx = await offerToken();
      await seedIdentity(ctx.token, `DL-REBIND-${run}`);
      await prisma.contract.update({ where: { id: ctx.contractId }, data: { customerId: wrong.id } });

      await assert.rejects(
        () =>
          withTransaction(prisma, (tx) =>
            resolvePublicFormCustomerId(
              tx,
              ctx.contractId,
              {
                name: "Rebind",
                mobile,
                email: null,
                nationality: "AE",
                identityNumber: identity,
                passportNumber: null,
                drivingLicenseNumber: `DL-REBIND-${run}`,
                drivingLicenseExpiry: new Date("2031-06-01"),
                address: null,
              },
              wrong.id,
            ),
          ),
        isIdentityAmbiguous,
      );
    });
  });
}
