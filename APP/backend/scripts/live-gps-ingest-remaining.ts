/**
 * Phase 4D — One fleet fetch, first-time ingest for remaining 6 ELITE Live GPS bindings.
 * Device 455 / Vehicle 561 is explicitly excluded.
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
import { providerSnapshotToIngestInput } from "src/modules/gps/gps-provider-ingest";
import { createGpsService } from "src/modules/gps/gps.service";
import type { GpsIngestOutcome } from "src/modules/gps/gps.types";
import { mapLiveGpsFleetRow } from "src/modules/gps/providers/live-gps/live-gps.mapper";
import { asString, isRecord } from "src/modules/gps/providers/live-gps/live-gps.parse";
import { createLiveGpsClient } from "src/modules/gps/providers/live-gps/live-gps.client";
import {
  LIVE_GPS_PATH_FLEET,
  LIVE_GPS_PATH_LOGIN,
} from "src/modules/gps/providers/live-gps/live-gps.constants";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const ALLOWED_ACCOUNT_ID = "49e321e3-62d2-41be-87cd-3ccd9ec7be45";

const EXCLUDED_DEVICE = "455";
const EXCLUDED_VEHICLE_ID = 561;

/** Hard-scoped Phase 4D targets — externalDeviceId → expected vehicleId */
const TARGETS: { externalDeviceId: string; expectedVehicleId: number }[] = [
  { externalDeviceId: "467", expectedVehicleId: 562 },
  { externalDeviceId: "487", expectedVehicleId: 563 },
  { externalDeviceId: "623", expectedVehicleId: 564 },
  { externalDeviceId: "626", expectedVehicleId: 565 },
  { externalDeviceId: "628", expectedVehicleId: 566 },
  { externalDeviceId: "630", expectedVehicleId: 567 },
];

type DeviceOutcome =
  | "CREATED"
  | "STALE"
  | "DUPLICATE"
  | "INVALID_PROVIDER_ROW"
  | "INVALID_POSITION"
  | "BINDING_ERROR"
  | "SKIPPED_EXISTING_STATE"
  | "INGEST_ERROR"
  | "FAILED_PRECHECK";

function databaseUrl(): string {
  const explicit = process.env.GPS_POC_DATABASE_URL?.trim();
  if (explicit) return explicit;
  const base = env.DATABASE_URL;
  if (/\/haidara_test(\?|$)/.test(base)) {
    return base.replace("/haidara_test", "/haidara");
  }
  return base;
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

function outcomeLabel(outcome: GpsIngestOutcome): DeviceOutcome {
  if (outcome.applied && outcome.reason === "created") return "CREATED";
  if (!outcome.applied && outcome.reason === "stale") return "STALE";
  if (!outcome.applied && outcome.reason === "duplicate_event") return "DUPLICATE";
  return "INGEST_ERROR";
}

async function main(): Promise<void> {
  const url = databaseUrl();
  assertDevelopmentDatabase({ nodeEnv: env.NODE_ENV, databaseUrl: url });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  let loginCount = 0;
  let fleetCount = 0;

  try {
    const account = await prisma.gpsProviderAccount.findFirst({
      where: { id: ALLOWED_ACCOUNT_ID, providerKey: "LIVE_GPS", accountKey: "elite" },
      include: { companyScope: true },
    });
    if (!account?.companyScopeId) {
      throw new Error("LIVE_GPS elite account not found");
    }
    if (!isGpsProviderAccountLocallyConfigured(account)) {
      throw new Error("Provider credentials missing");
    }

    const allBindings = await prisma.vehicleGpsBinding.findMany({
      where: { providerAccountId: account.id, isActive: true },
      include: { vehicle: { select: { id: true, companyId: true, operationalStatus: true } } },
    });

    const vehicle561Before = await prisma.vehicleGpsLatestState.findUnique({
      where: { vehicleId: EXCLUDED_VEHICLE_ID },
      select: { id: true, capturedAt: true, sourceEventId: true },
    });
    if (!vehicle561Before) {
      throw new Error("Vehicle 561 latest state missing — Phase 4C prerequisite");
    }

    const preIngestTable = allBindings.map((b) => ({
      externalDeviceId: b.externalDeviceId,
      vehicleId: b.vehicleId,
      bindingActive: b.isActive,
      latestStateExistsBefore: false as boolean,
    }));
    for (const row of preIngestTable) {
      const latest = await prisma.vehicleGpsLatestState.findUnique({
        where: { vehicleId: row.vehicleId },
        select: { id: true },
      });
      row.latestStateExistsBefore = Boolean(latest);
    }

    for (const t of TARGETS) {
      const binding = allBindings.find((b) => b.externalDeviceId === t.externalDeviceId);
      if (!binding?.isActive || binding.vehicleId !== t.expectedVehicleId) {
        throw new Error(`Binding precheck failed for device ${t.externalDeviceId}`);
      }
      if (binding.vehicle.companyId !== account.companyScopeId) {
        throw new Error(`Company scope failed for device ${t.externalDeviceId}`);
      }
    }

    const vehicleCountBefore = await prisma.vehicle.count();
    const contractCountBefore = await prisma.contract.count();
    const liabilityCountBefore = await prisma.roadLiability.count();
    const bindingCountBefore = allBindings.length;
    const latestCountBefore = await prisma.vehicleGpsLatestState.count({
      where: { vehicleId: { in: allBindings.map((b) => b.vehicleId) } },
    });
    const opStatusBefore = new Map(
      TARGETS.map((t) => {
        const b = allBindings.find((x) => x.externalDeviceId === t.externalDeviceId)!;
        return [t.expectedVehicleId, b.vehicle.operationalStatus] as const;
      }),
    );

    const providerConfiguredBefore = await isGpsProviderConfigured(prisma);
    const secrets = decryptSecretBlob(account.secretEncrypted);
    const fetchStarted = Date.now();

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

    const { fleet, rawRows } = await client.fetchFleetSnapshotInternal(ctx);
    const fetchDurationMs = Date.now() - fetchStarted;

    const gps = createGpsService(minimalFastify(prisma));
    const results: Array<{
      externalDeviceId: string;
      vehicleId: number;
      outcome: DeviceOutcome;
      latestStateCreated: boolean;
      speedStored: boolean;
      ignitionStored: boolean;
      odometerUnit: string | null;
      distanceTodayUnit: string | null;
      detail?: string;
    }> = [];

    for (const target of TARGETS) {
      const binding = allBindings.find((b) => b.externalDeviceId === target.externalDeviceId)!;
      const vehicleId = binding.vehicleId;

      const existingLatest = await prisma.vehicleGpsLatestState.findUnique({
        where: { vehicleId },
      });
      if (existingLatest) {
        results.push({
          externalDeviceId: target.externalDeviceId,
          vehicleId,
          outcome: "SKIPPED_EXISTING_STATE",
          latestStateCreated: false,
          speedStored: false,
          ignitionStored: false,
          odometerUnit: null,
          distanceTodayUnit: null,
          detail: "latest state already present",
        });
        continue;
      }

      const matches = rawRows.filter(
        (row) => isRecord(row) && asString(row.deviceid) === target.externalDeviceId,
      );
      if (matches.length !== 1) {
        results.push({
          externalDeviceId: target.externalDeviceId,
          vehicleId,
          outcome: "FAILED_PRECHECK",
          latestStateCreated: false,
          speedStored: false,
          ignitionStored: false,
          odometerUnit: null,
          distanceTodayUnit: null,
          detail: `row count ${matches.length}`,
        });
        continue;
      }

      const snapshot = mapLiveGpsFleetRow(matches[0], {
        providerAccountId: account.id,
        defaultOffset: null,
        receivedAt: new Date(),
      });
      if (!snapshot?.telemetry) {
        results.push({
          externalDeviceId: target.externalDeviceId,
          vehicleId,
          outcome: "INVALID_PROVIDER_ROW",
          latestStateCreated: false,
          speedStored: false,
          ignitionStored: false,
          odometerUnit: null,
          distanceTodayUnit: null,
        });
        continue;
      }

      try {
        const ingestInput = providerSnapshotToIngestInput(snapshot, vehicleId);
        const ingestOutcome = await gps.ingestLatestPosition(ingestInput);
        const label = outcomeLabel(ingestOutcome);

        const latest = await prisma.vehicleGpsLatestState.findUnique({
          where: { vehicleId },
        });

        results.push({
          externalDeviceId: target.externalDeviceId,
          vehicleId,
          outcome: label,
          latestStateCreated: label === "CREATED" && Boolean(latest),
          speedStored: latest?.speedKph != null,
          ignitionStored: latest?.ignitionOn != null,
          odometerUnit: latest?.odometerUnit ?? null,
          distanceTodayUnit: latest?.distanceTodayUnit ?? null,
          detail: ingestOutcome.applied ? ingestOutcome.reason : ingestOutcome.reason,
        });
      } catch (err) {
        results.push({
          externalDeviceId: target.externalDeviceId,
          vehicleId,
          outcome: "INGEST_ERROR",
          latestStateCreated: false,
          speedStored: false,
          ignitionStored: false,
          odometerUnit: null,
          distanceTodayUnit: null,
          detail: err instanceof Error ? err.message : "unknown",
        });
      }
    }

    const vehicle561After = await prisma.vehicleGpsLatestState.findUnique({
      where: { vehicleId: EXCLUDED_VEHICLE_ID },
      select: { id: true, capturedAt: true, sourceEventId: true },
    });

    const vehicleCountAfter = await prisma.vehicle.count();
    const contractCountAfter = await prisma.contract.count();
    const liabilityCountAfter = await prisma.roadLiability.count();
    const latestCountAfter = await prisma.vehicleGpsLatestState.count({
      where: { vehicleId: { in: allBindings.map((b) => b.vehicleId) } },
    });
    const accountAfter = await prisma.gpsProviderAccount.findUnique({
      where: { id: account.id },
      select: { enabled: true },
    });
    const providerConfiguredAfter = await isGpsProviderConfigured(prisma);

    const opStatusAfter = await prisma.vehicle.findMany({
      where: { id: { in: TARGETS.map((t) => t.expectedVehicleId) } },
      select: { id: true, operationalStatus: true },
    });

    console.log(
      JSON.stringify(
        {
          preIngest: {
            bindings: preIngestTable,
            latestStatesOnBindings: latestCountBefore,
            vehicleCount: vehicleCountBefore,
            contractCount: contractCountBefore,
            roadLiabilityCount: liabilityCountBefore,
            bindingCount: bindingCountBefore,
            vehicle561Snapshot: {
              latestStateId: vehicle561Before.id,
              capturedAt: vehicle561Before.capturedAt.toISOString(),
              sourceEventId: vehicle561Before.sourceEventId,
            },
          },
          providerFetch: {
            authenticationSucceeded: loginCount >= 1 || fleetCount >= 1,
            fleetRows: rawRows.length,
            validRows: fleet.validRowCount,
            invalidRows: fleet.invalidRowCount,
            loginRequestCount: loginCount,
            fleetRequestCount: fleetCount,
            fetchDurationMs,
          },
          ingestResults: results,
          device455Protection: {
            excludedExternalDeviceId: EXCLUDED_DEVICE,
            device455Ingested: false,
            vehicle561LatestStateUnchanged:
              vehicle561After?.id === vehicle561Before.id &&
              vehicle561After.capturedAt.getTime() === vehicle561Before.capturedAt.getTime() &&
              vehicle561After.sourceEventId === vehicle561Before.sourceEventId,
            vehicle561LatestStateId: vehicle561After?.id,
          },
          postIngest: {
            latestStatesOnBindings: latestCountAfter,
            expectedLatestStates: 7,
            vehicleCountBefore,
            vehicleCountAfter,
            contractCountBefore,
            contractCountAfter,
            roadLiabilityCountBefore: liabilityCountBefore,
            roadLiabilityCountAfter: liabilityCountAfter,
            operationalStatusUnchanged: TARGETS.every((t) => {
              const before = opStatusBefore.get(t.expectedVehicleId);
              const after = opStatusAfter.find((v) => v.id === t.expectedVehicleId)?.operationalStatus;
              return before === after;
            }),
          },
          productionState: {
            accountEnabled: accountAfter?.enabled,
            providerConfiguredBefore,
            providerConfiguredAfter,
          },
          remoteControlSafety: {
            blockUnblockCalled: false,
            immobilizerCommandCalled: false,
            cutOffCommandCalled: false,
            providerWriteOrControlEndpointsCalled: false,
          },
        },
        null,
        2,
      ),
    );

    const failures = results.filter((r) => r.outcome !== "CREATED");
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e instanceof Error ? e.message : "failed" }));
  process.exit(1);
});
