/**
 * Controlled Live GPS real-account PoC (Phase 3).
 * Local operator use only — never expose as HTTP route.
 *
 * Commands:
 *   store-credentials  Encrypt username/password into GpsProviderAccount.secretEncrypted
 *   run                One login + one fleet fetch + sanitized JSON report
 *
 * Credentials (never pass on CLI argv):
 *   - LIVE_GPS_POC_USERNAME / LIVE_GPS_POC_PASSWORD in .env (local, uncommitted), or
 *   - interactive prompts on TTY
 */
import dotenv from "dotenv";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { encryptSecretBlob } from "src/modules/integrations/secret-blob";
import { isGpsProviderAccountLocallyConfigured } from "src/modules/gps/gps-provider-account.semantics";
import {
  resolveLiveGpsEliteAccount,
  runLiveGpsPoc,
} from "src/modules/gps/poc/live-gps-poc.runner";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

function databaseUrl(): string {
  return process.env.GPS_POC_DATABASE_URL?.trim() || env.DATABASE_URL;
}

function createPrisma(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl() }),
  });
}

async function readCredentialEnvOrPrompt(): Promise<{ username: string; password: string }> {
  const fromEnvUser = process.env.LIVE_GPS_POC_USERNAME?.trim();
  const fromEnvPass = process.env.LIVE_GPS_POC_PASSWORD?.trim();
  if (fromEnvUser && fromEnvPass) {
    return { username: fromEnvUser, password: fromEnvPass };
  }

  const rl = readline.createInterface({ input, output });
  const username = (await rl.question("Live GPS username: ")).trim();
  const password = (await rl.question("Live GPS password: ")).trim();
  rl.close();
  if (!username || !password) {
    throw new Error("Username and password are required");
  }
  return { username, password };
}

async function storeCredentials(): Promise<void> {
  const prisma = createPrisma();
  try {
    const { account } = await resolveLiveGpsEliteAccount(prisma);
    const creds = await readCredentialEnvOrPrompt();
    const secretEncrypted = encryptSecretBlob({
      username: creds.username,
      password: creds.password,
    });
    await prisma.gpsProviderAccount.update({
      where: { id: account.id },
      data: { secretEncrypted },
    });
    console.log(
      JSON.stringify(
        {
          credentialsStored: true,
          providerAccountId: account.id,
          providerKey: account.providerKey,
          accountKey: account.accountKey,
          companyScopeId: account.companyScopeId,
          enabled: account.enabled,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function runPoc(): Promise<void> {
  const prisma = createPrisma();
  try {
    const { account } = await resolveLiveGpsEliteAccount(prisma);
    if (!isGpsProviderAccountLocallyConfigured(account)) {
      console.error(
        JSON.stringify({
          error: "NO_CREDENTIALS",
          message: "Run: npx tsx scripts/live-gps-poc.ts store-credentials",
        }),
      );
      process.exitCode = 2;
      return;
    }

    const includeDeviceList = process.argv.includes("--device-list");
    const report = await runLiveGpsPoc(prisma, account.id, { includeDeviceList });
    console.log(JSON.stringify(report, null, 2));
    if (report.error || !report.authenticationSucceeded) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === "store-credentials") {
    await storeCredentials();
    return;
  }
  if (cmd === "run") {
    await runPoc();
    return;
  }
  console.error("Usage: tsx scripts/live-gps-poc.ts <store-credentials|run> [--device-list]");
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      error: "POC_FAILED",
      message: err instanceof Error ? err.message : "Unknown error",
    }),
  );
  process.exitCode = 1;
});
