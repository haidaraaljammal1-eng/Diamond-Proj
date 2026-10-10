import dotenv from "dotenv";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const ELITE_ID = "49e321e3-62d2-41be-87cd-3ccd9ec7be45";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const a = await prisma.gpsProviderAccount.findUniqueOrThrow({ where: { id: ELITE_ID } });
  const { isGpsProviderConfigured } = await import("src/modules/gps/gps-provider-configured");
  const configured = await isGpsProviderConfigured(prisma);
  process.env.SCHEDULER_ENABLED = "false";
  const { buildApp } = await import("src/app");
  const app = await buildApp();
  const { createGpsService } = await import("src/modules/gps/gps.service");
  const gps = createGpsService(app);
  const summary = await gps.summary();
  const mapPoints = await gps.mapPoints();
  await app.close();
  console.log(
    JSON.stringify(
      {
        account: {
          enabled: a.enabled,
          lastAttemptAt: a.lastAttemptAt,
          lastSuccessfulSyncAt: a.lastSuccessfulSyncAt,
          lastFailureAt: a.lastFailureAt,
          lastFailureCode: a.lastFailureCode,
          lastDeviceCount: a.lastDeviceCount,
          syncLeaseOwner: a.syncLeaseOwner,
          syncLeaseExpiresAt: a.syncLeaseExpiresAt,
        },
        bindings: await prisma.vehicleGpsBinding.count({
          where: { providerAccountId: ELITE_ID, isActive: true },
        }),
        latestStates: await prisma.vehicleGpsLatestState.count({
          where: { vehicle: { gpsBinding: { providerAccountId: ELITE_ID, isActive: true } } },
        }),
        vehicles: await prisma.vehicle.count(),
        contracts: await prisma.contract.count(),
        gpsInference: await prisma.roadLiabilityObservation.count({ where: { sourceKey: "GPS_INFERENCE" } }),
        unsafeGps: await prisma.roadLiability.count({
          where: {
            observations: { some: { sourceKey: "GPS_INFERENCE" } },
            OR: [{ amount: { not: null } }, { confirmationStatus: { not: "PENDING_CONFIRMATION" } }],
          },
        }),
        staff: { providerConfigured: configured, trackedVehicles: summary.trackedVehicles, mapPoints: mapPoints.length },
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}
void main();
