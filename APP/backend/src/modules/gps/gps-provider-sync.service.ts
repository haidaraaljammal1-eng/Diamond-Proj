import type { FastifyInstance } from "fastify";
import type { GpsProviderAccount } from "@prisma/client";
import { AppError } from "src/lib/errors/app-error";
import { decryptSecretBlob } from "src/modules/integrations/secret-blob";
import { getSharedLiveGpsSessionManager } from "src/modules/gps/gps-live-gps-sessions";
import {
  isGpsProviderAccountLocallyConfigured,
  isGpsProviderAccountSyncEnabled,
} from "src/modules/gps/gps-provider-account.semantics";
import type { GpsProviderAdapter } from "src/modules/gps/gps-provider.adapter";
import { getGpsProviderAdapter } from "src/modules/gps/gps-provider.registry";
import { providerSnapshotToIngestInput } from "src/modules/gps/gps-provider-ingest";
import {
  GPS_PROVIDER_SYNC_CADENCE_MS,
  GpsProviderSyncFailureCode,
} from "src/modules/gps/gps-provider-sync.constants";
import { mapErrorToGpsSyncFailureCode } from "src/modules/gps/gps-provider-sync.failure";
import {
  releaseGpsProviderSyncLease,
  tryAcquireGpsProviderSyncLease,
} from "src/modules/gps/gps-provider-sync.lease";
import type { ProviderNormalizedSnapshot } from "src/modules/gps/gps-provider.types";
import { createGpsService } from "src/modules/gps/gps.service";
import { getGpsSyncInstanceOwnerToken } from "src/modules/gps/gps-sync-instance-owner";

export type GpsProviderSyncCycleCounters = {
  providerRows: number;
  validRows: number;
  mappedRows: number;
  boundRows: number;
  accepted: number;
  stale: number;
  duplicate: number;
  unbound: number;
  invalid: number;
  failed: number;
};

export type GpsProviderAccountSyncResult = {
  providerAccountId: string;
  providerKey: string;
  skipped?: "not_due" | "in_flight" | "lease_busy" | "shutdown";
  fetchSuccess?: boolean;
  errorCode?: string;
  durationMs?: number;
  counters?: GpsProviderSyncCycleCounters;
};

export type GpsProviderSyncCycleSummary = {
  accountsConsidered: number;
  accountsAttempted: number;
  results: GpsProviderAccountSyncResult[];
};

export type GpsProviderSyncServiceOptions = {
  resolveAdapter?: (providerKey: string) => GpsProviderAdapter | null;
  now?: () => Date;
};

const inFlightAccounts = new Set<string>();
let shutdownRequested = false;
let activeAccountCycles = 0;

export function requestGpsProviderSyncShutdown(): void {
  shutdownRequested = true;
}

export function resetGpsProviderSyncShutdownForTests(): void {
  shutdownRequested = false;
  inFlightAccounts.clear();
  activeAccountCycles = 0;
}

export async function awaitGpsProviderSyncDrain(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (activeAccountCycles > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }
  return activeAccountCycles === 0;
}

function emptyCounters(): GpsProviderSyncCycleCounters {
  return {
    providerRows: 0,
    validRows: 0,
    mappedRows: 0,
    boundRows: 0,
    accepted: 0,
    stale: 0,
    duplicate: 0,
    unbound: 0,
    invalid: 0,
    failed: 0,
  };
}

function isAccountDue(account: GpsProviderAccount, now: Date): boolean {
  if (!account.lastAttemptAt) return true;
  return now.getTime() - account.lastAttemptAt.getTime() >= GPS_PROVIDER_SYNC_CADENCE_MS;
}

function snapshotByDeviceId(
  snapshots: ProviderNormalizedSnapshot[],
): Map<string, ProviderNormalizedSnapshot> {
  const map = new Map<string, ProviderNormalizedSnapshot>();
  for (const snap of snapshots) {
    if (!snap.externalDeviceId) continue;
    if (map.has(snap.externalDeviceId)) continue;
    map.set(snap.externalDeviceId, snap);
  }
  return map;
}

export function createGpsProviderSyncService(
  fastify: FastifyInstance,
  options: GpsProviderSyncServiceOptions = {},
) {
  const prisma = fastify.prisma;
  const gps = createGpsService(fastify);
  const nowFn = options.now ?? (() => new Date());
  const resolveAdapter =
    options.resolveAdapter ?? ((key: string) => getGpsProviderAdapter(key));

  const runtime = {
    liveGpsSessionManager: getSharedLiveGpsSessionManager(),
  };

  async function persistAttemptStarted(accountId: string, at: Date): Promise<void> {
    await prisma.gpsProviderAccount.update({
      where: { id: accountId },
      data: { lastAttemptAt: at },
    });
  }

  async function persistFetchSuccess(
    accountId: string,
    at: Date,
    deviceCount: number,
  ): Promise<void> {
    await prisma.gpsProviderAccount.update({
      where: { id: accountId },
      data: {
        lastSuccessfulSyncAt: at,
        lastDeviceCount: deviceCount,
        lastFailureAt: null,
        lastFailureCode: null,
      },
    });
  }

  async function persistFetchFailure(
    accountId: string,
    at: Date,
    errorCode: string,
  ): Promise<void> {
    await prisma.gpsProviderAccount.update({
      where: { id: accountId },
      data: {
        lastFailureAt: at,
        lastFailureCode: errorCode,
      },
    });
  }

  async function syncOneAccount(account: GpsProviderAccount): Promise<GpsProviderAccountSyncResult> {
    const base = {
      providerAccountId: account.id,
      providerKey: account.providerKey,
    };

    if (shutdownRequested) {
      return { ...base, skipped: "shutdown" };
    }

    const now = nowFn();
    if (!isAccountDue(account, now)) {
      return { ...base, skipped: "not_due" };
    }

    if (inFlightAccounts.has(account.id)) {
      return { ...base, skipped: "in_flight" };
    }

    const ownerToken = getGpsSyncInstanceOwnerToken();
    const acquired = await tryAcquireGpsProviderSyncLease(prisma, {
      accountId: account.id,
      ownerToken,
    });
    if (!acquired) {
      return { ...base, skipped: "lease_busy" };
    }

    inFlightAccounts.add(account.id);
    activeAccountCycles += 1;
    const started = Date.now();
    const counters = emptyCounters();

    try {
      if (shutdownRequested) {
        return { ...base, skipped: "shutdown" };
      }

      await persistAttemptStarted(account.id, now);

      const adapter = resolveAdapter(account.providerKey);
      if (!adapter?.supportsFleetSync || !adapter.fetchFleetSnapshot) {
        await persistFetchFailure(
          account.id,
          nowFn(),
          GpsProviderSyncFailureCode.UNSUPPORTED_PROVIDER,
        );
        return {
          ...base,
          fetchSuccess: false,
          errorCode: GpsProviderSyncFailureCode.UNSUPPORTED_PROVIDER,
          durationMs: Date.now() - started,
          counters,
        };
      }

      const credentials = decryptSecretBlob(account.secretEncrypted);
      let fleet;
      try {
        fleet = await adapter.fetchFleetSnapshot(
          {
            providerAccountId: account.id,
            providerKey: account.providerKey,
            accountKey: account.accountKey,
            config: (account.config ?? null) as Record<string, unknown> | null,
            credentials,
          },
          runtime,
        );
      } catch (err) {
        const errorCode = mapErrorToGpsSyncFailureCode(err);
        await persistFetchFailure(account.id, nowFn(), errorCode);
        return {
          ...base,
          fetchSuccess: false,
          errorCode,
          durationMs: Date.now() - started,
          counters,
        };
      }

      counters.providerRows = fleet.validRowCount + fleet.invalidRowCount;
      counters.validRows = fleet.validRowCount;
      counters.mappedRows = fleet.snapshots.length;

      const byDevice = snapshotByDeviceId(fleet.snapshots);

      const bindings = await prisma.vehicleGpsBinding.findMany({
        where: { providerAccountId: account.id, isActive: true },
        select: { id: true, vehicleId: true, externalDeviceId: true },
      });
      counters.boundRows = bindings.length;

      for (const deviceId of byDevice.keys()) {
        if (!bindings.some((b) => b.externalDeviceId === deviceId)) counters.unbound += 1;
      }

      for (const binding of bindings) {
        const snapshot = byDevice.get(binding.externalDeviceId);
        if (!snapshot) {
          counters.failed += 1;
          continue;
        }
        if (!snapshot.telemetry) {
          counters.invalid += 1;
          continue;
        }
        try {
          const input = providerSnapshotToIngestInput(snapshot, binding.vehicleId);
          const outcome = await gps.ingestLatestPosition(input);
          if (outcome.applied) counters.accepted += 1;
          else if (outcome.reason === "stale") counters.stale += 1;
          else if (outcome.reason === "duplicate_event") counters.duplicate += 1;
        } catch (err) {
          counters.failed += 1;
          fastify.log.warn(
            {
              providerKey: account.providerKey,
              providerAccountId: account.id,
              err: err instanceof AppError ? err.context?.reason : "ingest_error",
            },
            "gps sync row ingest failed",
          );
        }
      }

      await persistFetchSuccess(account.id, nowFn(), counters.providerRows);

      const durationMs = Date.now() - started;
      fastify.log.info(
        {
          providerKey: account.providerKey,
          providerAccountId: account.id,
          durationMs,
          providerRows: counters.providerRows,
          boundRows: counters.boundRows,
          accepted: counters.accepted,
          stale: counters.stale,
          duplicate: counters.duplicate,
          unbound: counters.unbound,
          invalid: counters.invalid,
          failed: counters.failed,
          result: "ACCOUNT_FETCH_SUCCESS",
        },
        "gps provider sync cycle",
      );

      return {
        ...base,
        fetchSuccess: true,
        durationMs,
        counters,
      };
    } finally {
      inFlightAccounts.delete(account.id);
      activeAccountCycles -= 1;
      await releaseGpsProviderSyncLease(prisma, {
        accountId: account.id,
        ownerToken,
      });
    }
  }

  async function runGpsProviderSyncCycle(): Promise<GpsProviderSyncCycleSummary> {
    if (shutdownRequested) {
      return { accountsConsidered: 0, accountsAttempted: 0, results: [] };
    }

    const accounts = await prisma.gpsProviderAccount.findMany({
      where: { enabled: true },
    });

    const eligible = accounts.filter(
      (account) =>
        isGpsProviderAccountSyncEnabled(account) &&
        isGpsProviderAccountLocallyConfigured(account),
    );

    const results: GpsProviderAccountSyncResult[] = [];
    let accountsAttempted = 0;

    for (const account of eligible) {
      const result = await syncOneAccount(account);
      results.push(result);
      if (!result.skipped) accountsAttempted += 1;
    }

    return {
      accountsConsidered: eligible.length,
      accountsAttempted,
      results,
    };
  }

  return {
    runGpsProviderSyncCycle,
    syncOneAccount,
  };
}
