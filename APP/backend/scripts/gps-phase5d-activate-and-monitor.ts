/**
 * Phase 5D — enable LIVE_GPS elite permanently and poll account facts (read-only monitor).
 * Does NOT disable account. Does NOT run manual sync — scheduler must run cycles.
 */
import dotenv from "dotenv";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const ELITE_ID = "49e321e3-62d2-41be-87cd-3ccd9ec7be45";

function assertHaidara(url: string): void {
  if (!url.includes("haidara") || url.includes("haidara_test")) {
    throw new Error("Refusing: DATABASE_URL must be haidara dev, not haidara_test");
  }
}

async function facts(prisma: PrismaClient) {
  const account = await prisma.gpsProviderAccount.findUniqueOrThrow({ where: { id: ELITE_ID } });
  const leaseCols = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'gps_provider_accounts'
      AND column_name IN ('syncLeaseOwner', 'syncLeaseExpiresAt')
  `;
  const pending = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`
    SELECT migration_name, finished_at FROM "_prisma_migrations"
    WHERE migration_name = '20261009120000_gps_provider_account_sync_lease'
  `;
  const bindings = await prisma.vehicleGpsBinding.count({
    where: { providerAccountId: ELITE_ID, isActive: true },
  });
  const latest = await prisma.vehicleGpsLatestState.count({
    where: { vehicle: { gpsBinding: { providerAccountId: ELITE_ID, isActive: true } } },
  });
  const gpsInf = await prisma.roadLiabilityObservation.count({ where: { sourceKey: "GPS_INFERENCE" } });
  const unsafe = await prisma.roadLiability.count({
    where: {
      observations: { some: { sourceKey: "GPS_INFERENCE" } },
      OR: [{ amount: { not: null } }, { confirmationStatus: { not: "PENDING_CONFIRMATION" } }],
    },
  });
  const { isGpsProviderConfigured } = await import("src/modules/gps/gps-provider-configured");
  const configured = await isGpsProviderConfigured(prisma);
  return {
    account: {
      providerKey: account.providerKey,
      accountKey: account.accountKey,
      enabled: account.enabled,
      companyScopeId: account.companyScopeId,
      hasSecret: Boolean(account.secretEncrypted?.trim()),
      lastAttemptAt: account.lastAttemptAt,
      lastSuccessfulSyncAt: account.lastSuccessfulSyncAt,
      lastFailureAt: account.lastFailureAt,
      lastFailureCode: account.lastFailureCode,
      lastDeviceCount: account.lastDeviceCount,
      syncLeaseOwner: account.syncLeaseOwner,
      syncLeaseExpiresAt: account.syncLeaseExpiresAt,
    },
    leaseMigrationApplied: pending[0]?.finished_at != null,
    leaseColumns: leaseCols.map((c) => c.column_name).sort(),
    bindings,
    latestStates: latest,
    providerConfigured: configured,
    business: {
      vehicles: await prisma.vehicle.count(),
      contracts: await prisma.contract.count(),
    },
    gpsInferenceObservations: gpsInf,
    unsafeGpsInferenceLiabilities: unsafe,
  };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  assertHaidara(url);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const pre = await facts(prisma);
  if (!pre.account.hasSecret || pre.bindings !== 7 || pre.latestStates !== 7) {
    throw new Error("PRE_CHECK_FAILED");
  }
  if (!pre.leaseMigrationApplied || pre.leaseColumns.length < 2) {
    throw new Error("LEASE_MIGRATION_MISSING");
  }
  if (pre.account.enabled) {
    console.log(JSON.stringify({ phase: "5D", note: "already_enabled", pre }, null, 2));
    await prisma.$disconnect();
    return;
  }

  await prisma.gpsProviderAccount.update({
    where: { id: ELITE_ID },
    data: { enabled: true },
  });
  const enabledVerify = await prisma.gpsProviderAccount.findUniqueOrThrow({
    where: { id: ELITE_ID },
    select: { enabled: true },
  });
  if (!enabledVerify.enabled) throw new Error("ENABLE_FAILED");

  const snapshots: unknown[] = [{ at: new Date().toISOString(), event: "enabled", ...(await facts(prisma)) }];
  const baselineAttempt = pre.account.lastAttemptAt?.toISOString() ?? null;
  const waitMs = 195_000;
  const intervalMs = 15_000;
  const end = Date.now() + waitMs;
  while (Date.now() < end) {
    await new Promise((r) => setTimeout(r, intervalMs));
    snapshots.push({ at: new Date().toISOString(), ...(await facts(prisma)) });
  }

  const post = await facts(prisma);
  if (post.unsafeGpsInferenceLiabilities > 0) {
    await prisma.gpsProviderAccount.update({ where: { id: ELITE_ID }, data: { enabled: false } });
    throw new Error("FINANCIAL_SAFETY_STOP");
  }

  process.env.SCHEDULER_ENABLED = "false";
  const { buildApp } = await import("src/app");
  const app = await buildApp();
  const { isGpsProviderConfigured } = await import("src/modules/gps/gps-provider-configured");
  const { createGpsService } = await import("src/modules/gps/gps.service");
  const gps = createGpsService(app);
  const summary = await gps.summary();
  const mapPoints = await gps.mapPoints();
  const list = await gps.list({ page: 1, pageSize: 50, status: "all" });
  const first = await prisma.vehicleGpsBinding.findFirst({
    where: { providerAccountId: ELITE_ID, isActive: true },
    select: { vehicleId: true },
  });
  const detail = first ? await gps.getVehicle(first.vehicleId) : null;
  await app.close();

  console.log(
    JSON.stringify(
      {
        phase: "5D",
        baselineLastAttemptAt: baselineAttempt,
        enabledRemains: post.account.enabled,
        pollSnapshots: snapshots,
        post,
        staffApi: {
          providerConfigured: await isGpsProviderConfigured(prisma),
          summaryTracked: summary.trackedVehicles,
          mapPointCount: mapPoints.length,
          listTotal: list.meta.total,
          detailOk: detail != null && detail.gps.trackingStatus !== "not_configured",
        },
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
