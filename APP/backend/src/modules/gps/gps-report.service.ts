import type { FastifyInstance } from "fastify";
import { decryptSecretBlob } from "src/modules/integrations/secret-blob";
import {
  gpsBindingNotFoundError,
  gpsMileageUnsupportedError,
  gpsOverspeedInvalidThresholdError,
  gpsOverspeedUnsupportedError,
  gpsProviderInvalidResponseError,
  gpsProviderNotConfiguredError,
  gpsVehicleNotFoundError,
} from "src/modules/gps/gps.errors";
import type { GpsProviderAdapter } from "src/modules/gps/gps-provider.adapter";
import { getSharedLiveGpsSessionManager } from "src/modules/gps/gps-live-gps-sessions";
import { getGpsProviderAdapter } from "src/modules/gps/gps-provider.registry";
import type { GpsProviderRuntime } from "src/modules/gps/gps-provider.types";
import type { GpsOverspeedQuery } from "src/modules/gps/gps.schema";

export type GpsReportServiceOptions = {
  resolveAdapter?: (providerKey: string) => GpsProviderAdapter | null;
  runtime?: GpsProviderRuntime;
};

export function createGpsReportService(
  fastify: FastifyInstance,
  options: GpsReportServiceOptions = {},
) {
  const prisma = fastify.prisma;
  const resolveAdapter =
    options.resolveAdapter ?? ((providerKey: string) => getGpsProviderAdapter(providerKey));
  const runtime =
    options.runtime ??
    ({ liveGpsSessionManager: getSharedLiveGpsSessionManager() } satisfies GpsProviderRuntime);

  async function resolveReadContext(vehicleId: number) {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, isActive: true },
      select: {
        id: true,
        gpsBinding: {
          select: {
            isActive: true,
            externalDeviceId: true,
            providerAccount: {
              select: {
                id: true,
                providerKey: true,
                accountKey: true,
                config: true,
                secretEncrypted: true,
              },
            },
          },
        },
      },
    });
    if (!vehicle) throw gpsVehicleNotFoundError();
    if (!vehicle.gpsBinding?.isActive) throw gpsBindingNotFoundError();
    const binding = vehicle.gpsBinding;
    const account = binding.providerAccount;
    if (!account.secretEncrypted?.trim()) throw gpsProviderNotConfiguredError();
    const adapter = resolveAdapter(account.providerKey);
    if (!adapter) throw gpsMileageUnsupportedError();
    return {
      vehicle,
      binding,
      account,
      adapter,
      credentials: decryptSecretBlob(account.secretEncrypted),
    };
  }

  async function getMileageSummary(vehicleId: number) {
    const resolved = await resolveReadContext(vehicleId);
    if (
      !resolved.adapter.staticCapabilities.mileageSummary ||
      typeof resolved.adapter.fetchMileageSummary !== "function"
    ) {
      throw gpsMileageUnsupportedError();
    }
    const result = await resolved.adapter.fetchMileageSummary(
      {
        providerAccountId: resolved.account.id,
        providerKey: resolved.account.providerKey,
        accountKey: resolved.account.accountKey,
        config: (resolved.account.config ?? null) as Record<string, unknown> | null,
        credentials: resolved.credentials,
        externalDeviceId: resolved.binding.externalDeviceId,
      },
      runtime,
    );
    if (
      !result ||
      !Object.values(result).every(
        (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
      )
    ) {
      throw gpsProviderInvalidResponseError();
    }
    fastify.log.info(
      { vehicleId, providerKey: resolved.account.providerKey, resultCount: 1 },
      "gps mileage summary fetched",
    );
    return { vehicleId, ...result };
  }

  async function getOverspeed(vehicleId: number, query: GpsOverspeedQuery) {
    if (!Number.isFinite(query.thresholdKph) || query.thresholdKph <= 0) {
      throw gpsOverspeedInvalidThresholdError();
    }
    const resolved = await resolveReadContext(vehicleId);
    if (
      !resolved.adapter.staticCapabilities.overspeedReport ||
      typeof resolved.adapter.fetchOverspeed !== "function"
    ) {
      throw gpsOverspeedUnsupportedError();
    }
    const result = await resolved.adapter.fetchOverspeed(
      {
        providerAccountId: resolved.account.id,
        providerKey: resolved.account.providerKey,
        accountKey: resolved.account.accountKey,
        config: (resolved.account.config ?? null) as Record<string, unknown> | null,
        credentials: resolved.credentials,
        externalDeviceId: resolved.binding.externalDeviceId,
        date: query.date,
        thresholdKph: query.thresholdKph,
      },
      runtime,
    );
    if (
      !result ||
      !Array.isArray(result.events) ||
      result.providerRowCount < 0 ||
      result.invalidRowCount < 0 ||
      result.invalidRowCount > 0
    ) {
      throw gpsProviderInvalidResponseError();
    }
    fastify.log.info(
      {
        vehicleId,
        providerKey: resolved.account.providerKey,
        resultCount: result.events.length,
      },
      "gps overspeed report fetched",
    );
    return {
      vehicleId,
      thresholdKph: query.thresholdKph,
      date: query.date,
      events: result.events,
      eventCount: result.events.length,
    };
  }

  return { getMileageSummary, getOverspeed };
}
