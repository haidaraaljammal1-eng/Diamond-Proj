/**
 * Phase 4B — Create 7 ELITE vehicles + Live GPS bindings (idempotent, local dev only).
 */
import dotenv from "dotenv";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { assertDevelopmentDatabase } from "src/lib/dev/development-database";
import { normalizePlateNumber, normalizeVin } from "src/lib/master-data/code";
import { createGpsBindingService } from "src/modules/gps/gps-binding.service";
import { isGpsProviderConfigured } from "src/modules/gps/gps-provider-configured";
import { CreateVehicleSchema } from "src/modules/vehicles/vehicles.schema";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const LIVE_GPS_ELITE_EXTERNAL_ID_PREFIX = "LIVE-GPS-ELITE-";

type FleetRow = {
  externalDeviceId: string;
  vehicleName: string;
  plateCode: string | null;
  plateNumber: string;
  modelYear: number;
  color: string;
  dailyRate: number;
  monthlyRate: number;
  yearColorTemporary: boolean;
};

const FLEET: FleetRow[] = [
  {
    externalDeviceId: "455",
    vehicleName: "Mercedes GLC300",
    plateCode: "B",
    plateNumber: "64861",
    modelYear: 2021,
    color: "White",
    dailyRate: 999,
    monthlyRate: 9999,
    yearColorTemporary: false,
  },
  {
    externalDeviceId: "467",
    vehicleName: "Mercedes G800 Brabus",
    plateCode: "I",
    plateNumber: "42934",
    modelYear: 2022,
    color: "Black",
    dailyRate: 999,
    monthlyRate: 9999,
    yearColorTemporary: false,
  },
  {
    externalDeviceId: "487",
    vehicleName: "Mercedes S580",
    plateCode: "S",
    plateNumber: "2683",
    modelYear: 2022,
    color: "Blue",
    dailyRate: 999,
    monthlyRate: 9999,
    yearColorTemporary: false,
  },
  {
    externalDeviceId: "623",
    vehicleName: "Jeep Grand Cherokee",
    plateCode: null,
    plateNumber: "0488",
    modelYear: 2024,
    color: "Black",
    dailyRate: 999,
    monthlyRate: 9999,
    yearColorTemporary: true,
  },
  {
    externalDeviceId: "626",
    vehicleName: "BMW 218",
    plateCode: null,
    plateNumber: "1679",
    modelYear: 2022,
    color: "Blue",
    dailyRate: 999,
    monthlyRate: 9999,
    yearColorTemporary: false,
  },
  {
    externalDeviceId: "628",
    vehicleName: "Chevrolet Captiva",
    plateCode: null,
    plateNumber: "4711",
    modelYear: 2024,
    color: "White",
    dailyRate: 999,
    monthlyRate: 9999,
    yearColorTemporary: true,
  },
  {
    externalDeviceId: "630",
    vehicleName: "BMW X2",
    plateCode: null,
    plateNumber: "7180",
    modelYear: 2023,
    color: "White",
    dailyRate: 999,
    monthlyRate: 9999,
    yearColorTemporary: false,
  },
];

function databaseUrl(): string {
  const explicit = process.env.GPS_POC_DATABASE_URL?.trim();
  if (explicit) return explicit;
  const base = env.DATABASE_URL;
  if (/\/haidara_test(\?|$)/.test(base)) {
    return base.replace("/haidara_test", "/haidara");
  }
  return base;
}

function formatPlate(row: FleetRow): string {
  if (row.plateCode) {
    return normalizePlateNumber(`Dubai ${row.plateCode} ${row.plateNumber}`);
  }
  return normalizePlateNumber(row.plateNumber);
}

function tempVin(deviceId: string): string {
  return normalizeVin(`TEMP-LIVE-GPS-${deviceId}`);
}

function fleetExternalId(deviceId: string): string {
  return `${LIVE_GPS_ELITE_EXTERNAL_ID_PREFIX}${deviceId}`;
}

async function assertActiveCompany(prisma: PrismaClient, companyId: number): Promise<void> {
  const company = await prisma.operatingCompany.findUnique({
    where: { id: companyId },
    select: { isActive: true },
  });
  if (!company?.isActive) {
    throw new Error(`Operating company ${companyId} is not active`);
  }
}

async function main(): Promise<void> {
  const url = databaseUrl();
  assertDevelopmentDatabase({ nodeEnv: env.NODE_ENV, databaseUrl: url });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });

  const bindingService = createGpsBindingService(prisma);
  const results: unknown[] = [];

  try {
    const account = await prisma.gpsProviderAccount.findFirst({
      where: { providerKey: "LIVE_GPS", accountKey: "elite" },
      include: { companyScope: true },
    });
    if (!account?.companyScopeId) {
      throw new Error("LIVE_GPS elite account or ELITE companyScope missing");
    }
    const eliteCompanyId = account.companyScopeId;

    const eliteCountBefore = await prisma.vehicle.count({ where: { companyId: eliteCompanyId } });
    const bindingsBefore = await prisma.vehicleGpsBinding.count({
      where: { providerAccountId: account.id, isActive: true },
    });
    const latestBefore = await prisma.vehicleGpsLatestState.count({
      where: { binding: { providerAccountId: account.id } },
    });
    const demoSnapshot = await prisma.vehicle.findMany({
      where: { companyId: eliteCompanyId },
      select: { id: true, updatedAt: true },
    });
    const providerConfiguredBefore = await isGpsProviderConfigured(prisma);

    for (const row of FLEET) {
      const plateNumber = formatPlate(row);
      const vin = tempVin(row.externalDeviceId);
      const externalId = fleetExternalId(row.externalDeviceId);

      const existingBinding = await prisma.vehicleGpsBinding.findFirst({
        where: {
          providerAccountId: account.id,
          externalDeviceId: row.externalDeviceId,
          isActive: true,
        },
        include: { vehicle: true },
      });

      if (existingBinding) {
        results.push({
          externalDeviceId: row.externalDeviceId,
          vehicleId: existingBinding.vehicleId,
          bindingId: existingBinding.id,
          status: "REUSED_BINDING",
          plateNumber: existingBinding.vehicle.plateNumber,
        });
        continue;
      }

      let vehicle = await prisma.vehicle.findFirst({
        where: { vin },
      });

      let vehicleStatus: "CREATED" | "REUSED" = "REUSED";
      if (!vehicle) {
        const byExternal = await prisma.vehicle.findUnique({
          where: { companyId_externalId: { companyId: eliteCompanyId, externalId } },
        });
        if (byExternal) {
          vehicle = byExternal;
        } else {
          const parsed = CreateVehicleSchema.parse({
            companyId: eliteCompanyId,
            vehicleName: row.vehicleName,
            vin,
            modelYear: row.modelYear,
            color: row.color,
            plateNumber,
            dailyRate: row.dailyRate,
            monthlyRate: row.monthlyRate,
            externalId,
          });
          await assertActiveCompany(prisma, eliteCompanyId);
          vehicle = await prisma.vehicle.create({
            data: {
              companyId: parsed.companyId,
              vehicleName: parsed.vehicleName ?? null,
              vin: parsed.vin ? normalizeVin(parsed.vin) : null,
              modelYear: parsed.modelYear ?? null,
              color: parsed.color ?? null,
              plateNumber: parsed.plateNumber
                ? normalizePlateNumber(parsed.plateNumber)
                : null,
              dailyRate: parsed.dailyRate ?? null,
              monthlyRate: parsed.monthlyRate ?? null,
              operationalStatus: "AVAILABLE",
              externalId: parsed.externalId ?? null,
            },
          });
          vehicleStatus = "CREATED";
        }
      }

      if (vehicle.companyId !== eliteCompanyId) {
        throw new Error(
          `Vehicle ${vehicle.id} company mismatch for device ${row.externalDeviceId}`,
        );
      }

      try {
        const { bindingId } = await bindingService.assignBinding({
          vehicleId: vehicle.id,
          providerAccountId: account.id,
          externalDeviceId: row.externalDeviceId,
        });

        results.push({
          externalDeviceId: row.externalDeviceId,
          vehicleId: vehicle.id,
          bindingId,
          vehicleStatus,
          name: row.vehicleName,
          plateNumber: vehicle.plateNumber,
          modelYear: vehicle.modelYear,
          color: vehicle.color,
          dailyRate: vehicle.dailyRate,
          monthlyRate: vehicle.monthlyRate,
          vin,
          externalId,
          yearColorTemporary: row.yearColorTemporary,
          ratesTemporary: true,
        });
      } catch (err) {
        console.error(
          JSON.stringify({
            error: "CREATED_UNBOUND",
            externalDeviceId: row.externalDeviceId,
            vehicleId: vehicle.id,
            message: err instanceof Error ? err.message : "bind failed",
          }),
        );
        process.exitCode = 1;
        break;
      }
    }

    const eliteCountAfter = await prisma.vehicle.count({ where: { companyId: eliteCompanyId } });
    const bindingsAfter = await prisma.vehicleGpsBinding.count({
      where: { providerAccountId: account.id, isActive: true },
    });
    const latestAfter = await prisma.vehicleGpsLatestState.count({
      where: { binding: { providerAccountId: account.id } },
    });
    const providerConfiguredAfter = await isGpsProviderConfigured(prisma);

    const demoAfter = await prisma.vehicle.findMany({
      where: { companyId: eliteCompanyId, id: { in: demoSnapshot.map((d) => d.id) } },
      select: { id: true, updatedAt: true },
    });
    const demoUpdated = demoSnapshot.filter((before) => {
      const after = demoAfter.find((d) => d.id === before.id);
      return after && after.updatedAt.getTime() !== before.updatedAt.getTime();
    });

    console.log(
      JSON.stringify(
        {
          pre: {
            eliteVehicleCount: eliteCountBefore,
            liveGpsBindings: bindingsBefore,
            latestStates: latestBefore,
            account: {
              id: account.id,
              enabled: account.enabled,
              companyScope: account.companyScope?.code,
            },
          },
          rows: results,
          post: {
            eliteVehicleCount: eliteCountAfter,
            liveGpsBindings: bindingsAfter,
            latestStates: latestAfter,
            providerConfiguredBefore,
            providerConfiguredAfter,
            demoVehiclesUpdated: demoUpdated.length,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e instanceof Error ? e.message : "failed" }));
  process.exit(1);
});
