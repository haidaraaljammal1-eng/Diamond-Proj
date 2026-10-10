import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { companyId as resolveCompanyId } from "tests/helpers/operating-company";
import {
  assignVehicleGpsBindingFixture,
  createGpsProviderAccountFixture,
} from "tests/helpers/gps-fixture";
import type { GpsProviderAdapter } from "src/modules/gps/gps-provider.adapter";
import type {
  GpsProviderFleetFetchContext,
  GpsProviderSyncRuntime,
  ProviderFleetFetchResult,
  ProviderNormalizedSnapshot,
} from "src/modules/gps/gps-provider.types";
import { GPS_CAPABILITIES_NONE } from "src/modules/gps/gps-provider.capabilities";
import {
  releaseGpsProviderSyncLease,
  tryAcquireGpsProviderSyncLease,
} from "src/modules/gps/gps-provider-sync.lease";
import {
  createGpsProviderSyncService,
  resetGpsProviderSyncShutdownForTests,
} from "src/modules/gps/gps-provider-sync.service";
import { resetGpsSyncInstanceOwnerTokenForTests } from "src/modules/gps/gps-sync-instance-owner";
import { registerGpsAcceptedPositionObserver } from "src/modules/gps/gps.observers";
import { createGpsService } from "src/modules/gps/gps.service";
import { providerSnapshotToIngestInput } from "src/modules/gps/gps-provider-ingest";
import { isGpsProviderConfigured } from "src/modules/gps/gps-provider-configured";
import { GPS_PROVIDER_SYNC_CADENCE_MS } from "src/modules/gps/gps-provider-sync.constants";

const RUN =
  process.env.RUN_INTEGRATION === "true" && Boolean(process.env.TEST_DATABASE_URL);

function makeSnapshot(
  deviceId: string,
  capturedAt: Date,
  lat: number,
  lng: number,
): ProviderNormalizedSnapshot {
  return {
    externalDeviceId: deviceId,
    deviceMetadata: {},
    telemetry: {
      capturedAt,
      latitude: lat,
      longitude: lng,
      speedKph: 10,
      sourceEventId: `evt-${deviceId}-${capturedAt.getTime()}-${lat}-${lng}`,
    },
  };
}

class MockFleetAdapter implements GpsProviderAdapter {
  readonly providerKey: string;
  readonly displayName = "Mock";
  readonly staticCapabilities = GPS_CAPABILITIES_NONE;
  readonly supportsFleetSync = true;
  fetchCalls = 0;
  historyCalls = 0;
  controlCalls = 0;
  snapshots: ProviderNormalizedSnapshot[];

  constructor(providerKey: string, snapshots: ProviderNormalizedSnapshot[]) {
    this.providerKey = providerKey;
    this.snapshots = snapshots;
  }

  async fetchFleetSnapshot(
    ctx: GpsProviderFleetFetchContext,
    _runtime: GpsProviderSyncRuntime,
  ): Promise<ProviderFleetFetchResult> {
    this.fetchCalls += 1;
    return {
      providerAccountId: ctx.providerAccountId,
      snapshots: this.snapshots,
      validRowCount: this.snapshots.length,
      invalidRowCount: 0,
      timezoneOffset: "+04:00",
    };
  }

  async fetchHistory(): Promise<never> {
    this.historyCalls += 1;
    throw new Error("history not allowed in sync");
  }
}

if (!RUN) {
  test(
    "gps provider sync integration skipped (RUN_INTEGRATION=true and TEST_DATABASE_URL)",
    { skip: true },
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;

  let app: FastifyInstance;
  let prisma: PrismaClient;
  const run = Date.now().toString(36).toUpperCase();
  let eliteId = 0;
  let vehicleId = 0;

  before(async () => {
    resetGpsProviderSyncShutdownForTests();
    resetGpsSyncInstanceOwnerTokenForTests();
    const { buildApp } = await import("src/app");
    app = await buildApp();
    prisma = app.prisma;
    eliteId = await resolveCompanyId(prisma, "ELITE");
    const { createVehiclesService } = await import("src/modules/vehicles/vehicles.service");
    const vehicles = createVehiclesService(app);
    const v = await vehicles.create({
      companyId: eliteId,
      vehicleName: `Sync ${run}`,
      dailyRate: 100,
      monthlyRate: 2000,
    });
    vehicleId = v.id;
  });

  after(async () => {
    resetGpsProviderSyncShutdownForTests();
    await app.close();
  });

  describe("sync lease", () => {
    test("expired lease can be acquired; active foreign lease cannot", async () => {
      const account = await createGpsProviderAccountFixture(prisma, {
        providerKey: "TEST_GPS",
        accountKey: `lease-${run}`,
        displayName: "Lease",
      });
      const ownerA = "owner-a";
      const ownerB = "owner-b";
      assert.equal(
        await tryAcquireGpsProviderSyncLease(prisma, { accountId: account.id, ownerToken: ownerA }),
        true,
      );
      assert.equal(
        await tryAcquireGpsProviderSyncLease(prisma, { accountId: account.id, ownerToken: ownerB }),
        false,
      );
      await prisma.gpsProviderAccount.update({
        where: { id: account.id },
        data: { syncLeaseExpiresAt: new Date(Date.now() - 1_000) },
      });
      assert.equal(
        await tryAcquireGpsProviderSyncLease(prisma, { accountId: account.id, ownerToken: ownerB }),
        true,
      );
      await releaseGpsProviderSyncLease(prisma, { accountId: account.id, ownerToken: ownerB });
      await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
    });

    test("same owner cannot re-acquire while lease unexpired", async () => {
      const account = await createGpsProviderAccountFixture(prisma, {
        providerKey: "TEST_GPS",
        accountKey: `lease-same-${run}`,
        displayName: "Lease same",
      });
      const owner = "owner-same";
      assert.equal(
        await tryAcquireGpsProviderSyncLease(prisma, { accountId: account.id, ownerToken: owner }),
        true,
      );
      assert.equal(
        await tryAcquireGpsProviderSyncLease(prisma, { accountId: account.id, ownerToken: owner }),
        false,
      );
      await releaseGpsProviderSyncLease(prisma, { accountId: account.id, ownerToken: owner });
      await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
    });

    test("release only clears matching owner", async () => {
      const account = await createGpsProviderAccountFixture(prisma, {
        providerKey: "TEST_GPS",
        accountKey: `lease-rel-${run}`,
        displayName: "Lease rel",
      });
      const owner = "owner-rel";
      await tryAcquireGpsProviderSyncLease(prisma, { accountId: account.id, ownerToken: owner });
      assert.equal(
        await releaseGpsProviderSyncLease(prisma, {
          accountId: account.id,
          ownerToken: "other",
        }),
        false,
      );
      assert.equal(
        await releaseGpsProviderSyncLease(prisma, { accountId: account.id, ownerToken: owner }),
        true,
      );
      await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
    });
  });

  describe("orchestrator", () => {
    test("disabled account produces zero fleet fetches", async () => {
      const adapter = new MockFleetAdapter("LIVE_GPS", []);
      const account = await createGpsProviderAccountFixture(prisma, {
        providerKey: "LIVE_GPS",
        accountKey: `dis-${run}`,
        displayName: "Disabled",
        enabled: false,
        withCredentials: true,
      });
      const sync = createGpsProviderSyncService(app, {
        resolveAdapter: (k) => (k === "LIVE_GPS" ? adapter : null),
      });
      await sync.runGpsProviderSyncCycle();
      assert.equal(adapter.fetchCalls, 0);
      await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
    });

    test("enabled without credentials skips fleet fetch", async () => {
      const adapter = new MockFleetAdapter("LIVE_GPS", []);
      const account = await createGpsProviderAccountFixture(prisma, {
        providerKey: "LIVE_GPS",
        accountKey: `nocred-${run}`,
        displayName: "No cred",
        enabled: true,
        withCredentials: false,
      });
      const sync = createGpsProviderSyncService(app, {
        resolveAdapter: (k) => (k === "LIVE_GPS" ? adapter : null),
      });
      await sync.runGpsProviderSyncCycle();
      assert.equal(adapter.fetchCalls, 0);
      await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
    });

    test("enabled configured account performs one fleet fetch and ingests bindings", async () => {
      const deviceId = `dev-sync-${run}`;
      const captured = new Date("2026-10-09T12:00:00.000Z");
      const adapter = new MockFleetAdapter("LIVE_GPS", [
        makeSnapshot(deviceId, captured, 25.1, 55.2),
        makeSnapshot(`unbound-${run}`, captured, 25.2, 55.3),
      ]);
      const account = await createGpsProviderAccountFixture(prisma, {
        providerKey: "LIVE_GPS",
        accountKey: `en-${run}`,
        displayName: "Enabled",
        enabled: true,
        withCredentials: true,
      });
      await assignVehicleGpsBindingFixture(prisma, {
        vehicleId,
        providerAccountId: account.id,
        externalDeviceId: deviceId,
      });

      const sync = createGpsProviderSyncService(app, {
        resolveAdapter: (k) => (k === "LIVE_GPS" ? adapter : null),
      });
      const result = await sync.syncOneAccount(
        await prisma.gpsProviderAccount.findUniqueOrThrow({ where: { id: account.id } }),
      );
      assert.equal(adapter.fetchCalls, 1);
      assert.equal(adapter.historyCalls, 0);
      assert.equal(result.fetchSuccess, true);
      const latest = await prisma.vehicleGpsLatestState.findUnique({ where: { vehicleId } });
      assert.ok(latest);
      await prisma.vehicleGpsLatestState.deleteMany({ where: { vehicleId } });
      await prisma.vehicleGpsBinding.deleteMany({ where: { providerAccountId: account.id } });
      await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
    });

    test("concurrent orchestrator calls only one lease winner fetches", async () => {
      const deviceId = `dev-race-${run}`;
      const adapter = new MockFleetAdapter("LIVE_GPS", [
        makeSnapshot(deviceId, new Date("2026-10-09T12:05:00.000Z"), 25.1, 55.2),
      ]);
      const account = await createGpsProviderAccountFixture(prisma, {
        providerKey: "LIVE_GPS",
        accountKey: `race-${run}`,
        displayName: "Race",
        enabled: true,
        withCredentials: true,
      });
      await assignVehicleGpsBindingFixture(prisma, {
        vehicleId,
        providerAccountId: account.id,
        externalDeviceId: deviceId,
      });
      const sync = createGpsProviderSyncService(app, {
        resolveAdapter: (k) => (k === "LIVE_GPS" ? adapter : null),
      });
      const [a, b] = await Promise.all([
        sync.syncOneAccount(
          await prisma.gpsProviderAccount.findUniqueOrThrow({ where: { id: account.id } }),
        ),
        sync.syncOneAccount(
          await prisma.gpsProviderAccount.findUniqueOrThrow({ where: { id: account.id } }),
        ),
      ]);
      assert.equal(adapter.fetchCalls, 1);
      assert.ok(
        (a.fetchSuccess && b.skipped) ||
          (b.fetchSuccess && a.skipped) ||
          a.skipped === "lease_busy" ||
          b.skipped === "lease_busy" ||
          a.skipped === "in_flight" ||
          b.skipped === "in_flight",
      );
      await prisma.vehicleGpsLatestState.deleteMany({ where: { vehicleId } });
      await prisma.vehicleGpsBinding.deleteMany({ where: { providerAccountId: account.id } });
      await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
    });

    test("duplicate and stale ingests do not invoke observer", async () => {
      const deviceId = `dev-obs-${run}`;
      const gps = createGpsService(app);
      const base = makeSnapshot(deviceId, new Date("2026-10-09T13:00:00.000Z"), 25.5, 55.5);
      const account = await createGpsProviderAccountFixture(prisma, {
        providerKey: "LIVE_GPS",
        accountKey: `obs-${run}`,
        displayName: "Obs",
        enabled: true,
        withCredentials: true,
      });
      await assignVehicleGpsBindingFixture(prisma, {
        vehicleId,
        providerAccountId: account.id,
        externalDeviceId: deviceId,
      });
      await gps.ingestLatestPosition(providerSnapshotToIngestInput(base, vehicleId));

      let observerCalls = 0;
      const unregister = registerGpsAcceptedPositionObserver({
        onAcceptedPosition: async () => {
          observerCalls += 1;
        },
      });

      const adapter = new MockFleetAdapter("LIVE_GPS", [base]);
      const sync = createGpsProviderSyncService(app, {
        resolveAdapter: (k) => (k === "LIVE_GPS" ? adapter : null),
        now: () => new Date("2026-10-09T14:00:00.000Z"),
      });
      await prisma.gpsProviderAccount.update({
        where: { id: account.id },
        data: { lastAttemptAt: null },
      });
      await sync.syncOneAccount(
        await prisma.gpsProviderAccount.findUniqueOrThrow({ where: { id: account.id } }),
      );
      assert.equal(observerCalls, 0);

      const newer = makeSnapshot(
        deviceId,
        new Date("2026-10-09T13:30:00.000Z"),
        25.6,
        55.6,
      );
      adapter.snapshots = [newer];
      await prisma.gpsProviderAccount.update({
        where: { id: account.id },
        data: { lastAttemptAt: null, syncLeaseOwner: null, syncLeaseExpiresAt: null },
      });
      await sync.syncOneAccount(
        await prisma.gpsProviderAccount.findUniqueOrThrow({ where: { id: account.id } }),
      );
      assert.equal(observerCalls, 1);
      unregister();
      await prisma.vehicleGpsLatestState.deleteMany({ where: { vehicleId } });
      await prisma.vehicleGpsBinding.deleteMany({ where: { providerAccountId: account.id } });
      await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
    });

    test("providerConfigured true when locally configured even if disabled", async () => {
      const { setGpsProviderForTests } = await import("src/modules/gps/gps.provider");
      setGpsProviderForTests(undefined);
      const account = await createGpsProviderAccountFixture(prisma, {
        providerKey: "LIVE_GPS",
        accountKey: `cfg-${run}`,
        displayName: "Cfg",
        enabled: false,
        withCredentials: true,
      });
      assert.equal(await isGpsProviderConfigured(prisma), true);
      await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
    });

    test("not due within cadence skips without fetch", async () => {
      const adapter = new MockFleetAdapter("LIVE_GPS", []);
      const account = await createGpsProviderAccountFixture(prisma, {
        providerKey: "LIVE_GPS",
        accountKey: `due-${run}`,
        displayName: "Due",
        enabled: true,
        withCredentials: true,
      });
      await prisma.gpsProviderAccount.update({
        where: { id: account.id },
        data: { lastAttemptAt: new Date() },
      });
      const sync = createGpsProviderSyncService(app, {
        resolveAdapter: (k) => (k === "LIVE_GPS" ? adapter : null),
      });
      const result = await sync.syncOneAccount(
        await prisma.gpsProviderAccount.findUniqueOrThrow({ where: { id: account.id } }),
      );
      assert.equal(result.skipped, "not_due");
      assert.equal(adapter.fetchCalls, 0);
      await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
    });

    test("cadence elapsed allows fetch", async () => {
      const adapter = new MockFleetAdapter("LIVE_GPS", []);
      const account = await createGpsProviderAccountFixture(prisma, {
        providerKey: "LIVE_GPS",
        accountKey: `due2-${run}`,
        displayName: "Due2",
        enabled: true,
        withCredentials: true,
      });
      await prisma.gpsProviderAccount.update({
        where: { id: account.id },
        data: {
          lastAttemptAt: new Date(Date.now() - GPS_PROVIDER_SYNC_CADENCE_MS - 1_000),
        },
      });
      const sync = createGpsProviderSyncService(app, {
        resolveAdapter: (k) => (k === "LIVE_GPS" ? adapter : null),
      });
      await sync.syncOneAccount(
        await prisma.gpsProviderAccount.findUniqueOrThrow({ where: { id: account.id } }),
      );
      assert.equal(adapter.fetchCalls, 1);
      await prisma.gpsProviderAccount.delete({ where: { id: account.id } });
    });
  });
}
