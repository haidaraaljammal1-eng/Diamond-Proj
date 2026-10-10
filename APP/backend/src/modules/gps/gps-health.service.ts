import type { FastifyInstance } from "fastify";
import { decryptSecretBlob } from "src/modules/integrations/secret-blob";
import { gpsConfig } from "src/modules/gps/gps.config";
import {
  gpsVehicleNotFoundError,
} from "src/modules/gps/gps.errors";
import { deriveGpsHealth } from "src/modules/gps/gps-health";
import type { GpsProviderAdapter } from "src/modules/gps/gps-provider.adapter";
import type { GpsProviderRuntime } from "src/modules/gps/gps-provider.types";
import { getSharedLiveGpsSessionManager } from "src/modules/gps/gps-live-gps-sessions";
import { getGpsProviderAdapter } from "src/modules/gps/gps-provider.registry";
import type { GpsVehicleHealth } from "src/modules/gps/gps.schema";

export type GpsHealthServiceOptions = {
  resolveAdapter?: (providerKey: string) => GpsProviderAdapter | null;
  runtime?: GpsProviderRuntime;
  now?: () => Date;
};

export function createGpsHealthService(
  fastify: FastifyInstance,
  options: GpsHealthServiceOptions = {},
) {
  const prisma = fastify.prisma;
  const resolveAdapter =
    options.resolveAdapter ?? ((providerKey: string) => getGpsProviderAdapter(providerKey));
  const runtime =
    options.runtime ??
    ({ liveGpsSessionManager: getSharedLiveGpsSessionManager() } satisfies GpsProviderRuntime);
  const now = options.now ?? (() => new Date());

  async function getVehicleHealth(vehicleId: number): Promise<GpsVehicleHealth> {
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, isActive: true },
      select: {
        id: true,
        gpsLatestState: { select: { capturedAt: true } },
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

    const current = now();
    const derived = deriveGpsHealth({
      capturedAt: vehicle.gpsLatestState?.capturedAt ?? null,
      now: current,
      offlineAfterMinutes: gpsConfig().offlineAfterMinutes,
    });

    let deviceModel: string | null = null;
    const binding = vehicle.gpsBinding;
    const account = binding?.providerAccount;
    const adapter = account ? resolveAdapter(account.providerKey) : null;
    if (
      binding?.isActive &&
      account &&
      adapter?.staticCapabilities.deviceMetadata &&
      typeof adapter.fetchDeviceMetadata === "function"
    ) {
      if (!account.secretEncrypted?.trim()) {
        fastify.log.warn({ vehicleId }, "gps device metadata credentials unavailable");
      } else {
        try {
          const metadata = await adapter.fetchDeviceMetadata(
            {
              providerAccountId: account.id,
              providerKey: account.providerKey,
              accountKey: account.accountKey,
              config: (account.config ?? null) as Record<string, unknown> | null,
              credentials: decryptSecretBlob(account.secretEncrypted),
              externalDeviceId: binding.externalDeviceId,
            },
            runtime,
          );
          deviceModel = metadata.deviceModel?.trim() || null;
        } catch (error) {
          fastify.log.warn(
            {
              vehicleId,
              error: error instanceof Error ? error.message : "unknown",
            },
            "gps device metadata unavailable",
          );
        }
      }
    }

    return {
      vehicleId: vehicle.id,
      health: derived.health,
      lastCommunicationAt: vehicle.gpsLatestState?.capturedAt ?? null,
      ageSeconds: derived.ageSeconds,
      deviceModel,
    };
  }

  return { getVehicleHealth };
}
