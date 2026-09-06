/**
 * prisma/seed/demo-fleet.ts — Diamond DEMO fleet, not foundation data.
 *
 * Seeds the 12 vehicles of the Diamond Demo (`demo.html` `CARS`) with their
 * models, plates, rates and operational status, so the Vehicles page has real
 * rows to render before the rental domain is imported from anywhere else.
 *
 * Idempotent: every row is upserted by its stable `externalId` (vehicles) or
 * `code` (models), so re-running never duplicates and never overwrites a plate
 * an operator has since corrected — it only re-asserts the demo values.
 *
 * Run with `npm run db:seed:demo`. Refuses to run against NODE_ENV=production.
 */
import { PrismaClient } from "@prisma/client";
import type { VehicleOperationalStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { normalizedNameExtension } from "src/lib/db/prisma-extensions";
import { normalizePlateNumber } from "src/lib/master-data/code";

interface DemoCar {
  /** Stable key for re-runs (Demo `CARS[].id`). */
  externalId: string;
  modelCode: string;
  modelName: string;
  modelYear: number;
  plateNumber: string;
  color: string;
  dailyRate: number;
  monthlyRate: number;
  status: VehicleOperationalStatus;
}

const DEMO_FLEET: DemoCar[] = [
  { externalId: "DEMO-C1", modelCode: "NISSAN-PATROL-PLATINUM", modelName: "Nissan Patrol Platinum", modelYear: 2024, plateNumber: "D 56041", color: "أسود لامع", dailyRate: 1200, monthlyRate: 24000, status: "RENTED" },
  { externalId: "DEMO-C2", modelCode: "MERCEDES-GLE-450", modelName: "Mercedes GLE 450", modelYear: 2024, plateNumber: "K 21883", color: "أبيض لؤلؤي", dailyRate: 1100, monthlyRate: 22000, status: "AVAILABLE" },
  { externalId: "DEMO-C3", modelCode: "TOYOTA-LAND-CRUISER-VXR", modelName: "Toyota Land Cruiser VXR", modelYear: 2023, plateNumber: "F 90215", color: "رمادي تيتانيوم", dailyRate: 1000, monthlyRate: 20000, status: "RENTED" },
  { externalId: "DEMO-C4", modelCode: "RANGE-ROVER-SPORT-HSE", modelName: "Range Rover Sport HSE", modelYear: 2024, plateNumber: "J 47720", color: "أسود", dailyRate: 1300, monthlyRate: 26000, status: "AVAILABLE" },
  { externalId: "DEMO-C5", modelCode: "BMW-530I-M-SPORT", modelName: "BMW 530i M-Sport", modelYear: 2023, plateNumber: "H 33907", color: "أزرق مظلم", dailyRate: 650, monthlyRate: 12500, status: "AVAILABLE" },
  { externalId: "DEMO-C6", modelCode: "LEXUS-LX600-SIGNATURE", modelName: "Lexus LX600 Signature", modelYear: 2024, plateNumber: "A 71004", color: "بيج صحراوي", dailyRate: 1400, monthlyRate: 28000, status: "SERVICE" },
  { externalId: "DEMO-C7", modelCode: "PORSCHE-CAYENNE-S", modelName: "Porsche Cayenne S", modelYear: 2023, plateNumber: "L 58449", color: "أحمر كارمن", dailyRate: 1500, monthlyRate: 30000, status: "AVAILABLE" },
  { externalId: "DEMO-C8", modelCode: "TOYOTA-CAMRY-GLE", modelName: "Toyota Camry GLE", modelYear: 2024, plateNumber: "P 12076", color: "أبيض", dailyRate: 280, monthlyRate: 5200, status: "RENTED" },
  { externalId: "DEMO-C9", modelCode: "NISSAN-KICKS-SV", modelName: "Nissan Kicks SV", modelYear: 2023, plateNumber: "R 66431", color: "فضي", dailyRate: 190, monthlyRate: 3500, status: "AVAILABLE" },
  { externalId: "DEMO-C10", modelCode: "GMC-YUKON-DENALI", modelName: "GMC Yukon Denali", modelYear: 2023, plateNumber: "B 80552", color: "أسود", dailyRate: 1150, monthlyRate: 23000, status: "RENTED" },
  { externalId: "DEMO-C11", modelCode: "MITSUBISHI-PAJERO-GLS", modelName: "Mitsubishi Pajero GLS", modelYear: 2022, plateNumber: "E 24618", color: "أبيض لؤلؤي", dailyRate: 450, monthlyRate: 8500, status: "AVAILABLE" },
  { externalId: "DEMO-C12", modelCode: "FORD-EXPLORER-XLT", modelName: "Ford Explorer XLT", modelYear: 2023, plateNumber: "N 99284", color: "أزرق", dailyRate: 700, monthlyRate: 13500, status: "SERVICE" },
];

export async function runDemoFleetSeed(): Promise<void> {
  if (env.NODE_ENV === "production") {
    throw new Error("[seed:demo] refusing to seed demo data in production");
  }

  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter }).$extends(normalizedNameExtension);

  try {
    for (const car of DEMO_FLEET) {
      const model = await prisma.vehicleModel.upsert({
        where: { code: car.modelCode },
        update: { name: car.modelName, isActive: true },
        create: { code: car.modelCode, name: car.modelName, isActive: true },
      });

      const plateNumber = normalizePlateNumber(car.plateNumber);

      await prisma.vehicle.upsert({
        where: { externalId: car.externalId },
        update: {
          modelId: model.id,
          modelYear: car.modelYear,
          color: car.color,
          plateNumber,
          dailyRate: car.dailyRate,
          monthlyRate: car.monthlyRate,
          operationalStatus: car.status,
          isActive: true,
        },
        create: {
          externalId: car.externalId,
          modelId: model.id,
          modelYear: car.modelYear,
          color: car.color,
          plateNumber,
          dailyRate: car.dailyRate,
          monthlyRate: car.monthlyRate,
          operationalStatus: car.status,
        },
      });
    }

    console.log(`[seed:demo] fleet ready: ${DEMO_FLEET.length} vehicles.`);
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
