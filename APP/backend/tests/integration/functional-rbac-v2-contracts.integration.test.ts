import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import path from "node:path";
import { FN } from "src/lib/rbac/functional-permissions/keys";
import {
  assertTestDatabaseUrl,
  extractPostgresDatabaseName,
} from "../helpers/integration-harness";
import { companyId as testCompanyId } from "tests/helpers/operating-company";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function resolveTestDatabaseUrl(): string {
  const devUrl = process.env.DATABASE_URL ?? "";
  const explicit = process.env.TEST_DATABASE_URL?.trim();
  const testUrl = explicit || devUrl.replace(/\/([^/?]+)(\?|$)/, "/haidara_test$2");
  assertTestDatabaseUrl(testUrl);
  return testUrl;
}

const RUN = process.env.RUN_INTEGRATION === "true";

const CONTRACT_VEHICLE_FN = [
  FN.vehicles.viewPage,
  FN.vehicles.addDelete,
  "reference_data.lookup",
];

const ALL_CONTRACT_FN = [
  FN.contracts.viewPage,
  FN.contracts.rentalLink,
  FN.contracts.operationsClosure,
  FN.contracts.renewal,
  ...CONTRACT_VEHICLE_FN,
];

if (!RUN) {
  test("functional RBAC V2 contracts skipped (RUN_INTEGRATION=true)", { skip: true });
} else {
  describe("functional RBAC V2 contract HTTP boundaries", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = `CTRBAC${Date.now().toString(36).toUpperCase()}`;
    const testDatabaseUrl = resolveTestDatabaseUrl();

    let fixtureToken = "";
    let viewToken = "";
    let rentalToken = "";
    let operationsToken = "";
    let renewalToken = "";
    let legacyManageToken = "";

    let vehiclePaidId = 0;
    let vehicleActiveId = 0;
    let companyId = 0;
    let paidContractId = "";
    let activeContractId = "";

    async function seedUser(
      email: string,
      password: string,
      roleKey: string,
      permissionKeys: string[],
    ) {
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      const canonicalEmail = normalizeEmail(email);
      const role = await prisma.role.upsert({
        where: { key: roleKey },
        update: {},
        create: { key: roleKey, name: roleKey },
      });
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      for (const key of permissionKeys) {
        const perm = await prisma.permission.upsert({
          where: { key },
          update: {},
          create: { key, category: key.includes(".") ? key.split(".")[0] : "functional", description: key },
        });
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          update: {},
          create: { roleId: role.id, permissionId: perm.id },
        });
      }
      const passwordHash = await hashPassword(password);
      await prisma.user.upsert({
        where: { email: canonicalEmail },
        update: { status: "ACTIVE", passwordHash },
        create: { email: canonicalEmail, name: roleKey, status: "ACTIVE", passwordHash },
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { email: canonicalEmail } });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
      return user.id;
    }

    async function login(email: string, password: string) {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password },
      });
      assert.equal(res.statusCode, 200, res.body);
      return res.json().data.accessToken as string;
    }

    const auth = (token: string) => ({ authorization: `Bearer ${token}` });

    before(async () => {
      assert.equal(extractPostgresDatabaseName(testDatabaseUrl), "haidara_test");
      process.env.FUNCTIONAL_RBAC_V2_ENABLED = "true";
      process.env.TEST_DATABASE_URL = testDatabaseUrl;
      process.env.DATABASE_URL = testDatabaseUrl;
      process.env.RATE_LIMIT_AUTH_MAX = "1000";
      process.env.LOG_LEVEL = "silent";

      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      companyId = await testCompanyId(prisma);

      await seedUser(`fx-${run}@example.test`, "pass-fx", `fx_${run}`, ALL_CONTRACT_FN);
      await seedUser(`cv-${run}@example.test`, "pass-cv", `cv_${run}`, [
        FN.contracts.viewPage,
        ...CONTRACT_VEHICLE_FN,
      ]);
      await seedUser(`cr-${run}@example.test`, "pass-cr", `cr_${run}`, [
        FN.contracts.viewPage,
        FN.contracts.rentalLink,
        ...CONTRACT_VEHICLE_FN,
      ]);
      await seedUser(`co-${run}@example.test`, "pass-co", `co_${run}`, [
        FN.contracts.viewPage,
        FN.contracts.operationsClosure,
        ...CONTRACT_VEHICLE_FN,
      ]);
      await seedUser(`cn-${run}@example.test`, "pass-cn", `cn_${run}`, [
        FN.contracts.viewPage,
        FN.contracts.renewal,
        ...CONTRACT_VEHICLE_FN,
      ]);
      await seedUser(`lg-${run}@example.test`, "pass-lg", `lg_${run}`, [
        "contracts.read",
        "contracts.manage",
        ...CONTRACT_VEHICLE_FN,
      ]);

      fixtureToken = await login(`fx-${run}@example.test`, "pass-fx");
      viewToken = await login(`cv-${run}@example.test`, "pass-cv");
      rentalToken = await login(`cr-${run}@example.test`, "pass-cr");
      operationsToken = await login(`co-${run}@example.test`, "pass-co");
      renewalToken = await login(`cn-${run}@example.test`, "pass-cn");
      legacyManageToken = await login(`lg-${run}@example.test`, "pass-lg");

      async function seedVehicle(label: string) {
        const res = await app.inject({
          method: "POST",
          url: "/vehicles",
          headers: auth(fixtureToken),
          payload: {
            companyId,
            vehicleName: label,
            plateNumber: label.slice(0, 16),
            dailyRate: 400,
            monthlyRate: 9000,
          },
        });
        assert.equal(res.statusCode, 201, res.body);
        return res.json().data.id as number;
      }

      vehiclePaidId = await seedVehicle(`RC-P ${run}`);
      vehicleActiveId = await seedVehicle(`RC-A ${run}`);

      const offerRes = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(fixtureToken),
        payload: {
          vehicleId: vehiclePaidId,
          priceType: "DAILY",
          rentalDays: 3,
          agreedAmount: 1200,
          collectionMode: "ELECTRONIC",
        },
      });
      assert.equal(offerRes.statusCode, 201, offerRes.body);
      paidContractId = offerRes.json().data.id as string;
      await prisma.contract.update({
        where: { id: paidContractId },
        data: { status: "PAID" },
      });
      await prisma.contractPayment.create({
        data: {
          contractId: paidContractId,
          purpose: "RENTAL",
          targetId: paidContractId,
          amount: 1200,
          method: "CARD",
          provider: "stripe",
          status: "CONFIRMED",
          confirmedAt: new Date(),
        },
      });

      const { normalizeEmail } = await import("src/lib/security/normalize");
      const actor = await prisma.user.findUniqueOrThrow({
        where: { email: normalizeEmail(`fx-${run}@example.test`) },
      });
      activeContractId = (
        await prisma.contract.create({
          data: {
            companyId,
            contractNumber: `RBAC-ACT-${run}`,
            status: "ACTIVE",
            vehicleId: vehicleActiveId,
            createdByUserId: actor.id,
            priceType: "DAILY",
            rentalDays: 2,
            durationValue: 2,
            durationUnit: "DAY",
            agreedAmount: 800,
            collectionMode: "ELECTRONIC",
          },
        })
      ).id;
    });

    after(async () => {
      delete process.env.FUNCTIONAL_RBAC_V2_ENABLED;
      await app.close();
      await prisma.$disconnect();
    });

    test("view_page: list allowed, rental offer denied", async () => {
      const list = await app.inject({
        method: "GET",
        url: "/contracts?page=1&pageSize=5",
        headers: auth(viewToken),
      });
      assert.equal(list.statusCode, 200, list.body);
      const denied = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(viewToken),
        payload: {
          vehicleId: vehiclePaidId,
          priceType: "DAILY",
          rentalDays: 2,
          agreedAmount: 800,
          collectionMode: "ELECTRONIC",
        },
      });
      assert.equal(denied.statusCode, 403, denied.body);
    });

    test("rental_link: create offer and rental-link allowed; car-out denied", async () => {
      const rentalVehicle = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(fixtureToken),
        payload: {
          companyId,
          vehicleName: `RC-R ${run}`,
          plateNumber: `RC-R ${run}`.slice(0, 16),
          dailyRate: 300,
          monthlyRate: 8000,
        },
      });
      assert.equal(rentalVehicle.statusCode, 201, rentalVehicle.body);
      const rentalVehicleId = rentalVehicle.json().data.id as number;

      const offer = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(rentalToken),
        payload: {
          vehicleId: rentalVehicleId,
          priceType: "DAILY",
          rentalDays: 2,
          agreedAmount: 700,
          collectionMode: "ELECTRONIC",
        },
      });
      assert.equal(offer.statusCode, 201, offer.body);
      const contractId = offer.json().data.id as string;
      const link = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/rental-link`,
        headers: auth(rentalToken),
      });
      assert.equal(link.statusCode, 200, link.body);
      const carOut = await app.inject({
        method: "PATCH",
        url: `/contracts/${paidContractId}/car-out`,
        headers: auth(rentalToken),
        payload: { mileageOut: 10 },
      });
      assert.equal(carOut.statusCode, 403, carOut.body);
    });

    test("view_page: car-out denied", async () => {
      const carOut = await app.inject({
        method: "PATCH",
        url: `/contracts/${paidContractId}/car-out`,
        headers: auth(viewToken),
        payload: { mileageOut: 11 },
      });
      assert.equal(carOut.statusCode, 403, carOut.body);
    });

    test("operations_closure: car-out allowed; close not forbidden by RBAC", async () => {
      const offerDenied = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(operationsToken),
        payload: {
          vehicleId: vehicleActiveId,
          priceType: "DAILY",
          rentalDays: 1,
          agreedAmount: 400,
          collectionMode: "ELECTRONIC",
        },
      });
      assert.equal(offerDenied.statusCode, 403, offerDenied.body);
      const draft = await app.inject({
        method: "PATCH",
        url: `/contracts/${paidContractId}/car-out`,
        headers: auth(operationsToken),
        payload: { mileageOut: 12 },
      });
      assert.equal(draft.statusCode, 200, draft.body);
      const close = await app.inject({
        method: "POST",
        url: `/contracts/${paidContractId}/close`,
        headers: auth(operationsToken),
      });
      assert.notEqual(close.statusCode, 403, close.body);
    });

    test("renewal: renewal-link allowed on ACTIVE; offer denied", async () => {
      const renew = await app.inject({
        method: "POST",
        url: `/contracts/${activeContractId}/renewal-link`,
        headers: auth(renewalToken),
        payload: { additionalDays: 2, additionalAmount: 200 },
      });
      assert.equal(renew.statusCode, 200, renew.body);
      const offerDenied = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(renewalToken),
        payload: {
          vehicleId: vehicleActiveId,
          priceType: "DAILY",
          rentalDays: 1,
          agreedAmount: 400,
          collectionMode: "ELECTRONIC",
        },
      });
      assert.equal(offerDenied.statusCode, 403, offerDenied.body);
    });

    test("legacy contracts.manage cannot bypass V2 for offers", async () => {
      const extraVehicle = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(fixtureToken),
        payload: {
          companyId,
          vehicleName: `RC-L ${run}`,
          plateNumber: `RC-L ${run}`.slice(0, 16),
          dailyRate: 200,
          monthlyRate: 5000,
        },
      });
      assert.equal(extraVehicle.statusCode, 201, extraVehicle.body);
      const res = await app.inject({
        method: "POST",
        url: "/contracts/offers",
        headers: auth(legacyManageToken),
        payload: {
          vehicleId: extraVehicle.json().data.id as number,
          priceType: "DAILY",
          rentalDays: 1,
          agreedAmount: 500,
          collectionMode: "ELECTRONIC",
        },
      });
      assert.equal(res.statusCode, 403, res.body);
    });
  });
}
