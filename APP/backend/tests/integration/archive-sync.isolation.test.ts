import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { companyId as testCompanyId } from "tests/helpers/operating-company";
import { businessWallClockFromUtc } from "src/modules/archive/archive-sync-time";
import { addArchiveVehicleWorksheet } from "src/modules/archive/archive-excel";
import { appendArchiveExcelMetaSheet } from "src/modules/archive/archive-excel-meta";
import { formatArchiveVehicleHeader } from "src/modules/archive/archive-export.constants";

/**
 * Archive pull-sync on disposable haidara_test only.
 * Calls syncContractIds for fixtures created by this file. Never calls runSync,
 * which would also create rows for every pre-existing accepted contract.
 */
const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

if (!RUN) {
  test("archive sync isolation skipped (set RUN_INTEGRATION=true and TEST_DATABASE_URL)", {
    skip: true,
  });
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  describe("archive sync isolation", { concurrency: false }, () => {
    let app: FastifyInstance;
    let prisma: PrismaClient;
    const run = Date.now().toString(36).toUpperCase();
    const admin = {
      email: `sync-admin-${run}@example.test`,
      password: "sync-admin-pass-123",
    };
    let adminToken = "";
    let userId = 0;
    let vehicleId = 0;
    let contractId = "";
    let foreignIds: number[] = [];
    let ledgerBefore = 0;
    let syncCursorBefore: Date | null = null;

    const PERMS = ["archive.read", "archive.manage"];

    async function seedUser() {
      const { hashPassword } = await import("src/lib/security/password");
      const { normalizeEmail } = await import("src/lib/security/normalize");
      const email = normalizeEmail(admin.email);
      const role = await prisma.role.upsert({
        where: { key: `sync_admin_${run}` },
        update: {},
        create: { key: `sync_admin_${run}`, name: "sync admin" },
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
      const user = await prisma.user.upsert({
        where: { email },
        update: { status: "ACTIVE", passwordHash },
        create: { email, name: `sync ${run}`, status: "ACTIVE", passwordHash },
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
      userId = user.id;
    }

    async function login() {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: admin,
      });
      assert.equal(res.statusCode, 200, res.body);
      adminToken = res.json().data.accessToken as string;
    }

    function auth() {
      return { authorization: `Bearer ${adminToken}` };
    }

    function multipartXlsx(filename: string, content: Buffer) {
      const boundary = `----archivesync${run}`;
      const head =
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;
      const tail = `\r\n--${boundary}--\r\n`;
      return {
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: Buffer.concat([Buffer.from(head), content, Buffer.from(tail)]),
      };
    }

    async function cleanupOwned() {
      if (!prisma || !vehicleId) return;
      const ownedVehicle = await prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { id: true, vehicleName: true },
      });
      if (ownedVehicle && ownedVehicle.vehicleName !== `SYNC-${run}`) {
        throw new Error("refusing cleanup: vehicle name is not owned by this run");
      }
      await prisma.archiveRow.deleteMany({ where: { vehicleId } });
      if (contractId) {
        await prisma.contractPayment.deleteMany({ where: { contractId } });
        await prisma.contractCarOut.deleteMany({ where: { contractId } });
        await prisma.contractAcceptance.deleteMany({ where: { contractId } });
        await prisma.contract.deleteMany({ where: { id: contractId, vehicleId } });
      }
      await prisma.vehicle.deleteMany({ where: { id: vehicleId, vehicleName: `SYNC-${run}` } });
      if (userId) {
        await prisma.userRole.deleteMany({ where: { userId } });
        await prisma.user.deleteMany({ where: { id: userId, email: admin.email.toLowerCase() } });
        await prisma.rolePermission.deleteMany({ where: { role: { key: `sync_admin_${run}` } } });
        await prisma.role.deleteMany({ where: { key: `sync_admin_${run}` } });
      }
    }

    before(async () => {
      const { env } = await import("src/config/env");
      if (!/\/haidara_test(?:\?|$)/.test(env.DATABASE_URL)) {
        throw new Error("archive sync isolation refuses to run unless DATABASE_URL is haidara_test");
      }
      const { buildApp } = await import("src/app");
      app = await buildApp();
      prisma = app.prisma;
      const db = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
      assert.equal(db[0]?.current_database, "haidara_test");

      foreignIds = (await prisma.archiveRow.findMany({ select: { id: true } })).map((row) => row.id);
      ledgerBefore = await prisma.financialLedgerEntry.count();
      const state = await prisma.archiveSyncState.findUnique({ where: { id: "global" } });
      syncCursorBefore = state?.lastSuccessfulSyncAt ?? null;

      await seedUser();
      await login();

      const companyId = await testCompanyId(prisma, "ELITE");
      const vehicle = await prisma.vehicle.create({
        data: {
          companyId,
          vehicleName: `SYNC-${run}`,
          plateNumber: `SY${run}`.slice(0, 16),
          dailyRate: 500,
          operationalStatus: "RENTED",
        },
      });
      vehicleId = vehicle.id;

      const occurredAt = new Date("2026-10-13T05:30:00.000Z");
      const contract = await prisma.contract.create({
        data: {
          contractNumber: `SYNC-${run}`,
          status: "ACTIVE",
          vehicleId,
          companyId,
          createdByUserId: userId,
          priceType: "DAILY",
          rentalDays: 3,
          durationValue: 3,
          durationUnit: "DAY",
          agreedAmount: 1500,
          collectionMode: "CASH",
          startAt: new Date("2026-10-13T05:00:00.000Z"),
          endAt: new Date("2026-10-16T05:00:00.000Z"),
          snapshot: {
            customer: { name: `Sync Customer ${run}`, mobile: "+971500001111" },
          },
        },
      });
      contractId = contract.id;
      await prisma.contractAcceptance.create({
        data: {
          contractId,
          acceptedAt: occurredAt,
          termsVersion: "diamond-rental-terms-v1",
        },
      });
      await prisma.contractCarOut.create({
        data: {
          contractId,
          performedByUserId: userId,
          occurredAt,
          mileageOut: 1200,
          fuelOut: "F",
          vehicleId,
        },
      });
      await prisma.contractPayment.create({
        data: {
          contractId,
          purpose: "RENTAL",
          targetId: contractId,
          amount: 1500,
          method: "CASH",
          status: "CONFIRMED",
          confirmedAt: occurredAt,
        },
      });
      await prisma.archiveRow.create({
        data: {
          vehicleId,
          rowOrder: 1,
          customerName: `MANUAL-ROW-${run}`,
          description: "hand entered",
        },
      });
    });

    after(async () => {
      try {
        await cleanupOwned();
      } finally {
        if (app) await app.close();
      }
    });

    test("sync creates one linked row, updates it, and a second run does not duplicate", async () => {
      const { createArchiveSyncService } = await import("src/modules/archive/archive-sync.service");
      const sync = createArchiveSyncService(app);
      const { env } = await import("src/config/env");
      const wall = businessWallClockFromUtc(
        new Date("2026-10-13T05:30:00.000Z"),
        env.BUSINESS_TIMEZONE_OFFSET_MINUTES,
      );

      const created = await sync.syncContractIds([contractId]);
      assert.equal(created.failed, 0, JSON.stringify(created.errors));
      assert.equal(created.created, 1);
      assert.equal(created.updated, 0);

      const rows = await prisma.archiveRow.findMany({
        where: { vehicleId },
        orderBy: { rowOrder: "asc" },
      });
      assert.equal(rows.length, 2);
      assert.equal(rows[0]?.contractId, null);
      assert.equal(rows[0]?.customerName, `MANUAL-ROW-${run}`);
      assert.equal(rows[0]?.description, "hand entered");
      const linked = rows[1]!;
      assert.equal(linked.contractId, contractId);
      assert.equal(linked.vehicleId, vehicleId);
      assert.equal(linked.rowOrder, 2);
      assert.equal(linked.customerName, `Sync Customer ${run}`);
      assert.equal(linked.customerPhone, "+971500001111");
      assert.equal(linked.days, 3);
      assert.equal(linked.dailyRate, 500);
      assert.equal(linked.rentalTotal, 1500);
      assert.equal(linked.cash, 1500);
      assert.equal(linked.visa, 0);
      assert.equal(linked.kmOut, 1200);
      assert.equal(linked.deliveryTime, wall.timeHm);

      await prisma.archiveRow.update({
        where: { id: linked.id },
        data: {
          fuel: 77,
          manualOverrides: { fuel: true },
          manualCellValues: { description: `CELL-${run}` },
        },
      });
      await prisma.contractPayment.updateMany({
        where: { contractId, purpose: "RENTAL" },
        data: { amount: 1800 },
      });
      await prisma.contract.update({
        where: { id: contractId },
        data: { agreedAmount: 1800 },
      });

      const updated = await sync.syncContractIds([contractId]);
      assert.equal(updated.failed, 0, JSON.stringify(updated.errors));
      assert.equal(updated.created, 0);
      assert.equal(updated.updated, 1);

      const afterUpdate = await prisma.archiveRow.findUniqueOrThrow({ where: { id: linked.id } });
      assert.equal(afterUpdate.contractId, contractId);
      assert.equal(afterUpdate.rowOrder, 2);
      assert.equal(afterUpdate.fuel, 77);
      assert.equal(afterUpdate.rentalTotal, 1800);
      assert.equal(afterUpdate.cash, 1800);
      assert.deepEqual(afterUpdate.manualCellValues, { description: `CELL-${run}` });
      assert.equal(await prisma.archiveRow.count({ where: { vehicleId } }), 2);
      assert.equal(await prisma.archiveRow.count({ where: { contractId } }), 1);

      const again = await sync.syncContractIds([contractId]);
      assert.equal(again.created, 0);
      assert.equal(again.updated, 0);
      assert.equal(again.unchanged, 1);
      assert.equal(await prisma.archiveRow.count({ where: { contractId } }), 1);

      const manual = await prisma.archiveRow.findFirstOrThrow({
        where: { vehicleId, contractId: null },
      });
      assert.equal(manual.customerName, `MANUAL-ROW-${run}`);
      assert.equal(manual.description, "hand entered");
      assert.equal(await prisma.financialLedgerEntry.count(), ledgerBefore);
    });

    test("a second sync lock is refused and the cursor stays untouched", async () => {
      const { createArchiveSyncService } = await import("src/modules/archive/archive-sync.service");
      const sync = createArchiveSyncService(app);
      const first = await sync.acquireRunningLock(userId);
      assert.equal(first, true);
      try {
        const second = await sync.acquireRunningLock(userId);
        assert.equal(second, false);
        const status = await sync.getStatus();
        assert.equal(status.running, true);
      } finally {
        await sync.releaseRunningLock();
      }
      const released = await sync.getStatus();
      assert.equal(released.running, false);
      const state = await prisma.archiveSyncState.findUniqueOrThrow({ where: { id: "global" } });
      assert.equal(state.lastSuccessfulSyncAt?.toISOString() ?? null, syncCursorBefore?.toISOString() ?? null);
      assert.equal(state.runningStartedAt, null);
    });

    test("a single-vehicle workbook round-trips the owned row without touching other archive rows", async () => {
      const linked = await prisma.archiveRow.findFirstOrThrow({ where: { contractId } });
      const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const ownedRows = await prisma.archiveRow.findMany({
        where: { vehicleId },
        orderBy: { rowOrder: "asc" },
      });
      addArchiveVehicleWorksheet(workbook, `SYNC-${run}`.slice(0, 31), {
        id: vehicleId,
        displayName: vehicle.vehicleName ?? `SYNC-${run}`,
        plateNumber: vehicle.plateNumber,
      }, ownedRows);
      const sheet = workbook.worksheets[0]!;
      assert.equal(
        sheet.getCell("A1").value,
        formatArchiveVehicleHeader(vehicle.vehicleName ?? `SYNC-${run}`, vehicle.plateNumber),
      );
      sheet.getRow(4).getCell(10).value = `IMPORT-${run}`;
      appendArchiveExcelMetaSheet(workbook, [
        {
          vehicleId,
          rowOrder: linked.rowOrder,
          contractId,
          manualOverrides: { fuel: true },
          manualCellValues: { description: `CELL-${run}` },
        },
      ]);
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      const { headers, payload } = multipartXlsx("owned-archive.xlsx", buffer);
      const preview = await app.inject({
        method: "POST",
        url: "/archive/import/preview",
        headers: { ...auth(), ...headers },
        payload,
      });
      assert.equal(preview.statusCode, 200, preview.body);
      assert.equal(preview.json().data.canConfirm, true);
      const token = preview.json().data.importToken as string;
      const confirm = await app.inject({
        method: "POST",
        url: "/archive/import/confirm",
        headers: auth(),
        payload: { importToken: token },
      });
      assert.equal(confirm.statusCode, 200, confirm.body);

      const rows = await prisma.archiveRow.findMany({
        where: { vehicleId },
        orderBy: { rowOrder: "asc" },
      });
      const imported = rows.find((row) => row.contractId === contractId);
      assert.ok(imported);
      assert.equal(imported!.description, `IMPORT-${run}`);
      assert.equal(imported!.fuel, 77);
      assert.deepEqual(imported!.manualCellValues, { description: `CELL-${run}` });

      const foreignAfter = (await prisma.archiveRow.findMany({ select: { id: true } }))
        .map((row) => row.id)
        .filter((id) => foreignIds.includes(id))
        .sort((a, b) => a - b);
      assert.deepEqual(foreignAfter, [...foreignIds].sort((a, b) => a - b));
      assert.equal(await prisma.financialLedgerEntry.count(), ledgerBefore);
    });
  });
}
