import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

/**
 * Database-level guarantees of the multi-company foundation. These assert the
 * schema itself (NOT NULL, unique indexes, FK delete policy), not any route, so
 * they only run when RUN_INTEGRATION=true against a disposable test database.
 */
const RUN = process.env.RUN_INTEGRATION === "true";

if (!RUN) {
  test("operating company constraints skipped (set RUN_INTEGRATION=true + a test DATABASE_URL)", {
    skip: true,
  });
} else {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();
  const createdVehicleIds: number[] = [];
  let uniqueId = 0;
  let eliteId = 0;

  /** A minimal fleet vehicle under one company; tracked for cleanup. */
  async function createVehicle(companyId: number, data: Record<string, unknown> = {}) {
    const vehicle = await prisma.vehicle.create({
      data: { companyId, vehicleName: `Test Vehicle ${run}`, ...data },
    });
    createdVehicleIds.push(vehicle.id);
    return vehicle;
  }

  before(async () => {
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    const { runOperatingCompanySeed } = await import("prisma/seed/operating-companies");
    await runOperatingCompanySeed(prisma);
    uniqueId = (await prisma.operatingCompany.findUniqueOrThrow({ where: { code: "UNIQUE" } })).id;
    eliteId = (await prisma.operatingCompany.findUniqueOrThrow({ where: { code: "ELITE" } })).id;
  });

  after(async () => {
    if (createdVehicleIds.length) {
      await prisma.vehicle.deleteMany({ where: { id: { in: createdVehicleIds } } });
    }
    if (app) await app.close();
  });

  test("UNIQUE and ELITE each exist exactly once", async () => {
    assert.equal(await prisma.operatingCompany.count({ where: { code: "UNIQUE" } }), 1);
    assert.equal(await prisma.operatingCompany.count({ where: { code: "ELITE" } }), 1);
    const unique = await prisma.operatingCompany.findUniqueOrThrow({ where: { code: "UNIQUE" } });
    assert.equal(unique.isActive, true);
    assert.ok(unique.legalNameEn.length > 0);
    assert.ok(unique.legalNameAr.length > 0);
    assert.ok(unique.accentColor.startsWith("#"));
  });

  test("company code is unique", async () => {
    await assert.rejects(
      () =>
        prisma.operatingCompany.create({
          data: {
            code: "UNIQUE",
            displayName: "Duplicate",
            legalNameAr: "مكرر",
            legalNameEn: "DUPLICATE",
            accentColor: "#000000",
          },
        }),
      /Unique constraint|P2002/,
    );
  });

  test("a vehicle cannot be stored without a company", async () => {
    await assert.rejects(
      () =>
        prisma.$executeRaw`INSERT INTO "vehicles" ("vehicleName", "operationalStatus", "isActive", "createdAt", "updatedAt")
          VALUES (${`No Company ${run}`}, 'AVAILABLE', true, NOW(), NOW())`,
      /null value in column "companyId"|not-null/i,
    );
  });

  test("a vehicle cannot reference a company that does not exist", async () => {
    await assert.rejects(
      () => prisma.vehicle.create({ data: { companyId: 987654321, vehicleName: `Orphan ${run}` } }),
      /Foreign key constraint|P2003/,
    );
  });

  test("a contract cannot be stored without a company", async () => {
    await assert.rejects(
      () =>
        prisma.$executeRaw`INSERT INTO "contracts" ("id", "contractNumber", "vehicleId", "createdByUserId", "priceType", "rentalDays", "agreedAmount", "termsVersion", "createdAt", "updatedAt")
          VALUES (gen_random_uuid(), ${`NO-COMPANY-${run}`}, 1, 1, 'DAILY', 1, 100, 'diamond-rental-terms-v1', NOW(), NOW())`,
      /null value in column "companyId"|not-null/i,
    );
  });

  test("a company that owns vehicles cannot be deleted", async () => {
    await createVehicle(uniqueId, { plateNumber: `DEL ${run}` });
    await assert.rejects(
      () => prisma.operatingCompany.delete({ where: { id: uniqueId } }),
      /RESTRICT|Foreign key constraint|P2003|violates foreign key/,
    );
    assert.equal(await prisma.operatingCompany.count({ where: { id: uniqueId } }), 1);
  });

  test("plate number stays globally unique across companies", async () => {
    const plate = `PLATE ${run}`;
    await createVehicle(uniqueId, { plateNumber: plate });
    await assert.rejects(
      () => createVehicle(eliteId, { plateNumber: plate }),
      /Unique constraint|P2002/,
    );
  });

  test("VIN stays globally unique across companies", async () => {
    const vin = `VIN${run}`;
    await createVehicle(uniqueId, { vin });
    await assert.rejects(() => createVehicle(eliteId, { vin }), /Unique constraint|P2002/);
  });

  /**
   * externalId is unique PER COMPANY: UNIQUE and ELITE integrate with separate
   * external systems and may reuse the same id in their own namespaces.
   */
  test("the same externalId may exist once in each company", async () => {
    const externalId = `EXT-${run}`;
    await createVehicle(uniqueId, { externalId });
    const elite = await createVehicle(eliteId, { externalId });
    assert.equal(elite.externalId, externalId);
    assert.notEqual(elite.companyId, uniqueId);
  });

  test("the same externalId twice inside one company is rejected", async () => {
    const externalId = `EXT-SAME-${run}`;
    await createVehicle(uniqueId, { externalId });
    await assert.rejects(
      () => createVehicle(uniqueId, { externalId }),
      /Unique constraint|P2002/,
    );
  });
}
