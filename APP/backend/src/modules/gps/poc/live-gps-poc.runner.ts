import type { PrismaClient } from "@prisma/client";
import { decryptSecretBlob } from "src/modules/integrations/secret-blob";
import { isGpsProviderConfigured } from "src/modules/gps/gps-provider-configured";
import { isGpsProviderAccountLocallyConfigured } from "src/modules/gps/gps-provider-account.semantics";
import {
  LIVE_GPS_PATH_FLEET,
  LIVE_GPS_PATH_LOGIN,
  LIVE_GPS_PROVIDER_KEY,
} from "src/modules/gps/providers/live-gps/live-gps.constants";
import { createLiveGpsClient } from "src/modules/gps/providers/live-gps/live-gps.client";
import { extractUserlogFromResponseHeaders } from "src/modules/gps/providers/live-gps/live-gps.cookies";
import {
  aggregateSnapshots,
  classifyTimestampConsistency,
  collectTimezoneOffsets,
  diagnoseLiveGpsFleetRow,
  externalDeviceIdSet,
  type FleetRowValidationIssue,
} from "src/modules/gps/poc/live-gps-poc.report";

export type LiveGpsPocRunOptions = {
  includeDeviceList?: boolean;
  fetchImpl?: typeof fetch;
};

export type LiveGpsPocSanitizedReport = {
  providerKey: string;
  providerAccountId: string;
  companyScope: string | null;
  authenticationSucceeded: boolean;
  loginHttpStatus: number | null;
  loginContentType: string | null;
  userlogReceived: boolean;
  maxAgeObserved: boolean;
  loginRequestCount: number;
  authenticatedFleetRequestCount: number;
  secondLoginOccurred: boolean;
  fleetHttpOk: boolean;
  fleetRows: number;
  validRawRows: number;
  invalidRawRows: number;
  invalidRowDiagnostics: Array<{ row: number; issue: FleetRowValidationIssue }>;
  mappedRows: number;
  withValidLocation: number;
  withValidCapturedAt: number;
  withSpeed: number;
  withOdometer: number;
  withDistanceToday: number;
  timezoneOffsets: string[];
  timestampConsistency: { consistentCount: number; inconsistentCount: number; skippedCount: number };
  speedUnit: "KM_H";
  odometerUnit: "METER";
  distanceTodayUnit: "KILOMETER";
  deviceOnOffInExtrasOnly: number;
  deviceListCheck: {
    run: boolean;
    deviceListRows: number;
    fleetRows: number;
    matchingExternalIdsCount: number;
  };
  bindingCoverage: {
    providerDeviceCount: number;
    existingBindingCount: number;
    matchedBindingCount: number;
    unmatchedProviderDeviceCount: number;
    bindingsMissingFromProviderCount: number;
  };
  providerConfiguredBefore: boolean;
  providerConfiguredAfter: boolean;
  dbMutationCheck: {
    latestStateCountBefore: number;
    latestStateCountAfter: number;
    bindingCountBefore: number;
    bindingCountAfter: number;
    vehicleCountBefore: number;
    vehicleCountAfter: number;
    contractCountBefore: number;
    contractCountAfter: number;
    accountUpdatedAtChanged: boolean;
  };
  fleetDurationMs: number;
  error?: {
    endpoint: string;
    httpStatus: number | null;
    reason: string;
    durationMs: number;
  };
};

type DbSnapshot = {
  latestStateCount: number;
  bindingCount: number;
  vehicleCount: number;
  contractCount: number;
  accountUpdatedAt: Date;
};

async function snapshotDb(
  prisma: PrismaClient,
  providerAccountId: string,
): Promise<DbSnapshot> {
  const [latestStateCount, bindingCount, vehicleCount, contractCount, account] =
    await Promise.all([
      prisma.vehicleGpsLatestState.count({
        where: { binding: { providerAccountId } },
      }),
      prisma.vehicleGpsBinding.count({
        where: { providerAccountId, isActive: true },
      }),
      prisma.vehicle.count(),
      prisma.contract.count(),
      prisma.gpsProviderAccount.findUniqueOrThrow({
        where: { id: providerAccountId },
        select: { updatedAt: true },
      }),
    ]);
  return {
    latestStateCount,
    bindingCount,
    vehicleCount,
    contractCount,
    accountUpdatedAt: account.updatedAt,
  };
}

export async function resolveLiveGpsEliteAccount(prisma: PrismaClient) {
  const elite = await prisma.operatingCompany.findUnique({
    where: { code: "ELITE" },
  });
  if (!elite) {
    throw new Error("ELITE operating company not found — run seed/bootstrap");
  }

  const accounts = await prisma.gpsProviderAccount.findMany({
    where: { providerKey: LIVE_GPS_PROVIDER_KEY },
    orderBy: { accountKey: "asc" },
  });

  let account =
    accounts.find((a) => a.companyScopeId === elite.id) ??
    accounts.find((a) => a.accountKey !== "legacy-migrated") ??
    accounts[0];

  if (!account) {
    account = await prisma.gpsProviderAccount.create({
      data: {
        providerKey: LIVE_GPS_PROVIDER_KEY,
        accountKey: "elite",
        displayName: "Live GPS (ELITE)",
        enabled: false,
        companyScopeId: elite.id,
        config: { timezoneOffset: "+04:00" },
      },
    });
  } else if (account.companyScopeId !== elite.id) {
    account = await prisma.gpsProviderAccount.update({
      where: { id: account.id },
      data: { companyScopeId: elite.id },
    });
  }

  return { account, eliteCode: elite.code };
}

function buildInvalidDiagnostics(rawRows: unknown[]): Array<{ row: number; issue: FleetRowValidationIssue }> {
  const out: Array<{ row: number; issue: FleetRowValidationIssue }> = [];
  rawRows.forEach((row, index) => {
    const issue = diagnoseLiveGpsFleetRow(row);
    if (issue) out.push({ row: index + 1, issue });
  });
  return out;
}

function buildTimestampConsistency(rawRows: unknown[]) {
  let consistentCount = 0;
  let inconsistentCount = 0;
  let skippedCount = 0;
  for (const row of rawRows) {
    const c = classifyTimestampConsistency(row);
    if (c === "consistent") consistentCount += 1;
    else if (c === "inconsistent") inconsistentCount += 1;
    else skippedCount += 1;
  }
  return { consistentCount, inconsistentCount, skippedCount };
}

export async function runLiveGpsPoc(
  prisma: PrismaClient,
  providerAccountId: string,
  options: LiveGpsPocRunOptions = {},
): Promise<LiveGpsPocSanitizedReport> {
  const account = await prisma.gpsProviderAccount.findUniqueOrThrow({
    where: { id: providerAccountId },
    include: { companyScope: true },
  });

  if (account.providerKey !== LIVE_GPS_PROVIDER_KEY) {
    throw new Error("Account is not LIVE_GPS");
  }
  if (!isGpsProviderAccountLocallyConfigured(account)) {
    throw new Error("GPS provider account has no encrypted credentials");
  }

  const secrets = decryptSecretBlob(account.secretEncrypted);
  const username = secrets.username?.trim();
  const password = secrets.password?.trim();
  if (!username || !password) {
    throw new Error("Decrypted credentials must include username and password");
  }

  const providerConfiguredBefore = await isGpsProviderConfigured(prisma);
  const dbBefore = await snapshotDb(prisma, providerAccountId);

  let loginRequestCount = 0;
  let fleetRequestCount = 0;
  let loginHttpStatus: number | null = null;
  let loginContentType: string | null = null;
  let userlogReceived = false;
  let maxAgeObserved = false;

  const realFetch = options.fetchImpl ?? fetch;
  const tracedFetch: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.includes(LIVE_GPS_PATH_LOGIN)) {
      loginRequestCount += 1;
      const response = await realFetch(input, init);
      loginHttpStatus = response.status;
      loginContentType = response.headers.get("content-type");
      const cookie = extractUserlogFromResponseHeaders(response.headers);
      userlogReceived = Boolean(cookie);
      maxAgeObserved = Boolean(cookie?.expiresAt);
      return response;
    }
    if (url.includes(LIVE_GPS_PATH_FLEET)) {
      fleetRequestCount += 1;
    }
    return realFetch(input, init);
  };

  const client = createLiveGpsClient({ fetchImpl: tracedFetch });
  const ctx = {
    providerAccountId: account.id,
    secrets: { username, password },
    config: (account.config ?? {}) as Record<string, unknown>,
  };

  const fleetStarted = Date.now();

  const baseFailure = (
    partial: Partial<LiveGpsPocSanitizedReport> = {},
  ): LiveGpsPocSanitizedReport => ({
    providerKey: account.providerKey,
    providerAccountId: account.id,
    companyScope: account.companyScope?.code ?? null,
    authenticationSucceeded: false,
    loginHttpStatus,
    loginContentType,
    userlogReceived,
    maxAgeObserved,
    loginRequestCount,
    authenticatedFleetRequestCount: fleetRequestCount,
    secondLoginOccurred: loginRequestCount > 1,
    fleetHttpOk: false,
    fleetRows: 0,
    validRawRows: 0,
    invalidRawRows: 0,
    invalidRowDiagnostics: [],
    mappedRows: 0,
    withValidLocation: 0,
    withValidCapturedAt: 0,
    withSpeed: 0,
    withOdometer: 0,
    withDistanceToday: 0,
    timezoneOffsets: [],
    timestampConsistency: { consistentCount: 0, inconsistentCount: 0, skippedCount: 0 },
    speedUnit: "KM_H",
    odometerUnit: "METER",
    distanceTodayUnit: "KILOMETER",
    deviceOnOffInExtrasOnly: 0,
    deviceListCheck: { run: false, deviceListRows: 0, fleetRows: 0, matchingExternalIdsCount: 0 },
    bindingCoverage: {
      providerDeviceCount: 0,
      existingBindingCount: 0,
      matchedBindingCount: 0,
      unmatchedProviderDeviceCount: 0,
      bindingsMissingFromProviderCount: 0,
    },
    providerConfiguredBefore,
    providerConfiguredAfter: providerConfiguredBefore,
    dbMutationCheck: {
      latestStateCountBefore: dbBefore.latestStateCount,
      latestStateCountAfter: dbBefore.latestStateCount,
      bindingCountBefore: dbBefore.bindingCount,
      bindingCountAfter: dbBefore.bindingCount,
      vehicleCountBefore: dbBefore.vehicleCount,
      vehicleCountAfter: dbBefore.vehicleCount,
      contractCountBefore: dbBefore.contractCount,
      contractCountAfter: dbBefore.contractCount,
      accountUpdatedAtChanged: false,
    },
    fleetDurationMs: Date.now() - fleetStarted,
    ...partial,
  });

  try {
    const { fleet, rawRows } = await client.fetchFleetSnapshotInternal(ctx);
    const fleetRowCount = rawRows.length;
    const aggregate = aggregateSnapshots(fleet.snapshots);
    const offsets = collectTimezoneOffsets(rawRows);
    const timestampConsistency = buildTimestampConsistency(rawRows);
    const invalidRowDiagnostics = buildInvalidDiagnostics(rawRows);

    const providerIds = new Set(fleet.snapshots.map((s) => s.externalDeviceId));
    const bindings = await prisma.vehicleGpsBinding.findMany({
      where: { providerAccountId: account.id, isActive: true },
      select: { externalDeviceId: true },
    });
    let matchedBindingCount = 0;
    for (const b of bindings) {
      if (providerIds.has(b.externalDeviceId)) matchedBindingCount += 1;
    }

    let deviceListRows = 0;
    let matchingExternalIdsCount = 0;
    if (options.includeDeviceList) {
      const list = await client.fetchDeviceListRaw(ctx);
      deviceListRows = list.length;
      const listIds = externalDeviceIdSet(list);
      for (const id of listIds) {
        if (providerIds.has(id)) matchingExternalIdsCount += 1;
      }
    }

    const providerConfiguredAfter = await isGpsProviderConfigured(prisma);
    const dbAfter = await snapshotDb(prisma, providerAccountId);

    return {
      providerKey: account.providerKey,
      providerAccountId: account.id,
      companyScope: account.companyScope?.code ?? null,
      authenticationSucceeded: true,
      loginHttpStatus,
      loginContentType,
      userlogReceived,
      maxAgeObserved,
      loginRequestCount,
      authenticatedFleetRequestCount: fleetRequestCount,
      secondLoginOccurred: loginRequestCount > 1,
      fleetHttpOk: true,
      fleetRows: fleetRowCount,
      validRawRows: fleet.validRowCount,
      invalidRawRows: fleet.invalidRowCount,
      invalidRowDiagnostics,
      mappedRows: aggregate.mappedRows,
      withValidLocation: aggregate.withValidLocation,
      withValidCapturedAt: aggregate.withValidCapturedAt,
      withSpeed: aggregate.withSpeed,
      withOdometer: aggregate.withOdometer,
      withDistanceToday: aggregate.withDistanceToday,
      timezoneOffsets: offsets,
      timestampConsistency,
      speedUnit: "KM_H",
      odometerUnit: "METER",
      distanceTodayUnit: "KILOMETER",
      deviceOnOffInExtrasOnly: aggregate.deviceOnOffInExtrasOnly,
      deviceListCheck: {
        run: Boolean(options.includeDeviceList),
        deviceListRows,
        fleetRows: fleetRowCount,
        matchingExternalIdsCount,
      },
      bindingCoverage: {
        providerDeviceCount: providerIds.size,
        existingBindingCount: bindings.length,
        matchedBindingCount,
        unmatchedProviderDeviceCount: Math.max(0, providerIds.size - matchedBindingCount),
        bindingsMissingFromProviderCount: Math.max(0, bindings.length - matchedBindingCount),
      },
      providerConfiguredBefore,
      providerConfiguredAfter,
      dbMutationCheck: {
        latestStateCountBefore: dbBefore.latestStateCount,
        latestStateCountAfter: dbAfter.latestStateCount,
        bindingCountBefore: dbBefore.bindingCount,
        bindingCountAfter: dbAfter.bindingCount,
        vehicleCountBefore: dbBefore.vehicleCount,
        vehicleCountAfter: dbAfter.vehicleCount,
        contractCountBefore: dbBefore.contractCount,
        contractCountAfter: dbAfter.contractCount,
        accountUpdatedAtChanged:
          dbBefore.accountUpdatedAt.getTime() !== dbAfter.accountUpdatedAt.getTime(),
      },
      fleetDurationMs: Date.now() - fleetStarted,
    };
  } catch (err) {
    const providerConfiguredAfter = await isGpsProviderConfigured(prisma);
    const dbAfter = await snapshotDb(prisma, providerAccountId);
    const reason =
      err && typeof err === "object" && "context" in err
        ? String((err as { context?: { reason?: string } }).context?.reason ?? "GPS_PROVIDER_ERROR")
        : "GPS_PROVIDER_ERROR";

    return baseFailure({
      providerConfiguredAfter,
      secondLoginOccurred: loginRequestCount > 1,
      dbMutationCheck: {
        latestStateCountBefore: dbBefore.latestStateCount,
        latestStateCountAfter: dbAfter.latestStateCount,
        bindingCountBefore: dbBefore.bindingCount,
        bindingCountAfter: dbAfter.bindingCount,
        vehicleCountBefore: dbBefore.vehicleCount,
        vehicleCountAfter: dbAfter.vehicleCount,
        contractCountBefore: dbBefore.contractCount,
        contractCountAfter: dbAfter.contractCount,
        accountUpdatedAtChanged:
          dbBefore.accountUpdatedAt.getTime() !== dbAfter.accountUpdatedAt.getTime(),
      },
      fleetDurationMs: Date.now() - fleetStarted,
      error: {
        endpoint: fleetRequestCount > 0 ? LIVE_GPS_PATH_FLEET : LIVE_GPS_PATH_LOGIN,
        httpStatus: loginHttpStatus,
        reason,
        durationMs: Date.now() - fleetStarted,
      },
    });
  }
}
