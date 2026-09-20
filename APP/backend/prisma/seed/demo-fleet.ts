/**
 * prisma/seed/demo-fleet.ts — Diamond fleet development seed.
 *
 * Seeds 20 realistic fleet vehicles with direct `vehicleName` text (no VehicleModel
 * master-data creation). Idempotent via stable `externalId`.
 *
 * Invoked by `npm run db:seed:demo` and `npm run dev:bootstrap`.
 * Refuses to run against production or a non-local database.
 *
 * Re-runs:
 * - create missing DEMO-FLEET-01..20
 * - update seed-controlled identity fields on existing demo rows
 * - never overwrite operationalStatus / isActive (deliberate local changes stay)
 * - never delete user-created vehicles
 * - seeded rows are created explicitly under the UNIQUE company (never left to
 *   a migration backfill), and an existing row's company is never re-assigned
 */
import { PrismaClient } from "@prisma/client";
import type { VehicleOperationalStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { normalizedNameExtension } from "src/lib/db/prisma-extensions";
import { assertDevelopmentDatabase } from "src/lib/dev/development-database";
import { normalizePlateNumber } from "src/lib/master-data/code";
import {
  OPERATING_COMPANY_CODES,
  resolveSeedCompanyId,
  runOperatingCompanySeed,
} from "prisma/seed/operating-companies";

/** Stable prefix for all demo fleet rows — used for safe cleanup only. */
export const DEMO_FLEET_EXTERNAL_ID_PREFIX = "DEMO-FLEET-";

interface FleetSeedRow {
  /** Stable key for re-runs. */
  externalId: string;
  vehicleName: string;
  modelYear: number;
  plateNumber: string;
  color: string;
  dailyRate: number;
  monthlyRate: number;
  status: VehicleOperationalStatus;
  isActive: boolean;
}

/** Exported for unit tests — distribution: 9 AVAILABLE, 7 RENTED, 4 SERVICE. */
export const DEMO_FLEET: FleetSeedRow[] = [
  {
    externalId: "DEMO-FLEET-01",
    vehicleName: "Toyota Land Cruiser",
    modelYear: 2025,
    plateNumber: "Dubai A 47291",
    color: "White",
    dailyRate: 750,
    monthlyRate: 14500,
    status: "AVAILABLE",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-02",
    vehicleName: "Nissan Patrol",
    modelYear: 2024,
    plateNumber: "Dubai B 31842",
    color: "Black",
    dailyRate: 650,
    monthlyRate: 12500,
    status: "RENTED",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-03",
    vehicleName: "Toyota Camry",
    modelYear: 2024,
    plateNumber: "Dubai C 12076",
    color: "Pearl White",
    dailyRate: 250,
    monthlyRate: 5200,
    status: "AVAILABLE",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-04",
    vehicleName: "Nissan Kicks",
    modelYear: 2023,
    plateNumber: "Dubai D 66431",
    color: "Silver",
    dailyRate: 220,
    monthlyRate: 4500,
    status: "RENTED",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-05",
    vehicleName: "GMC Yukon",
    modelYear: 2023,
    plateNumber: "Dubai E 80552",
    color: "Black",
    dailyRate: 1150,
    monthlyRate: 23000,
    status: "AVAILABLE",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-06",
    vehicleName: "Mitsubishi Pajero",
    modelYear: 2022,
    plateNumber: "Dubai F 24618",
    color: "Grey",
    dailyRate: 450,
    monthlyRate: 8500,
    status: "RENTED",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-07",
    vehicleName: "Ford Explorer",
    modelYear: 2023,
    plateNumber: "Dubai G 99284",
    color: "Blue",
    dailyRate: 700,
    monthlyRate: 13500,
    status: "SERVICE",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-08",
    vehicleName: "Range Rover Sport",
    modelYear: 2024,
    plateNumber: "Dubai H 47720",
    color: "Black",
    dailyRate: 1100,
    monthlyRate: 21000,
    status: "AVAILABLE",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-09",
    vehicleName: "BMW 530i",
    modelYear: 2023,
    plateNumber: "Dubai J 33907",
    color: "Dark Blue",
    dailyRate: 650,
    monthlyRate: 12500,
    status: "AVAILABLE",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-10",
    vehicleName: "Lexus LX600",
    modelYear: 2024,
    plateNumber: "Dubai K 71004",
    color: "Pearl White",
    dailyRate: 1400,
    monthlyRate: 28000,
    status: "RENTED",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-11",
    vehicleName: "Porsche Cayenne",
    modelYear: 2023,
    plateNumber: "Dubai L 58449",
    color: "Grey",
    dailyRate: 1200,
    monthlyRate: 24000,
    status: "SERVICE",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-12",
    vehicleName: "Mercedes GLC",
    modelYear: 2021,
    plateNumber: "Dubai M 21883",
    color: "Silver",
    dailyRate: 0,
    monthlyRate: 0,
    status: "SERVICE",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-13",
    vehicleName: "Mercedes C-Class",
    modelYear: 2022,
    plateNumber: "Dubai N 63105",
    color: "White",
    dailyRate: 380,
    monthlyRate: 7800,
    status: "AVAILABLE",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-14",
    vehicleName: "BMW X5",
    modelYear: 2024,
    plateNumber: "Dubai P 55217",
    color: "Black",
    dailyRate: 980,
    monthlyRate: 19500,
    status: "RENTED",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-15",
    vehicleName: "Audi Q7",
    modelYear: 2025,
    plateNumber: "Dubai Q 88462",
    color: "Dark Blue",
    dailyRate: 1050,
    monthlyRate: 20500,
    status: "SERVICE",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-16",
    vehicleName: "Toyota Corolla",
    modelYear: 2021,
    plateNumber: "Dubai R 10739",
    color: "Red",
    dailyRate: 180,
    monthlyRate: 3600,
    status: "AVAILABLE",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-17",
    vehicleName: "Nissan Altima",
    modelYear: 2022,
    plateNumber: "Dubai S 74920",
    color: "Blue",
    dailyRate: 210,
    monthlyRate: 4200,
    status: "RENTED",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-18",
    vehicleName: "Kia Sportage",
    modelYear: 2023,
    plateNumber: "Dubai T 33658",
    color: "Grey",
    dailyRate: 275,
    monthlyRate: 5400,
    status: "AVAILABLE",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-19",
    vehicleName: "Hyundai Tucson",
    modelYear: 2024,
    plateNumber: "Dubai U 90114",
    color: "Pearl White",
    dailyRate: 0,
    monthlyRate: 5500,
    status: "RENTED",
    isActive: true,
  },
  {
    externalId: "DEMO-FLEET-20",
    vehicleName: "Chevrolet Tahoe",
    modelYear: 2026,
    plateNumber: "Dubai V 44503",
    color: "Silver",
    dailyRate: 890,
    monthlyRate: 17200,
    status: "AVAILABLE",
    isActive: true,
  },
];

const KNOWN_DEMO_EXTERNAL_IDS = DEMO_FLEET.map((car) => car.externalId);
export const DEMO_FLEET_EXTERNAL_IDS = KNOWN_DEMO_EXTERNAL_IDS;

export async function runDemoFleetSeed(): Promise<void> {
  const target = assertDevelopmentDatabase({
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
  });

  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter }).$extends(normalizedNameExtension);

  try {
    console.log(`[seed:demo] Development database: ${target.host}:${target.port} / ${target.database}`);

    const stale = await prisma.vehicle.deleteMany({
      where: {
        externalId: { startsWith: DEMO_FLEET_EXTERNAL_ID_PREFIX },
        NOT: { externalId: { in: KNOWN_DEMO_EXTERNAL_IDS } },
      },
    });

    if (stale.count > 0) {
      console.log(`[seed:demo] removed ${stale.count} stale demo fleet vehicle(s).`);
    }

    // The demo fleet belongs to UNIQUE. Seed the companies first so this script
    // also works on a database where the base seed has not run yet.
    await runOperatingCompanySeed(prisma as unknown as PrismaClient);
    const companyId = await resolveSeedCompanyId(
      prisma as unknown as PrismaClient,
      OPERATING_COMPANY_CODES.UNIQUE,
    );

    for (const car of DEMO_FLEET) {
      const plateNumber = normalizePlateNumber(car.plateNumber);
      const existing = await prisma.vehicle.findUnique({
        where: { companyId_externalId: { companyId, externalId: car.externalId } },
        select: { id: true },
      });

      if (existing) {
        await prisma.vehicle.update({
          where: { id: existing.id },
          data: {
            vehicleName: car.vehicleName,
            modelId: null,
            modelYear: car.modelYear,
            color: car.color,
            plateNumber,
            dailyRate: car.dailyRate,
            monthlyRate: car.monthlyRate,
          },
        });
        continue;
      }

      await prisma.vehicle.create({
        data: {
          companyId,
          externalId: car.externalId,
          vehicleName: car.vehicleName,
          modelYear: car.modelYear,
          color: car.color,
          plateNumber,
          dailyRate: car.dailyRate,
          monthlyRate: car.monthlyRate,
          operationalStatus: car.status,
          isActive: car.isActive,
        },
      });
    }

    const demoCount = await prisma.vehicle.count({
      where: { externalId: { startsWith: DEMO_FLEET_EXTERNAL_ID_PREFIX } },
    });

    console.log(
      `[seed:demo] fleet ready: ${demoCount} vehicles (${DEMO_FLEET.length} fixture rows).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runDemoFleetSeed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
