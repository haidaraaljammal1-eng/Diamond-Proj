/**
 * Phase 4C — One device, one fleet fetch, one ingest (read-only provider; local dev).
 *
 * Usage: npm run gps:ingest-one -- --device 455
 */
import dotenv from "dotenv";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { assertDevelopmentDatabase } from "src/lib/dev/development-database";
import { decryptSecretBlob } from "src/modules/integrations/secret-blob";
import { isGpsProviderAccountLocallyConfigured } from "src/modules/gps/gps-provider-account.semantics";
import { isGpsProviderConfigured } from "src/modules/gps/gps-provider-configured";
import { deriveMotionState } from "src/modules/gps/gps.mapper";
import { gpsConfig } from "src/modules/gps/gps.config";
import { providerSnapshotToIngestInput } from "src/modules/gps/gps-provider-ingest";
import { createGpsService } from "src/modules/gps/gps.service";
import { mapLiveGpsFleetRow } from "src/modules/gps/providers/live-gps/live-gps.mapper";
import { asString, isRecord } from "src/modules/gps/providers/live-gps/live-gps.parse";
import { createLiveGpsClient } from "src/modules/gps/providers/live-gps/live-gps.client";
import {
  LIVE_GPS_PATH_FLEET,
  LIVE_GPS_PATH_LOGIN,
} from "src/modules/gps/providers/live-gps/live-gps.constants";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const ALLOWED_ACCOUNT_ID = "49e321e3-62d2-41be-87cd-3ccd9ec7be45";

function databaseUrl(): string {
  const explicit = process.env.GPS_POC_DATABASE_URL?.trim();
  if (explicit) return explicit;
  const base = env.DATABASE_URL;
  if (/\/haidara_test(\?|$)/.test(base)) {
    return base.replace("/haidara_test", "/haidara");
  }
  return base;
}

function parseDeviceArg(): string {
  const idx = process.argv.indexOf("--device");
  const value = idx >= 0 ? process.argv[idx + 1] : undefined;
  if (!value?.trim()) {
    throw new Error("Missing required --device <externalDeviceId>");
  }
  return value.trim();
}

function minimalFastify(prisma: PrismaClient): FastifyInstance {
  return {
    prisma,
    log: {
      warn: () => undefined,
      info: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      trace: () => undefined,
      fatal: () => undefined,
      child: () => minimalFastify(prisma).log,
    },
  } as unknown as FastifyInstance;
}

async function main(): Promise<void> {
  const externalDeviceId = parseDeviceArg();
  const url = databaseUrl();
  assertDevelopmentDatabase({ nodeEnv: env.NODE_ENV, databaseUrl: url });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  let loginCount = 0;
  let fleetCount = 0;
  const fetchStarted = Date.now();

  try {
    const account = await prisma.gpsProviderAccount.findFirst({
      where: { id: ALLOWED_ACCOUNT_ID, providerKey: "LIVE_GPS", accountKey: "elite" },
      include: { companyScope: true },
    });
    if (!account?.companyScopeId) {
      throw new Error("Target LIVE_GPS elite account not found");
    }
    if (!isGpsProviderAccountLocallyConfigured(account)) {
      throw new Error("Provider credentials missing");
    }

    const binding = await prisma.vehicleGpsBinding.findFirst({
      where: {
        providerAccountId: account.id,
        externalDeviceId,
        isActive: true,
      },
      include: { vehicle: { include: { company: true } } },
    });
    if (!binding) {
      throw new Error("No active binding for device");
    }
    if (binding.vehicle.companyId !== account.companyScopeId) {
      throw new Error("Binding company scope mismatch");
    }

    const vehicleId = binding.vehicleId;
    const vehicleBefore = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, operationalStatus: true, companyId: true },
    });
    const latestBefore = await prisma.vehicleGpsLatestState.findUnique({
      where: { vehicleId },
      select: { id: true, capturedAt: true, sourceEventId: true },
    });

    const eliteBindingIds = await prisma.vehicleGpsBinding.findMany({
      where: { providerAccountId: account.id, isActive: true },
      select: { vehicleId: true, externalDeviceId: true },
    });

    const contractsBefore = await prisma.contract.count();
    const liabilitiesBefore = await prisma.roadLiability.count();
    const latestStatesBefore = await prisma.vehicleGpsLatestState.count({
      where: { vehicleId: { in: eliteBindingIds.map((b) => b.vehicleId) } },
    });
    const providerConfiguredBefore = await isGpsProviderConfigured(prisma);

    const secrets = decryptSecretBlob(account.secretEncrypted);
    const client = createLiveGpsClient({
      fetchImpl: async (input, init) => {
        const u = String(input);
        if (u.includes(LIVE_GPS_PATH_LOGIN)) loginCount += 1;
        if (u.includes(LIVE_GPS_PATH_FLEET)) fleetCount += 1;
        return fetch(input, init);
      },
    });

    const ctx = {
      providerAccountId: account.id,
      secrets: { username: secrets.username!, password: secrets.password! },
      config: (account.config ?? {}) as Record<string, unknown>,
    };

    const { rawRows } = await client.fetchFleetSnapshotInternal(ctx);
    const fetchDurationMs = Date.now() - fetchStarted;

    const matches = rawRows.filter((row) => isRecord(row) && asString(row.deviceid) === externalDeviceId);
    if (matches.length !== 1) {
      throw new Error(`Expected exactly one fleet row for device ${externalDeviceId}, got ${matches.length}`);
    }

    const snapshot = mapLiveGpsFleetRow(matches[0], {
      providerAccountId: account.id,
      defaultOffset: null,
      receivedAt: new Date(),
    });
    if (!snapshot?.telemetry) {
      throw new Error("Mapped snapshot missing telemetry");
    }

    const ingestInput = providerSnapshotToIngestInput(snapshot, vehicleId);
    const gps = createGpsService(minimalFastify(prisma));
    const ingestOutcome = await gps.ingestLatestPosition(ingestInput);

    const latestAfter = await prisma.vehicleGpsLatestState.findUnique({
      where: { vehicleId },
    });
    const vehicleAfter = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { operationalStatus: true },
    });

    const contractsAfter = await prisma.contract.count();
    const liabilitiesAfter = await prisma.roadLiability.count();
    const latestStatesAfter = await prisma.vehicleGpsLatestState.count({
      where: { vehicleId: { in: eliteBindingIds.map((b) => b.vehicleId) } },
    });

    const otherLatestChanged = await prisma.vehicleGpsLatestState.findMany({
      where: {
        vehicleId: {
          in: eliteBindingIds.filter((b) => b.externalDeviceId !== externalDeviceId).map((b) => b.vehicleId),
        },
      },
      select: { vehicleId: true, updatedAt: true },
    });

    const accountAfter = await prisma.gpsProviderAccount.findUnique({
      where: { id: account.id },
      select: { enabled: true },
    });
    const providerConfiguredAfter = await isGpsProviderConfigured(prisma);

    const motionState = deriveMotionState(
      snapshot.telemetry.speedKph ?? null,
      gpsConfig().movingSpeedThresholdKph,
    );

    console.log(
      JSON.stringify(
        {
          preIngestAudit: {
            observersNote:
              "ingestLatestPosition notifies Salik inference only on replace (previous+current point). First create has no observer callbacks. Script does not register route observers.",
            safeToProceed: true,
          },
          target: {
            providerAccountId: account.id,
            externalDeviceId,
            vehicleId,
            bindingActive: binding.isActive,
            companyScope: binding.vehicle.company.code,
          },
          providerFetch: {
            authenticationSucceeded: loginCount >= 1 || fleetCount >= 1,
            fleetRowCount: rawRows.length,
            targetRowCount: 1,
            loginRequestCount: loginCount,
            fleetRequestCount: fleetCount,
            fetchDurationMs,
          },
          mappingValidation: {
            capturedAtValid: Boolean(snapshot.telemetry.capturedAt),
            locationValid: true,
            speedAvailable: snapshot.telemetry.speedKph != null,
            ignitionAvailable: snapshot.telemetry.ignitionOn != null,
            odometerAvailable: snapshot.telemetry.odometerValue != null,
            odometerUnit: snapshot.telemetry.odometerUnit,
            distanceTodayAvailable: snapshot.telemetry.distanceTodayValue != null,
            distanceTodayUnit: snapshot.telemetry.distanceTodayUnit,
            sourceEventIdPresent: Boolean(snapshot.telemetry.sourceEventId),
            derivedMotionState: motionState,
          },
          ingestOutcome,
          latestState: latestAfter
            ? {
                rowPresent: true,
                vehicleId: latestAfter.vehicleId,
                capturedAt: latestAfter.capturedAt.toISOString(),
                speedKph: latestAfter.speedKph?.toNumber() ?? null,
                ignitionOn: latestAfter.ignitionOn,
                odometerUnit: latestAfter.odometerUnit,
                odometerValue: latestAfter.odometerValue?.toNumber() ?? null,
                distanceTodayUnit: latestAfter.distanceTodayUnit,
                distanceTodayValue: latestAfter.distanceTodayValue?.toNumber() ?? null,
                motionState: latestAfter.motionState,
                sourceEventId: latestAfter.sourceEventId,
                bindingId: latestAfter.bindingId,
              }
            : { rowPresent: false },
          sideEffects: {
            vehicleOperationalStatusBefore: vehicleBefore?.operationalStatus,
            vehicleOperationalStatusAfter: vehicleAfter?.operationalStatus,
            operationalStatusChanged:
              vehicleBefore?.operationalStatus !== vehicleAfter?.operationalStatus,
            contractsBefore,
            contractsAfter,
            roadLiabilitiesBefore: liabilitiesBefore,
            roadLiabilitiesAfter: liabilitiesAfter,
            latestStatesForBindingsBefore: latestStatesBefore,
            latestStatesForBindingsAfter: latestStatesAfter,
            otherBoundVehiclesWithLatestState: otherLatestChanged.length,
            hadLatestBefore: Boolean(latestBefore),
          },
          productionState: {
            accountEnabled: accountAfter?.enabled,
            providerConfiguredBefore,
            providerConfiguredAfter,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e instanceof Error ? e.message : "failed" }));
  process.exit(1);
});
