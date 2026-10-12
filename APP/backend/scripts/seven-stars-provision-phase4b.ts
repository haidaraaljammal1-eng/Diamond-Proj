import dotenv from "dotenv";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertDevelopmentDatabase } from "src/lib/dev/development-database";
import { decryptSecretBlob, encryptSecretBlob } from "src/modules/integrations/secret-blob";
import { createSevenStarsClient } from "src/modules/gps/providers/seven-stars/seven-stars.client";
import { mapSevenStarsFleet } from "src/modules/gps/providers/seven-stars/seven-stars.mapper";
import { SevenStarsSessionManager } from "src/modules/gps/providers/seven-stars/seven-stars.session";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PROVIDER_KEY = "SEVEN_STARS";
const BASE_URL_KEY = "SEVEN_STARS_BASE_URL";

type AccountSpec = {
  accountKey: "elite" | "unique";
  companyCode: "ELITE" | "UNIQUE";
  displayName: string;
  usernameKey: string;
  passwordKey: string;
};

const ACCOUNT_SPECS: readonly AccountSpec[] = [
  {
    accountKey: "elite",
    companyCode: "ELITE",
    displayName: "Seven Stars — ELITE",
    usernameKey: "SEVEN_STARS_ELITE_USERNAME",
    passwordKey: "SEVEN_STARS_ELITE_PASSWORD",
  },
  {
    accountKey: "unique",
    companyCode: "UNIQUE",
    displayName: "Seven Stars — UNIQUE",
    usernameKey: "SEVEN_STARS_UNIQUE_USERNAME",
    passwordKey: "SEVEN_STARS_UNIQUE_PASSWORD",
  },
];

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`MISSING_ENV:${name}`);
  return value;
}

function databaseUrl(): string {
  return requiredEnv("DATABASE_URL");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDeviceShape(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && (typeof value.id === "number" || typeof value.id === "string");
}

function isPositionShape(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    (typeof value.deviceId === "number" || typeof value.deviceId === "string") &&
    (value.valid === undefined || typeof value.valid === "boolean")
  );
}

function readCredentials(spec: AccountSpec): { username: string; password: string } {
  return {
    username: requiredEnv(spec.usernameKey),
    password: requiredEnv(spec.passwordKey),
  };
}

function assertCredentialShape(
  secretEncrypted: string,
  expected: { username: string; password: string },
): void {
  if (!secretEncrypted || secretEncrypted === expected.username || secretEncrypted === expected.password) {
    throw new Error("INVALID_ENCRYPTED_SECRET");
  }
  const decrypted = decryptSecretBlob(secretEncrypted);
  if (decrypted.username !== expected.username || decrypted.password !== expected.password) {
    throw new Error("ENCRYPTED_SECRET_ROUNDTRIP_FAILED");
  }
}

function decryptCredentials(secretEncrypted: string): { username: string; password: string } {
  const decrypted = decryptSecretBlob(secretEncrypted);
  if (!decrypted.username || !decrypted.password) {
    throw new Error("DB_CREDENTIAL_SHAPE_INVALID");
  }
  return { username: decrypted.username, password: decrypted.password };
}

async function main(): Promise<void> {
  const url = databaseUrl();
  assertDevelopmentDatabase({ nodeEnv: process.env.NODE_ENV ?? "development", databaseUrl: url });
  const baseUrl = requiredEnv(BASE_URL_KEY).replace(/\/+$/, "");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    const companies = await prisma.operatingCompany.findMany({
      where: { code: { in: ["ELITE", "UNIQUE"] } },
      select: { id: true, code: true },
    });
    const eliteCompanies = companies.filter((company) => company.code === "ELITE");
    const uniqueCompanies = companies.filter((company) => company.code === "UNIQUE");
    if (eliteCompanies.length !== 1 || uniqueCompanies.length !== 1) {
      throw new Error("COMPANY_SCOPE_AMBIGUOUS_OR_MISSING");
    }
    console.log("Pre-provision: ELITE company resolved: PASS");
    console.log("Pre-provision: UNIQUE company resolved: PASS");

    const existing = await prisma.gpsProviderAccount.findMany({
      where: {
        providerKey: PROVIDER_KEY,
        accountKey: { in: ACCOUNT_SPECS.map((spec) => spec.accountKey) },
      },
      select: { accountKey: true, enabled: true, companyScopeId: true, secretEncrypted: true },
    });
    if (existing.length > 0) {
      console.log("ALREADY_PROVISIONED");
      console.log(`Existing SEVEN_STARS accounts: ${existing.length}`);
      process.exitCode = 2;
      return;
    }

    const credentials = ACCOUNT_SPECS.map((spec) => ({
      spec,
      value: readCredentials(spec),
    }));
    const encrypted = credentials.map(({ spec, value }) => ({
      spec,
      value,
      secretEncrypted: encryptSecretBlob(value),
    }));
    for (const item of encrypted) assertCredentialShape(item.secretEncrypted, item.value);
    console.log("Pre-provision: encryption configuration: PASS");
    console.log("Pre-provision: secret round-trip: PASS");

    const created = await prisma.$transaction(async (tx) => {
      const elite = await tx.gpsProviderAccount.create({
        data: {
          providerKey: PROVIDER_KEY,
          accountKey: "elite",
          displayName: "Seven Stars — ELITE",
          enabled: false,
          companyScopeId: eliteCompanies[0]!.id,
          config: { baseUrl },
          secretEncrypted: encrypted[0]!.secretEncrypted,
        },
      });
      const unique = await tx.gpsProviderAccount.create({
        data: {
          providerKey: PROVIDER_KEY,
          accountKey: "unique",
          displayName: "Seven Stars — UNIQUE",
          enabled: false,
          companyScopeId: uniqueCompanies[0]!.id,
          config: { baseUrl },
          secretEncrypted: encrypted[1]!.secretEncrypted,
        },
      });
      return { elite, unique };
    });
    console.log("SEVEN_STARS / elite: CREATED");
    console.log("SEVEN_STARS / unique: CREATED");

    const stored = await prisma.gpsProviderAccount.findMany({
      where: { id: { in: [created.elite.id, created.unique.id] } },
      include: { companyScope: { select: { code: true } } },
      orderBy: { accountKey: "asc" },
    });
    if (
      stored.length !== 2 ||
      stored.some(
        (account) =>
          account.enabled ||
          !account.secretEncrypted ||
          account.providerKey !== PROVIDER_KEY ||
          account.companyScope?.code !== account.accountKey.toUpperCase(),
      )
    ) {
      throw new Error("POST_WRITE_ACCOUNT_VERIFICATION_FAILED");
    }
    for (const account of stored) {
      const expected = encrypted.find((item) => item.spec.accountKey === account.accountKey);
      if (!expected || !account.secretEncrypted) throw new Error("STORED_SECRET_MISSING");
      assertCredentialShape(account.secretEncrypted, expected.value);
    }
    console.log("Post-write: accounts=2, enabled=0, encrypted secrets present: PASS");

    const sessions = new SevenStarsSessionManager();
    const client = createSevenStarsClient({ baseUrl, sessionManager: sessions });
    const validation = new Map<string, { devices: number; positions: number }>();

    for (const account of stored) {
      if (!account.secretEncrypted) throw new Error("STORED_SECRET_MISSING");
      const credentialsFromDb = decryptCredentials(account.secretEncrypted);
      const context = {
        providerAccountId: account.id,
        credentials: credentialsFromDb,
      };
      await client.ensureSession(context);
      const [devices, positions] = await Promise.all([
        client.fetchDevices(context),
        client.fetchPositions(context),
      ]);
      if (!Array.isArray(devices) || !Array.isArray(positions)) {
        throw new Error(`${account.accountKey.toUpperCase()}_RESPONSE_NOT_ARRAY`);
      }
      if (!devices.every(isDeviceShape) || !positions.every(isPositionShape)) {
        throw new Error(`${account.accountKey.toUpperCase()}_RESPONSE_SHAPE_INVALID`);
      }
      const normalized = mapSevenStarsFleet(devices, positions, {
        providerAccountId: account.id,
        receivedAt: new Date(),
      });
      validation.set(account.accountKey, {
        devices: normalized.snapshots.length,
        positions: positions.length,
      });
      console.log(`${account.accountKey.toUpperCase()} DB-based login/devices/positions/normalize: PASS`);
    }

    const elite = stored.find((account) => account.accountKey === "elite")!;
    const unique = stored.find((account) => account.accountKey === "unique")!;
    const eliteContext = {
      providerAccountId: elite.id,
      credentials: decryptCredentials(elite.secretEncrypted!),
    };
    const uniqueContext = {
      providerAccountId: unique.id,
      credentials: decryptCredentials(unique.secretEncrypted!),
    };
    sessions.invalidate(elite.id);
    await client.fetchDevices(eliteContext);
    const uniqueUnaffectedByElite = sessions.getSession(unique.id) !== null;
    console.log(`ELITE DB-based local session recreation: ${sessions.getSession(elite.id) ? "PASS" : "FAIL"}`);
    sessions.invalidate(unique.id);
    await client.fetchDevices(uniqueContext);
    const eliteUnaffectedByUnique = sessions.getSession(elite.id) !== null;
    console.log(`UNIQUE DB-based local session recreation: ${sessions.getSession(unique.id) ? "PASS" : "FAIL"}`);

    const bindingCount = await prisma.vehicleGpsBinding.count({
      where: { providerAccountId: { in: [elite.id, unique.id] } },
    });
    const finalAccounts = await prisma.gpsProviderAccount.findMany({
      where: { id: { in: [elite.id, unique.id] } },
      select: { accountKey: true, enabled: true, companyScope: { select: { code: true } } },
    });
    if (bindingCount !== 0 || finalAccounts.length !== 2 || finalAccounts.some((account) => account.enabled)) {
      throw new Error("FINAL_SAFETY_VERIFICATION_FAILED");
    }
    console.log(`Account isolation: ${elite.id !== unique.id && uniqueUnaffectedByElite && eliteUnaffectedByUnique ? "PASS" : "FAIL"}`);
    console.log("Seven Stars VehicleGpsBindings: 0");
    console.log("Seven Stars LatestState writes: 0");
    console.log("Database writes: 2 GpsProviderAccount rows only");
    console.log("Provider endpoints: POST /api/session, GET /api/devices, GET /api/positions");
    console.log(`Validation snapshots: ELITE=${validation.get("elite")?.devices ?? 0}, UNIQUE=${validation.get("unique")?.devices ?? 0}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "PHASE_4B_FAILED";
  console.error(`Seven Stars Phase 4B failed: ${message}`);
  process.exitCode = 1;
});
