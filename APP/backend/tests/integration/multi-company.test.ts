import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { companyId as testCompanyId, ensureOperatingCompanies } from "tests/helpers/operating-company";

/**
 * Multi-company backend behaviour: company-aware Vehicle and Contract APIs,
 * per-company externalId, the official-contract company block, the public
 * rental context and TARS routing.
 *
 * Real app + real database, so it only runs with RUN_INTEGRATION=true against
 * the disposable test database.
 */
const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test("multi-company integration skipped (set RUN_INTEGRATION=true + a test DATABASE_URL)", {
    skip: true,
  });
} else {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let token = "";
  let uniqueId = 0;
  let eliteId = 0;
  const run = Date.now().toString(36).toUpperCase();
  const email = `mc-admin-${run}@example.test`;
  const password = "mc-admin-pass-123";
  const auth = () => ({ authorization: `Bearer ${token}` });

  const PERMS = [
    "vehicles.read",
    "vehicles.manage",
    "contracts.read",
    "contracts.manage",
    "reference_data.lookup",
  ];

  async function seedUser() {
    const { hashPassword } = await import("src/lib/security/password");
    const { normalizeEmail } = await import("src/lib/security/normalize");
    const role = await prisma.role.upsert({
      where: { key: `mc_admin_${run}` },
      update: {},
      create: { key: `mc_admin_${run}`, name: `mc_admin_${run}` },
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
    const user = await prisma.user.create({
      data: {
        email: normalizeEmail(email),
        name: `MC Admin ${run}`,
        passwordHash: await hashPassword(password),
        status: "ACTIVE",
      },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }

  async function login() {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });
    assert.equal(res.statusCode, 200, res.body);
    token = res.json().data.accessToken as string;
  }

  /** Creates a fleet vehicle through the real API under one company. */
  async function createVehicle(companyId: number, payload: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: "POST",
      url: "/vehicles",
      headers: auth(),
      payload: { companyId, vehicleName: `MC Vehicle ${run}`, ...payload },
    });
    return res;
  }

  async function createVehicleOk(companyId: number, payload: Record<string, unknown> = {}) {
    const res = await createVehicle(companyId, payload);
    assert.equal(res.statusCode, 201, res.body);
    return res.json().data as { id: number; company: { id: number; code: string } };
  }

  /** Updates a fleet vehicle through the real API. */
  async function updateVehicle(id: number, payload: Record<string, unknown>) {
    return app.inject({
      method: "PUT",
      url: `/vehicles/${id}`,
      headers: auth(),
      payload,
    });
  }

  /** The company stored for a vehicle, read straight from the database. */
  async function storedCompanyId(vehicleId: number) {
    const row = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicleId },
      select: { companyId: true },
    });
    return row.companyId;
  }

  /** Creates an offer (AWAITING contract) for a vehicle. */
  async function createOffer(vehicleId: number, extra: Record<string, unknown> = {}) {
    return app.inject({
      method: "POST",
      url: "/contracts/offers",
      headers: auth(),
      payload: {
        vehicleId,
        priceType: "DAILY",
        rentalDays: 2,
        agreedAmount: 500,
          collectionMode: "ELECTRONIC",
        ...extra,
      },
    });
  }

  before(async () => {
    const { env } = await import("src/config/env");
    if (!/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
      throw new Error("multi-company integration refuses to run unless DATABASE_URL is haidara_test");
    }
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    await ensureOperatingCompanies(prisma);
    uniqueId = await testCompanyId(prisma, "UNIQUE");
    eliteId = await testCompanyId(prisma, "ELITE");
    await seedUser();
    await login();
  });

  after(async () => {
    if (app) await app.close();
  });

  describe("operating companies", () => {
    test("lists the active companies with their legal identity", async () => {
      const res = await app.inject({ method: "GET", url: "/operating-companies", headers: auth() });
      assert.equal(res.statusCode, 200, res.body);
      const rows = res.json().data as Array<Record<string, string | number | boolean>>;
      const unique = rows.find((row) => row.code === "UNIQUE");
      const elite = rows.find((row) => row.code === "ELITE");
      assert.ok(unique, "UNIQUE missing");
      assert.ok(elite, "ELITE missing");
      assert.equal(unique!.legalNameEn, "DIAMOND UNIQUE CAR RENTALS CO. LLC S.O.C");
      assert.equal(elite!.legalNameEn, "DIAMOND ELITE CAR RENTALS CO. LLC S.O.C");
      assert.match(String(unique!.legalNameAr), /دايموند يونيك/);
      assert.match(String(elite!.legalNameAr), /دايموند إيليت/);
      assert.ok(String(unique!.accentColor).startsWith("#"));
      assert.ok(rows.every((row) => row.isActive === true));
    });

    test("a retired company is hidden from the selectable list but still readable", async () => {
      const retired = await prisma.operatingCompany.create({
        data: {
          code: `RETIRED-${run}`,
          displayName: "Retired",
          legalNameAr: "شركة متوقفة",
          legalNameEn: "RETIRED CO",
          accentColor: "#777777",
          isActive: false,
        },
      });
      try {
        const active = await app.inject({ method: "GET", url: "/operating-companies", headers: auth() });
        const codes = (active.json().data as Array<{ code: string }>).map((row) => row.code);
        assert.ok(!codes.includes(retired.code));

        const all = await app.inject({
          method: "GET",
          url: "/operating-companies?activeOnly=false",
          headers: auth(),
        });
        const allCodes = (all.json().data as Array<{ code: string }>).map((row) => row.code);
        assert.ok(allCodes.includes(retired.code));
      } finally {
        await prisma.operatingCompany.delete({ where: { id: retired.id } });
      }
    });
  });

  describe("vehicles", () => {
    test("create requires a company", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/vehicles",
        headers: auth(),
        payload: { vehicleName: `MC No Company ${run}` },
      });
      assert.equal(res.statusCode, 422, res.body);
    });

    test("create rejects an unknown company", async () => {
      const res = await createVehicle(987654321);
      assert.equal(res.statusCode, 422, res.body);
    });

    test("create rejects a retired company", async () => {
      const retired = await prisma.operatingCompany.create({
        data: {
          code: `INACTIVE-${run}`,
          displayName: "Inactive",
          legalNameAr: "غير نشطة",
          legalNameEn: "INACTIVE CO",
          accentColor: "#888888",
          isActive: false,
        },
      });
      try {
        const res = await createVehicle(retired.id);
        assert.equal(res.statusCode, 422, res.body);
      } finally {
        await prisma.operatingCompany.delete({ where: { id: retired.id } });
      }
    });

    test("a vehicle can be created under either company and reports it", async () => {
      const unique = await createVehicleOk(uniqueId, { vehicleName: `MC U ${run}` });
      const elite = await createVehicleOk(eliteId, { vehicleName: `MC E ${run}` });
      assert.equal(unique.company.code, "UNIQUE");
      assert.equal(elite.company.code, "ELITE");
    });

    test("the fleet list filters by company and composes with search and status", async () => {
      const marker = `FLT${run}`;
      const uniqueVehicle = await createVehicleOk(uniqueId, { vehicleName: `${marker} Unique` });
      const eliteVehicle = await createVehicleOk(eliteId, { vehicleName: `${marker} Elite` });

      const all = await app.inject({
        method: "GET",
        url: `/vehicles?search=${marker}&pageSize=50`,
        headers: auth(),
      });
      const allIds = (all.json().data as Array<{ id: number }>).map((row) => row.id);
      assert.ok(allIds.includes(uniqueVehicle.id) && allIds.includes(eliteVehicle.id));

      const onlyUnique = await app.inject({
        method: "GET",
        url: `/vehicles?search=${marker}&companyId=${uniqueId}&pageSize=50`,
        headers: auth(),
      });
      const uniqueIds = (onlyUnique.json().data as Array<{ id: number }>).map((row) => row.id);
      assert.ok(uniqueIds.includes(uniqueVehicle.id));
      assert.ok(!uniqueIds.includes(eliteVehicle.id));

      const withStatus = await app.inject({
        method: "GET",
        url: `/vehicles?search=${marker}&companyId=${eliteId}&status=available&pageSize=50`,
        headers: auth(),
      });
      const statusIds = (withStatus.json().data as Array<{ id: number }>).map((row) => row.id);
      assert.deepEqual(statusIds, [eliteVehicle.id]);
    });

    test("fleet type and search compose instead of overwriting each other", async () => {
      const typeName = `Type ${run}`;
      const match = await createVehicleOk(uniqueId, {
        vehicleName: typeName,
        plateNumber: `MC T ${run}`.slice(0, 20),
      });
      const other = await createVehicleOk(uniqueId, {
        vehicleName: `Other ${run}`,
        plateNumber: `MC O ${run}`.slice(0, 20),
      });

      const res = await app.inject({
        method: "GET",
        url: `/vehicles?search=${run}&vehicleType=${encodeURIComponent(typeName)}&pageSize=50`,
        headers: auth(),
      });
      const ids = (res.json().data as Array<{ id: number }>).map((row) => row.id);
      assert.ok(ids.includes(match.id), "type-matching vehicle missing");
      assert.ok(!ids.includes(other.id), "search dropped the vehicleType filter");
    });
  });

  describe("vehicle identifiers", () => {
    test("the same externalId may exist once per company", async () => {
      const externalId = `EXT-${run}`;
      await createVehicleOk(uniqueId, { externalId, plateNumber: `MC X1 ${run}`.slice(0, 20) });
      const elite = await createVehicle(eliteId, {
        externalId,
        plateNumber: `MC X2 ${run}`.slice(0, 20),
      });
      assert.equal(elite.statusCode, 201, elite.body);

      const duplicate = await createVehicle(uniqueId, {
        externalId,
        plateNumber: `MC X3 ${run}`.slice(0, 20),
      });
      assert.equal(duplicate.statusCode, 409, duplicate.body);
    });

    test("plate and VIN stay globally unique across companies", async () => {
      const plate = `MC P ${run}`.slice(0, 20);
      const vin = `MCVIN${run}`;
      await createVehicleOk(uniqueId, { plateNumber: plate, vin });

      const samePlate = await createVehicle(eliteId, { plateNumber: plate });
      assert.equal(samePlate.statusCode, 409, samePlate.body);

      const sameVin = await createVehicle(eliteId, { vin, plateNumber: `MC P2 ${run}`.slice(0, 20) });
      assert.equal(sameVin.statusCode, 409, sameVin.body);
    });
  });

  describe("vehicle company immutability", () => {
    test("normal fleet fields update while a UNIQUE vehicle stays UNIQUE", async () => {
      const vehicle = await createVehicleOk(uniqueId, { vehicleName: `MC IMU ${run}` });
      const res = await updateVehicle(vehicle.id, {
        dailyRate: 321,
        monthlyRate: 7654,
        color: "Pearl White",
      });
      assert.equal(res.statusCode, 200, res.body);
      const data = res.json().data as {
        dailyRate: number;
        color: string;
        company: { id: number; code: string };
      };
      assert.equal(data.dailyRate, 321);
      assert.equal(data.color, "Pearl White");
      assert.equal(data.company.code, "UNIQUE");
      assert.equal(await storedCompanyId(vehicle.id), uniqueId);
    });

    test("normal fleet fields update while an ELITE vehicle stays ELITE", async () => {
      const vehicle = await createVehicleOk(eliteId, { vehicleName: `MC IME ${run}` });
      const res = await updateVehicle(vehicle.id, { monthlyRate: 5555 });
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.json().data.monthlyRate, 5555);
      assert.equal(res.json().data.company.code, "ELITE");
      assert.equal(await storedCompanyId(vehicle.id), eliteId);
    });

    test("UNIQUE to ELITE is rejected and the database still holds UNIQUE", async () => {
      const vehicle = await createVehicleOk(uniqueId, { vehicleName: `MC U2E ${run}` });
      const res = await updateVehicle(vehicle.id, { companyId: eliteId, dailyRate: 999 });
      assert.equal(res.statusCode, 422, res.body);
      assert.equal(res.json().error.context.field, "companyId");
      assert.equal(res.json().error.context.reason, "immutable_field");
      assert.equal(await storedCompanyId(vehicle.id), uniqueId);

      // The whole update is refused — no partial write slips through.
      const detail = await app.inject({
        method: "GET",
        url: `/vehicles/${vehicle.id}`,
        headers: auth(),
      });
      assert.equal(detail.json().data.dailyRate, null);
      assert.equal(detail.json().data.company.code, "UNIQUE");
    });

    test("ELITE to UNIQUE is rejected and the database still holds ELITE", async () => {
      const vehicle = await createVehicleOk(eliteId, { vehicleName: `MC E2U ${run}` });
      const res = await updateVehicle(vehicle.id, { companyId: uniqueId });
      assert.equal(res.statusCode, 422, res.body);
      assert.equal(res.json().error.context.reason, "immutable_field");
      assert.equal(await storedCompanyId(vehicle.id), eliteId);
    });

    test("re-sending the vehicle's own company is a no-op, not an error", async () => {
      const vehicle = await createVehicleOk(eliteId, { vehicleName: `MC SAME ${run}` });
      const res = await updateVehicle(vehicle.id, { companyId: eliteId, dailyRate: 120 });
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.json().data.dailyRate, 120);
      assert.equal(res.json().data.company.code, "ELITE");
      assert.equal(await storedCompanyId(vehicle.id), eliteId);
    });

    test("an externalId update stays scoped to the vehicle's permanent company", async () => {
      const externalId = `EXT-IMM-${run}`;
      await createVehicleOk(uniqueId, {
        externalId,
        vehicleName: `MC EXT U ${run}`,
        plateNumber: `MC E1 ${run}`.slice(0, 20),
      });
      const elite = await createVehicleOk(eliteId, {
        vehicleName: `MC EXT E ${run}`,
        plateNumber: `MC E2 ${run}`.slice(0, 20),
      });

      // Free inside ELITE even though UNIQUE already uses it.
      const ok = await updateVehicle(elite.id, { externalId });
      assert.equal(ok.statusCode, 200, ok.body);
      assert.equal(ok.json().data.externalId, externalId);

      // Taken inside ELITE now.
      const other = await createVehicleOk(eliteId, {
        vehicleName: `MC EXT E2 ${run}`,
        plateNumber: `MC E3 ${run}`.slice(0, 20),
      });
      const clash = await updateVehicle(other.id, { externalId });
      assert.equal(clash.statusCode, 409, clash.body);
    });
  });

  describe("contracts", () => {
    test("a contract inherits its company from the vehicle and ignores a client value", async () => {
      const elite = await createVehicleOk(eliteId, { vehicleName: `MC C E ${run}` });
      const res = await createOffer(elite.id, { companyId: uniqueId, company: "UNIQUE" });
      assert.equal(res.statusCode, 201, res.body);
      const detail = res.json().data as { id: string; company: { id: number; code: string } };
      assert.equal(detail.company.code, "ELITE");
      assert.equal(detail.company.id, eliteId);

      const stored = await prisma.contract.findUniqueOrThrow({
        where: { id: detail.id },
        select: { companyId: true },
      });
      assert.equal(stored.companyId, eliteId);
    });

    test("a rejected company change leaves old and new contracts on the same company", async () => {
      const vehicle = await createVehicleOk(uniqueId, { vehicleName: `MC XFER ${run}` });
      const first = await createOffer(vehicle.id);
      assert.equal(first.statusCode, 201, first.body);
      const firstId = first.json().data.id as string;
      assert.equal(first.json().data.company.code, "UNIQUE");

      // Vehicle company is write-once: the transfer attempt is refused outright.
      const transfer = await updateVehicle(vehicle.id, { companyId: eliteId });
      assert.equal(transfer.statusCode, 422, transfer.body);
      assert.equal(transfer.json().error.context.reason, "immutable_field");

      const stillUnique = await prisma.vehicle.findUniqueOrThrow({
        where: { id: vehicle.id },
        select: { companyId: true },
      });
      assert.equal(stillUnique.companyId, uniqueId, "vehicle company moved");

      const unchanged = await app.inject({
        method: "GET",
        url: `/contracts/${firstId}`,
        headers: auth(),
      });
      assert.equal(unchanged.json().data.company.code, "UNIQUE");

      // A new contract inherits the same permanent company, not a transferred one.
      const second = await createOffer(vehicle.id);
      assert.equal(second.statusCode, 201, second.body);
      assert.equal(second.json().data.company.code, "UNIQUE");

      // The list filters on the contract's own company.
      const uniqueList = await app.inject({
        method: "GET",
        url: `/contracts?companyId=${uniqueId}&pageSize=100`,
        headers: auth(),
      });
      const uniqueIds = (uniqueList.json().data as Array<{ id: string }>).map((row) => row.id);
      assert.ok(uniqueIds.includes(firstId), "historical UNIQUE contract left its company");

      const eliteList = await app.inject({
        method: "GET",
        url: `/contracts?companyId=${eliteId}&pageSize=100`,
        headers: auth(),
      });
      const eliteIds = (eliteList.json().data as Array<{ id: string }>).map((row) => row.id);
      assert.ok(!eliteIds.includes(firstId), "historical contract moved into another company");
    });
  });

  describe("official contract, public rental and TARS", () => {
    test("the official contract view carries the contract's company identity", async () => {
      const vehicle = await createVehicleOk(eliteId, { vehicleName: `MC OC ${run}` });
      const offer = await createOffer(vehicle.id);
      const contractId = offer.json().data.id as string;

      const link = await app.inject({
        method: "POST",
        url: `/contracts/${contractId}/rental-link`,
        headers: auth(),
      });
      assert.equal(link.statusCode, 200, link.body);
      const rentalToken = link.json().data.link.token as string;

      const official = await app.inject({
        method: "GET",
        url: `/contracts/rental/${rentalToken}/official-contract`,
      });
      assert.equal(official.statusCode, 200, official.body);
      const header = official.json().data.header as {
        company: { code: string; legalNameEn: string; legalNameAr: string };
      };
      assert.equal(header.company.code, "ELITE");
      assert.equal(header.company.legalNameEn, "DIAMOND ELITE CAR RENTALS CO. LLC S.O.C");
      assert.match(header.company.legalNameAr, /دايموند إيليت/);

      // The customer sees the renting company; they never choose it.
      const context = await app.inject({ method: "GET", url: `/contracts/rental/${rentalToken}` });
      assert.equal(context.statusCode, 200, context.body);
      assert.equal(context.json().data.office.company.code, "ELITE");
    });

    test("TARS status reports the routing company and stays unconfigured", async () => {
      const vehicle = await createVehicleOk(uniqueId, { vehicleName: `MC TARS ${run}` });
      const offer = await createOffer(vehicle.id);
      const contractId = offer.json().data.id as string;

      const res = await app.inject({
        method: "GET",
        url: `/contracts/${contractId}/tars`,
        headers: auth(),
      });
      assert.equal(res.statusCode, 200, res.body);
      const tars = res.json().data.tars as { configured: boolean; company: { code: string } };
      assert.equal(tars.company.code, "UNIQUE");
      assert.equal(tars.configured, false);
    });
  });
}
