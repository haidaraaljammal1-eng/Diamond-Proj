import dotenv from "dotenv";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertDevelopmentDatabase } from "src/lib/dev/development-database";
import { decryptSecretBlob } from "src/modules/integrations/secret-blob";
import { createGpsProviderSyncService } from "src/modules/gps/gps-provider-sync.service";
import { createSevenStarsClient } from "src/modules/gps/providers/seven-stars/seven-stars.client";
import { mapSevenStarsFleet } from "src/modules/gps/providers/seven-stars/seven-stars.mapper";
import { SevenStarsSessionManager } from "src/modules/gps/providers/seven-stars/seven-stars.session";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PROVIDER_KEY = "SEVEN_STARS";
const ACCOUNT_KEYS = ["elite", "unique"] as const;

type InventoryDevice = {
  id: string;
  name: string;
  status: string;
  model: string;
  validPosition: boolean;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`MISSING_ENV:${name}`);
  return value;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function deviceId(value: unknown): string | null {
  const item = record(value);
  return item && (typeof item.id === "string" || typeof item.id === "number")
    ? String(item.id)
    : null;
}

function externalId(accountKey: string, id: string): string {
  return `SEVEN-STARS-${accountKey.toUpperCase()}-${id}`;
}

function databaseUrl(): string {
  return requiredEnv("DATABASE_URL");
}

function vehicleAuditTable(inventory: Map<string, InventoryDevice[]>): void {
  for (const [account, devices] of inventory) {
    for (const device of devices) {
      console.log(
        JSON.stringify({
          Account: account.toUpperCase(),
          "Device name": device.name,
          externalDeviceId: device.id,
          "Proposed make/model": device.name,
          "Proposed plate": null,
          "Missing/ambiguous fields": "modelYear, plateNumber, modelId (optional by Vehicle contract)",
          "Ready": "YES",
        }),
      );
    }
  }
}

async function main(): Promise<void> {
  const url = databaseUrl();
  assertDevelopmentDatabase({ nodeEnv: process.env.NODE_ENV ?? "development", databaseUrl: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    const accounts = await prisma.gpsProviderAccount.findMany({
      where: { providerKey: PROVIDER_KEY, accountKey: { in: [...ACCOUNT_KEYS] } },
      include: { companyScope: { select: { id: true, code: true } } },
      orderBy: { accountKey: "asc" },
    });
    if (
      accounts.length !== 2 ||
      accounts.some(
        (account) =>
          !account.secretEncrypted ||
          !account.companyScope ||
          account.companyScope.code !== account.accountKey.toUpperCase(),
      )
    ) {
      throw new Error("ACCOUNT_SAFETY_GATE_FAILED");
    }

    const baseUrls = new Set(
      accounts.map((account) => {
        const config = record(account.config);
        return stringValue(config?.baseUrl, "");
      }),
    );
    if (baseUrls.size !== 1 || ![...baseUrls][0]) throw new Error("ACCOUNT_BASE_URL_MISSING");
    const baseUrl = [...baseUrls][0]!.replace(/\/+$/, "");
    const sessions = new SevenStarsSessionManager();
    const client = createSevenStarsClient({ baseUrl, sessionManager: sessions });
    const inventory = new Map<string, InventoryDevice[]>();
    const normalizedByAccount = new Map<string, ReturnType<typeof mapSevenStarsFleet>>();

    for (const account of accounts) {
      const credentials = decryptSecretBlob(account.secretEncrypted);
      if (!credentials.username || !credentials.password) {
        throw new Error(`${account.accountKey.toUpperCase()}_DB_SECRET_INVALID`);
      }
      const context = {
        providerAccountId: account.id,
        credentials: { username: credentials.username, password: credentials.password },
      };
      const [devices, positions] = await Promise.all([
        client.fetchDevices(context),
        client.fetchPositions(context),
      ]);
      if (!Array.isArray(devices) || !Array.isArray(positions)) {
        throw new Error(`${account.accountKey.toUpperCase()}_INVENTORY_INVALID`);
      }
      const normalized = mapSevenStarsFleet(devices, positions, {
        providerAccountId: account.id,
        receivedAt: new Date(),
      });
      normalizedByAccount.set(account.accountKey, normalized);
      const byDevice = new Map(
        normalized.snapshots.map((snapshot) => [snapshot.externalDeviceId, snapshot]),
      );
      const rows = devices.map((raw) => {
        const item = record(raw);
        const id = deviceId(raw);
        if (!item || !id) throw new Error(`${account.accountKey.toUpperCase()}_DEVICE_ID_INVALID`);
        return {
          id,
          name: stringValue(item.name, `Seven Stars ${id}`),
          status: stringValue(item.status, "unknown").toLowerCase(),
          model: stringValue(item.model ?? item.category, "Unknown"),
          validPosition: byDevice.get(id)?.telemetry != null,
        };
      });
      if (new Set(rows.map((row) => row.id)).size !== rows.length) {
        throw new Error(`${account.accountKey.toUpperCase()}_DUPLICATE_DEVICE_ID`);
      }
      inventory.set(account.accountKey, rows);
    }

    vehicleAuditTable(inventory);
    const allExternalIds = [...inventory.entries()].flatMap(([key, devices]) =>
      devices.map((device) => ({ key, externalId: externalId(key, device.id) })),
    );
    const existingVehicles = await prisma.vehicle.findMany({
      where: { OR: allExternalIds.map((item) => ({ companyId: accounts.find((a) => a.accountKey === item.key)!.companyScopeId!, externalId: item.externalId })) },
      select: { id: true, companyId: true, externalId: true, vehicleName: true },
    });
    const existingByExternalId = new Map(existingVehicles.map((vehicle) => [vehicle.externalId!, vehicle]));
    for (const [accountKey, devices] of inventory) {
      for (const device of devices) {
        const key = externalId(accountKey, device.id);
        const existing = existingByExternalId.get(key);
        if (existing && existing.vehicleName !== device.name) {
          throw new Error(`${accountKey.toUpperCase()}_EXTERNAL_ID_NAME_CONFLICT`);
        }
      }
    }

    const createdOrExisting = await prisma.$transaction(async (tx) => {
      const vehicles = new Map<string, number>();
      for (const [accountKey, devices] of inventory) {
        const account = accounts.find((item) => item.accountKey === accountKey)!;
        for (const device of devices) {
          const ext = externalId(accountKey, device.id);
          const existing = await tx.vehicle.findUnique({
            where: {
              companyId_externalId: {
                companyId: account.companyScopeId!,
                externalId: ext,
              },
            },
            select: { id: true, vehicleName: true },
          });
          const vehicle =
            existing ??
            (await tx.vehicle.create({
              data: {
                companyId: account.companyScopeId!,
                vehicleName: device.name,
                externalId: ext,
              },
              select: { id: true, vehicleName: true },
            }));
          if (vehicle.vehicleName !== device.name) throw new Error("VEHICLE_NAME_CONFLICT");
          vehicles.set(`${accountKey}:${device.id}`, vehicle.id);
        }
      }

      for (const [accountKey, devices] of inventory) {
        const account = accounts.find((item) => item.accountKey === accountKey)!;
        for (const device of devices) {
          const vehicleId = vehicles.get(`${accountKey}:${device.id}`);
          if (!vehicleId) throw new Error("VEHICLE_ID_MISSING");
          const existingBinding = await tx.vehicleGpsBinding.findUnique({
            where: { vehicleId },
            select: { providerAccountId: true, externalDeviceId: true },
          });
          if (
            existingBinding &&
            (existingBinding.providerAccountId !== account.id ||
              existingBinding.externalDeviceId !== device.id)
          ) {
            throw new Error(`${accountKey.toUpperCase()}_VEHICLE_ALREADY_BOUND`);
          }
          const duplicate = await tx.vehicleGpsBinding.findFirst({
            where: {
              providerAccountId: account.id,
              externalDeviceId: device.id,
              isActive: true,
              ...(existingBinding ? { vehicleId: { not: vehicleId } } : {}),
            },
            select: { vehicleId: true },
          });
          if (duplicate) throw new Error(`${accountKey.toUpperCase()}_DEVICE_ALREADY_BOUND`);
          if (!existingBinding) {
            await tx.vehicleGpsBinding.create({
              data: {
                vehicleId,
                providerAccountId: account.id,
                providerKey: PROVIDER_KEY,
                externalDeviceId: device.id,
                deviceType: device.model,
                providerDeviceExtras: { status: device.status, model: device.model },
              },
            });
          }
        }
      }
      return vehicles;
    });

    const checks = await prisma.vehicleGpsBinding.findMany({
      where: { providerAccountId: { in: accounts.map((account) => account.id) }, isActive: true },
      select: { providerAccountId: true, externalDeviceId: true, vehicle: { select: { companyId: true } } },
    });
    for (const account of accounts) {
      const accountBindings = checks.filter((binding) => binding.providerAccountId === account.id);
      if (accountBindings.length !== inventory.get(account.accountKey)!.length) {
        throw new Error(`${account.accountKey.toUpperCase()}_BINDING_COUNT_CHECK_FAILED`);
      }
      if (accountBindings.some((binding) => binding.vehicle.companyId !== account.companyScopeId)) {
        throw new Error(`${account.accountKey.toUpperCase()}_CROSS_SCOPE_BINDING`);
      }
    }
    if (checks.some((binding) => new Set(checks.filter((item) => item.providerAccountId === binding.providerAccountId).map((item) => item.externalDeviceId)).size !== checks.filter((item) => item.providerAccountId === binding.providerAccountId).length)) {
      throw new Error("DUPLICATE_BINDING_CHECK_FAILED");
    }
    await prisma.gpsProviderAccount.updateMany({
      where: { id: { in: accounts.map((account) => account.id) } },
      data: { enabled: true },
    });
    console.log("Bindings verified: ELITE=8, UNIQUE=12, cross-scope=0");
    console.log("Accounts enabled: ELITE=true, UNIQUE=true");

    const fastify = {
      prisma,
      log: {
        info: () => undefined,
        warn: () => undefined,
      },
    } as unknown as FastifyInstance;
    const sync = createGpsProviderSyncService(fastify);
    const syncResults = [];
    for (const account of accounts) {
      const fresh = await prisma.gpsProviderAccount.findUniqueOrThrow({ where: { id: account.id } });
      syncResults.push(await sync.syncOneAccount(fresh));
    }
    for (const result of syncResults) {
      console.log(
        `${result.providerAccountId} controlled sync: ${result.fetchSuccess ? "PASS" : "FAIL"} accepted=${result.counters?.accepted ?? 0} invalid=${result.counters?.invalid ?? 0}`,
      );
    }
    const latestStates = await prisma.vehicleGpsLatestState.count({
      where: { binding: { providerAccountId: { in: accounts.map((account) => account.id) } } },
    });
    console.log(`Latest states after sync: ${latestStates}`);
    console.log(`Vehicles created or reused: ${createdOrExisting.size}`);
    console.log(`Normalized accounts: ${normalizedByAccount.size}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(`Seven Stars final activation failed: ${error instanceof Error ? error.message : "UNKNOWN"}`);
  process.exitCode = 1;
});
