/**
 * Phase 5C — exactly three real LIVE_GPS / elite sync cycles on haidara, then disable.
 * SCHEDULER_ENABLED must be false. No provider control/history endpoints.
 */
import dotenv from "dotenv";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { GPS_PROVIDER_SYNC_CADENCE_MS } from "src/modules/gps/gps-provider-sync.constants";
import { getGpsProviderAdapter } from "src/modules/gps/gps-provider.registry";
import { isGpsProviderConfigured } from "src/modules/gps/gps-provider-configured";
import { LiveGpsAdapter } from "src/modules/gps/providers/live-gps/live-gps.adapter";
import {
  LIVE_GPS_PATH_DEVICE_LIST,
  LIVE_GPS_PATH_FLEET,
  LIVE_GPS_PATH_HISTORY,
  LIVE_GPS_PATH_LOGIN,
} from "src/modules/gps/providers/live-gps/live-gps.constants";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
process.env.SCHEDULER_ENABLED = "false";

const ELITE_ACCOUNT_ID = "49e321e3-62d2-41be-87cd-3ccd9ec7be45";
const CYCLES = 3;

function databaseUrl(): string {
  const url = process.env.DATABASE_URL ?? "";
  if (!/\/haidara(\?|$)/.test(url) || /haidara_test/.test(url)) {
    throw new Error("Phase 5C requires DATABASE_URL targeting haidara (not haidara_test)");
  }
  return url;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type TransportCounts = {
  login: number;
  fleet: number;
  deviceList: number;
  history: number;
};

function createInstrumentedLiveGpsAdapter(): {
  adapter: LiveGpsAdapter;
  counts: () => TransportCounts;
  resetCounts: () => void;
} {
  const counts: TransportCounts = { login: 0, fleet: 0, deviceList: 0, history: 0 };
  const adapter = new LiveGpsAdapter({
    fetchImpl: async (input, init) => {
      const u = String(input);
      if (u.includes(LIVE_GPS_PATH_LOGIN)) counts.login += 1;
      if (u.includes(LIVE_GPS_PATH_FLEET)) counts.fleet += 1;
      if (u.includes(LIVE_GPS_PATH_DEVICE_LIST)) counts.deviceList += 1;
      if (u.includes(LIVE_GPS_PATH_HISTORY)) counts.history += 1;
      return fetch(input, init);
    },
  });
  return {
    adapter,
    counts: () => ({ ...counts }),
    resetCounts: () => {
      counts.login = 0;
      counts.fleet = 0;
      counts.deviceList = 0;
      counts.history = 0;
    },
  };
}

async function snapshot(prisma: PrismaClient) {
  const account = await prisma.gpsProviderAccount.findFirst({
    where: { id: ELITE_ACCOUNT_ID, providerKey: "LIVE_GPS", accountKey: "elite" },
  });
  if (!account) throw new Error("LIVE_GPS elite account not found");

  const bindings = await prisma.vehicleGpsBinding.findMany({
    where: { providerAccountId: account.id, isActive: true },
    select: { vehicleId: true, externalDeviceId: true },
    orderBy: { externalDeviceId: "asc" },
  });

  const latestByVehicle = await prisma.vehicleGpsLatestState.findMany({
    where: { vehicleId: { in: bindings.map((b) => b.vehicleId) } },
    select: {
      vehicleId: true,
      id: true,
      capturedAt: true,
      sourceEventId: true,
      bindingId: true,
    },
  });

  const vehicles = await prisma.vehicle.findMany({
    where: { id: { in: bindings.map((b) => b.vehicleId) } },
    select: { id: true, operationalStatus: true },
  });

  const gpsInferenceCount = await prisma.roadLiabilityObservation.count({
    where: { sourceKey: "GPS_INFERENCE" },
  });

  const unsafeInference = await prisma.roadLiability.count({
    where: {
      observations: { some: { sourceKey: "GPS_INFERENCE", authoritative: true } },
    },
  });

  const unsafeInferenceStatus = await prisma.roadLiability.count({
    where: {
      observations: { some: { sourceKey: "GPS_INFERENCE" } },
      OR: [{ amount: { not: null } }, { confirmationStatus: { not: "PENDING_CONFIRMATION" } }],
    },
  });

  const chargeableGps = await prisma.roadLiability.count({
    where: {
      observations: { some: { sourceKey: "GPS_INFERENCE" } },
      confirmationStatus: "CONFIRMED",
      amount: { gt: 0 },
      attributedContractId: { not: null },
      collectionStatus: "OPEN",
    },
  });

  return {
    account: {
      providerKey: account.providerKey,
      accountKey: account.accountKey,
      enabled: account.enabled,
      lastAttemptAt: account.lastAttemptAt,
      lastSuccessfulSyncAt: account.lastSuccessfulSyncAt,
      lastFailureAt: account.lastFailureAt,
      lastFailureCode: account.lastFailureCode,
      lastDeviceCount: account.lastDeviceCount,
      syncLeaseOwner: account.syncLeaseOwner,
      syncLeaseExpiresAt: account.syncLeaseExpiresAt,
    },
    gps: {
      activeBindings: bindings.length,
      latestStateCount: latestByVehicle.length,
      vehicles: vehicles.map((v) => ({
        vehicleId: v.id,
        operationalStatus: v.operationalStatus,
        latestStateId: latestByVehicle.find((l) => l.vehicleId === v.id)?.id ?? null,
        capturedAt: latestByVehicle.find((l) => l.vehicleId === v.id)?.capturedAt ?? null,
        sourceEventId: latestByVehicle.find((l) => l.vehicleId === v.id)?.sourceEventId ?? null,
      })),
    },
    business: {
      vehicles: await prisma.vehicle.count(),
      contracts: await prisma.contract.count(),
      roadLiabilities: await prisma.roadLiability.count(),
      gpsInferenceObservations: gpsInferenceCount,
      unsafeGpsInferenceLiabilities: unsafeInference + unsafeInferenceStatus,
      chargeableGpsInferenceLiabilities: chargeableGps,
    },
  };
}

async function waitUntilDue(prisma: PrismaClient, accountId: string): Promise<void> {
  for (;;) {
    const row = await prisma.gpsProviderAccount.findUniqueOrThrow({ where: { id: accountId } });
    if (!row.lastAttemptAt) return;
    const elapsed = Date.now() - row.lastAttemptAt.getTime();
    if (elapsed >= GPS_PROVIDER_SYNC_CADENCE_MS) return;
    const wait = GPS_PROVIDER_SYNC_CADENCE_MS - elapsed + 500;
    await sleep(wait);
  }
}

async function assertFinancialSafety(prisma: PrismaClient): Promise<void> {
  const snap = await snapshot(prisma);
  if (snap.business.unsafeGpsInferenceLiabilities > 0 || snap.business.chargeableGpsInferenceLiabilities > 0) {
    throw new Error("FINANCIAL_SAFETY_STOP");
  }
}

async function staffGpsApiCheck(app: FastifyInstance): Promise<Record<string, unknown>> {
  const configured = await isGpsProviderConfigured(app.prisma);
  const { createGpsService } = await import("src/modules/gps/gps.service");
  const gps = createGpsService(app);
  const summary = await gps.summary();
  const list = await gps.list({
    page: 1,
    pageSize: 20,
    status: "all",
    sort: "createdAt:desc",
  });
  const mapPoints = await gps.mapPoints();
  const firstBinding = await app.prisma.vehicleGpsBinding.findFirst({
    where: { providerAccountId: ELITE_ACCOUNT_ID, isActive: true },
    select: { vehicleId: true },
  });
  const detail = firstBinding ? await gps.getVehicle(firstBinding.vehicleId) : null;
  return {
    providerConfigured: configured,
    summaryProviderConfigured: summary.providerConfigured,
    trackedVehicles: summary.trackedVehicles,
    listTotal: list.meta.total,
    listWithGpsSignal: list.data.filter(
      (r) => r.gps.trackingStatus !== "not_configured" && r.gps.trackingStatus !== "unassigned",
    ).length,
    mapPointCount: mapPoints.length,
    detailVehicleId: detail?.vehicle.id ?? null,
    detailHasLatest: detail?.gps.latitude != null,
  };
}

async function main(): Promise<void> {
  const { env } = await import("src/config/env");
  const { assertDevelopmentDatabase } = await import("src/lib/dev/development-database");
  const { createGpsProviderSyncService, resetGpsProviderSyncShutdownForTests } =
    await import("src/modules/gps/gps-provider-sync.service");

  if (env.SCHEDULER_ENABLED) {
    throw new Error("SCHEDULER_ENABLED must be false for Phase 5C");
  }

  const url = databaseUrl();
  assertDevelopmentDatabase({ nodeEnv: env.NODE_ENV, databaseUrl: url });

  resetGpsProviderSyncShutdownForTests();

  const { buildApp } = await import("src/app");
  const app = await buildApp();
  const prisma = app.prisma;

  const { adapter, counts, resetCounts } = createInstrumentedLiveGpsAdapter();
  const sync = createGpsProviderSyncService(app, {
    resolveAdapter: (key) => (key === "LIVE_GPS" ? adapter : getGpsProviderAdapter(key)),
  });

  const report: Record<string, unknown> = {
    phase: "5C",
    database: "haidara",
    schedulerEnabledInProcess: env.SCHEDULER_ENABLED,
  };

  let enabledForTest = false;
  const pre = await snapshot(prisma);
  report.preActivation = pre;

  try {
    await prisma.gpsProviderAccount.update({
      where: { id: ELITE_ACCOUNT_ID },
      data: { enabled: true },
    });
    enabledForTest = true;
    const enabledCheck = await prisma.gpsProviderAccount.findUniqueOrThrow({
      where: { id: ELITE_ACCOUNT_ID },
      select: { enabled: true },
    });
    if (!enabledCheck.enabled) throw new Error("Failed to enable elite account");

    report.activation = { eliteEnabled: true, onlyAccountTouched: ELITE_ACCOUNT_ID };

    const cycleReports: Record<string, unknown>[] = [];
    let gpsInferenceBaseline = pre.business.gpsInferenceObservations;

    for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
      if (cycle > 1) await waitUntilDue(prisma, ELITE_ACCOUNT_ID);
      resetCounts();
      const leaseBefore = await prisma.gpsProviderAccount.findUniqueOrThrow({
        where: { id: ELITE_ACCOUNT_ID },
        select: { syncLeaseOwner: true, syncLeaseExpiresAt: true, lastAttemptAt: true },
      });
      const accountRow = await prisma.gpsProviderAccount.findUniqueOrThrow({
        where: { id: ELITE_ACCOUNT_ID },
      });
      const started = Date.now();
      const result = await sync.syncOneAccount(accountRow);
      const durationMs = Date.now() - started;
      const transport = counts();
      const accountAfter = await prisma.gpsProviderAccount.findUniqueOrThrow({
        where: { id: ELITE_ACCOUNT_ID },
      });
      const inferenceNow = await prisma.roadLiabilityObservation.count({
        where: { sourceKey: "GPS_INFERENCE" },
      });
      const inferenceAdded = inferenceNow - gpsInferenceBaseline;
      gpsInferenceBaseline = inferenceNow;

      await assertFinancialSafety(prisma);

      cycleReports.push({
        cycle,
        startedAt: new Date(started).toISOString(),
        durationMs,
        leaseAcquired:
          result.skipped !== "lease_busy" && result.skipped !== "in_flight" && !result.skipped,
        skipped: result.skipped ?? null,
        fetchSuccess: result.fetchSuccess ?? null,
        errorCode: result.errorCode ?? null,
        counters: result.counters ?? null,
        loginRequests: transport.login,
        fleetRequests: transport.fleet,
        deviceListRequests: transport.deviceList,
        historyRequests: transport.history,
        leaseAfter: {
          syncLeaseOwner: accountAfter.syncLeaseOwner,
          syncLeaseExpiresAt: accountAfter.syncLeaseExpiresAt,
        },
        lastSuccessfulSyncAt: accountAfter.lastSuccessfulSyncAt,
        lastFailureCode: accountAfter.lastFailureCode,
        gpsInferenceRowsAddedThisCycle: inferenceAdded,
        leaseBefore: {
          syncLeaseOwner: leaseBefore.syncLeaseOwner,
          syncLeaseExpiresAt: leaseBefore.syncLeaseExpiresAt,
        },
      });

      if (transport.history > 0 || transport.deviceList > 0) {
        throw new Error("FORBIDDEN_PROVIDER_ENDPOINT_CALLED");
      }
      if (result.fetchSuccess && transport.fleet > 1) {
        throw new Error("MORE_THAN_ONE_FLEET_REQUEST");
      }

      const biz = (await snapshot(prisma)).business;
      report[`cycle${cycle}Business`] = biz;
    }

    report.cycles = cycleReports;
    report.staffGpsApi = await staffGpsApiCheck(app);
  } finally {
    await prisma.gpsProviderAccount.update({
      where: { id: ELITE_ACCOUNT_ID },
      data: { enabled: false },
    });
    enabledForTest = false;
    const postDisable = await prisma.gpsProviderAccount.findUniqueOrThrow({
      where: { id: ELITE_ACCOUNT_ID },
      select: { enabled: true, syncLeaseOwner: true, syncLeaseExpiresAt: true },
    });
    if (postDisable.enabled) {
      report.cleanupFailed = true;
      throw new Error("CRITICAL: failed to disable LIVE_GPS elite account");
    }
    report.postActivation = await snapshot(prisma);
    report.cleanup = {
      eliteEnabled: postDisable.enabled,
      syncLeaseOwner: postDisable.syncLeaseOwner,
      syncLeaseExpiresAt: postDisable.syncLeaseExpiresAt,
    };
    await app.close();
  }

  report.enabledLeftOn = enabledForTest;
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
