/**
 * Development-only fleet cleanup.
 *
 * Ensures exactly DEMO-FLEET-01..20 remain in the database with no photos.
 * Refuses to run when NODE_ENV=production or when DATABASE_URL looks non-local.
 *
 * Run: npm run db:cleanup:dev-fleet
 */
import { unlink } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { resolveStoragePath } from "src/lib/files/storage-key";
import { normalizedNameExtension } from "src/lib/db/prisma-extensions";
import {
  DEMO_FLEET,
  DEMO_FLEET_EXTERNAL_ID_PREFIX,
  runDemoFleetSeed,
} from "../prisma/seed/demo-fleet";

const KNOWN_DEMO_EXTERNAL_IDS = DEMO_FLEET.map((car) => car.externalId);

function assertDevelopmentEnvironment(): void {
  if (env.NODE_ENV === "production") {
    throw new Error("[cleanup:dev-fleet] refusing to run in production");
  }

  const url = env.DATABASE_URL.toLowerCase();
  const looksLocal =
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    url.includes("@host.docker.internal");

  if (!looksLocal) {
    throw new Error(
      "[cleanup:dev-fleet] DATABASE_URL does not look like a local development database",
    );
  }
}

async function removeVehiclePhotos(
  prisma: PrismaClient,
  vehicleId: number,
): Promise<number> {
  const photos = await prisma.vehiclePhoto.findMany({
    where: { vehicleId },
    include: { attachment: true },
  });

  for (const photo of photos) {
    await prisma.vehiclePhoto.delete({ where: { id: photo.id } });
    await prisma.attachment.delete({ where: { id: photo.attachmentId } });
    const absolutePath = resolveStoragePath(
      env.FILE_STORAGE_DIR,
      photo.attachment.storageKey,
    );
    await unlink(absolutePath).catch(() => undefined);
  }

  return photos.length;
}

async function main(): Promise<void> {
  assertDevelopmentEnvironment();

  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter }).$extends(normalizedNameExtension);

  try {
    const beforeCount = await prisma.vehicle.count();
    const beforeDemo = await prisma.vehicle.count({
      where: { externalId: { startsWith: DEMO_FLEET_EXTERNAL_ID_PREFIX } },
    });

    const nonDemoVehicles = await prisma.vehicle.findMany({
      where: {
        OR: [
          { externalId: null },
          { NOT: { externalId: { in: KNOWN_DEMO_EXTERNAL_IDS } } },
        ],
      },
      select: { id: true, externalId: true, vehicleName: true },
      orderBy: { id: "asc" },
    });

    let demoPhotosRemoved = 0;
    const demoVehicles = await prisma.vehicle.findMany({
      where: { externalId: { in: KNOWN_DEMO_EXTERNAL_IDS } },
      select: { id: true, externalId: true },
    });
    const db = prisma as unknown as PrismaClient;
    for (const vehicle of demoVehicles) {
      demoPhotosRemoved += await removeVehiclePhotos(db, vehicle.id);
    }

    const removed: Array<{ id: number; externalId: string | null; vehicleName: string | null }> =
      [];

    for (const vehicle of nonDemoVehicles) {
      await removeVehiclePhotos(db, vehicle.id);
      await prisma.purchaseExperience.deleteMany({ where: { vehicleId: vehicle.id } });
      await prisma.vehicle.delete({ where: { id: vehicle.id } });
      removed.push(vehicle);
    }

    await prisma.vehicle.deleteMany({
      where: {
        externalId: { startsWith: DEMO_FLEET_EXTERNAL_ID_PREFIX },
        NOT: { externalId: { in: KNOWN_DEMO_EXTERNAL_IDS } },
      },
    });

    await runDemoFleetSeed();

    const afterCount = await prisma.vehicle.count();
    const afterDemo = await prisma.vehicle.count({
      where: { externalId: { in: KNOWN_DEMO_EXTERNAL_IDS } },
    });
    const afterPhotosOnDemo = await prisma.vehiclePhoto.count({
      where: { vehicle: { externalId: { in: KNOWN_DEMO_EXTERNAL_IDS } } },
    });

    console.log(
      JSON.stringify(
        {
          environment: env.NODE_ENV,
          database: env.DATABASE_URL.replace(/:[^:@/]+@/, ":***@"),
          before: { total: beforeCount, demoFleet: beforeDemo },
          removed: {
            count: removed.length,
            vehicles: removed,
          },
          demoPhotosRemoved,
          after: {
            total: afterCount,
            demoFleet: afterDemo,
            demoPhotos: afterPhotosOnDemo,
          },
        },
        null,
        2,
      ),
    );

    if (afterCount !== 20 || afterDemo !== 20 || afterPhotosOnDemo !== 0) {
      throw new Error(
        `[cleanup:dev-fleet] verification failed: expected 20 demo vehicles with 0 photos, got total=${afterCount} demo=${afterDemo} photos=${afterPhotosOnDemo}`,
      );
    }

    console.log("[cleanup:dev-fleet] development fleet ready: 20 DEMO-FLEET vehicles, no photos.");
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
