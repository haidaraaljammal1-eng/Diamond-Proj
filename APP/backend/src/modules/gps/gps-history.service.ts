import type { FastifyInstance } from "fastify";
import { decryptSecretBlob } from "src/modules/integrations/secret-blob";
import {
  gpsBindingNotFoundError,
  gpsHistoryResultTooLargeError,
  gpsHistoryUnsupportedError,
  gpsProviderInvalidResponseError,
  gpsProviderNotConfiguredError,
  gpsVehicleNotFoundError,
} from "src/modules/gps/gps.errors";
import {
  GPS_HISTORY_MAX_POINTS,
  normalizeAndSummarizeHistory,
  resolveGpsHistoryRange,
  type GpsHistoryRangeQuery,
} from "src/modules/gps/gps-history";
import { getSharedLiveGpsSessionManager } from "src/modules/gps/gps-live-gps-sessions";
import type { GpsProviderAdapter } from "src/modules/gps/gps-provider.adapter";
import { getGpsProviderAdapter } from "src/modules/gps/gps-provider.registry";
import type { GpsProviderRuntime } from "src/modules/gps/gps-provider.types";

export type GpsHistoryServiceOptions = {
  now?: () => Date;
  maxPoints?: number;
  resolveAdapter?: (providerKey: string) => GpsProviderAdapter | null;
  runtime?: GpsProviderRuntime;
};

export function createGpsHistoryService(
  fastify: FastifyInstance,
  options: GpsHistoryServiceOptions = {},
) {
  const prisma = fastify.prisma;
  const now = options.now ?? (() => new Date());
  const maxPoints = options.maxPoints ?? GPS_HISTORY_MAX_POINTS;
  const resolveAdapter =
    options.resolveAdapter ?? ((providerKey: string) => getGpsProviderAdapter(providerKey));
  const runtime =
    options.runtime ??
    ({
      liveGpsSessionManager: getSharedLiveGpsSessionManager(),
    } satisfies GpsProviderRuntime);

  async function getVehicleHistory(vehicleId: number, query: GpsHistoryRangeQuery) {
    const range = resolveGpsHistoryRange(query, now());
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

    const binding = vehicle.gpsBinding;
    if (!binding?.isActive) throw gpsBindingNotFoundError();

    const account = binding.providerAccount;
    const adapter = resolveAdapter(account.providerKey);
    if (
      !adapter ||
      !adapter.staticCapabilities.history ||
      typeof adapter.fetchHistory !== "function"
    ) {
      throw gpsHistoryUnsupportedError();
    }
    if (!account.secretEncrypted?.trim()) throw gpsProviderNotConfiguredError();

    const startedAt = Date.now();
    const result = await adapter.fetchHistory(
      {
        providerAccountId: account.id,
        providerKey: account.providerKey,
        accountKey: account.accountKey,
        config: (account.config ?? null) as Record<string, unknown> | null,
        credentials: decryptSecretBlob(account.secretEncrypted),
        externalDeviceId: binding.externalDeviceId,
        from: range.from,
        to: range.to,
      },
      runtime,
    );

    if (
      !result ||
      !Array.isArray(result.points) ||
      !Number.isInteger(result.providerRowCount) ||
      result.providerRowCount < 0 ||
      !Number.isInteger(result.invalidRowCount) ||
      result.invalidRowCount < 0
    ) {
      throw gpsProviderInvalidResponseError();
    }
    if (result.providerRowCount > maxPoints || result.points.length > maxPoints) {
      throw gpsHistoryResultTooLargeError();
    }
    if (
      result.invalidRowCount > 0 ||
      result.providerRowCount !== result.points.length
    ) {
      throw gpsProviderInvalidResponseError();
    }

    const normalized = normalizeAndSummarizeHistory(result.points);
    const response = {
      vehicleId,
      from: range.from,
      to: range.to,
      points: normalized.points.map((point) => ({
        capturedAt: point.capturedAt,
        latitude: point.latitude,
        longitude: point.longitude,
        speedKph: point.speedKph,
        segmentDistanceMeters: point.segmentDistanceMeters,
        addressLine: point.addressLine,
      })),
      summary: normalized.summary,
    };

    fastify.log.info(
      {
        vehicleId,
        providerKey: account.providerKey,
        durationMs: Date.now() - startedAt,
        pointCount: response.summary.pointCount,
        rangeDurationSeconds: Math.floor((range.to.getTime() - range.from.getTime()) / 1_000),
        result: "GPS_HISTORY_FETCH_SUCCESS",
      },
      "gps history fetched",
    );

    return response;
  }

  return { getVehicleHistory };
}
