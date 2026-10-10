/**
 * Phase 4A — Live GPS binding audit (read-only). Local operator review output.
 */
import dotenv from "dotenv";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { decryptSecretBlob } from "src/modules/integrations/secret-blob";
import { isGpsProviderAccountLocallyConfigured } from "src/modules/gps/gps-provider-account.semantics";
import { isGpsProviderConfigured } from "src/modules/gps/gps-provider-configured";
import { createLiveGpsClient } from "src/modules/gps/providers/live-gps/live-gps.client";
import {
  auditProviderDevices,
  collisionCheck,
  extractProviderDevicesFromFleetRows,
  toEliteVehicleCandidate,
  type MatchCategory,
} from "src/modules/gps/poc/live-gps-binding-audit";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

function databaseUrl(): string {
  const explicit = process.env.GPS_POC_DATABASE_URL?.trim();
  if (explicit) return explicit;
  const base = env.DATABASE_URL;
  if (/\/haidara_test(\?|$)/.test(base)) {
    return base.replace("/haidara_test", "/haidara");
  }
  return base;
}

function createPrisma(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl() }),
  });
}

async function main(): Promise<void> {
  const prisma = createPrisma();
  const dbLabel = databaseUrl().match(/@([^/]+)\/([^?]+)/);
  console.log("Database:", dbLabel ? `${dbLabel[1]}/${dbLabel[2]}` : "unknown");

  try {
    const account = await prisma.gpsProviderAccount.findFirst({
      where: { providerKey: "LIVE_GPS", accountKey: "elite" },
      include: { companyScope: true },
    });
    if (!account) throw new Error("LIVE_GPS elite account not found");

    const credentialsAvailable = isGpsProviderAccountLocallyConfigured(account);
    const bindingCountBefore = await prisma.vehicleGpsBinding.count({
      where: { providerAccountId: account.id, isActive: true },
    });
    const latestCountBefore = await prisma.vehicleGpsLatestState.count({
      where: { binding: { providerAccountId: account.id } },
    });
    const vehicleCountBefore = await prisma.vehicle.count();
    const contractCountBefore = await prisma.contract.count();
    const providerConfiguredBefore = await isGpsProviderConfigured(prisma);

    if (!credentialsAvailable) {
      throw new Error("Encrypted credentials missing on LIVE_GPS elite account");
    }

    const secrets = decryptSecretBlob(account.secretEncrypted);
    const client = createLiveGpsClient();
    const ctx = {
      providerAccountId: account.id,
      secrets: {
        username: secrets.username!,
        password: secrets.password!,
      },
      config: (account.config ?? {}) as Record<string, unknown>,
    };

    const { fleet, rawRows } = await client.fetchFleetSnapshotInternal(ctx);
    const devices = extractProviderDevicesFromFleetRows(rawRows);

    const elite = await prisma.operatingCompany.findUnique({ where: { code: "ELITE" } });
    if (!elite) throw new Error("ELITE company missing");

    const vehicles = await prisma.vehicle.findMany({
      where: { companyId: elite.id },
      include: { model: true },
      orderBy: { id: "asc" },
    });

    const eliteCandidates = vehicles.map(toEliteVehicleCandidate);
    const auditRows = auditProviderDevices(devices, eliteCandidates);
    const collisions = collisionCheck(auditRows);

    const bindingCountAfter = await prisma.vehicleGpsBinding.count({
      where: { providerAccountId: account.id, isActive: true },
    });
    const latestCountAfter = await prisma.vehicleGpsLatestState.count({
      where: { binding: { providerAccountId: account.id } },
    });
    const vehicleCountAfter = await prisma.vehicle.count();
    const contractCountAfter = await prisma.contract.count();
    const providerConfiguredAfter = await isGpsProviderConfigured(prisma);

    const counts: Record<MatchCategory, number> = {
      EXACT: 0,
      LIKELY: 0,
      AMBIGUOUS: 0,
      NO_MATCH: 0,
    };
    for (const r of auditRows) counts[r.matchCategory] += 1;

    const recommended = auditRows.filter(
      (r) => r.matchCategory === "EXACT" || r.matchCategory === "LIKELY",
    );

    const report = {
      A_account: {
        providerAccountId: account.id,
        providerKey: account.providerKey,
        accountKey: account.accountKey,
        companyScope: account.companyScope?.code ?? null,
        enabled: account.enabled,
        credentialsAvailable,
      },
      B_providerFleet: {
        providerRows: rawRows.length,
        validRows: fleet.validRowCount,
        invalidRows: fleet.invalidRowCount,
      },
      C_eliteFleet: {
        totalEliteVehicles: vehicles.length,
        active: vehicles.filter((v) => v.isActive).length,
        inactive: vehicles.filter((v) => !v.isActive).length,
      },
      D_bindingAuditTable: auditRows,
      E_collisionCheck: {
        ...collisions,
        existingBindingCount: bindingCountAfter,
      },
      F_summary: counts,
      G_recommendedBindingSetForReview: recommended.map((r) => ({
        externalDeviceId: r.externalDeviceId,
        diamondVehicleId: r.diamondVehicleId,
        matchCategory: r.matchCategory,
        matchEvidence: r.matchEvidence,
      })),
      H_dbMutation: {
        vehicleGpsBindingChanged: bindingCountBefore !== bindingCountAfter,
        vehicleGpsLatestStateChanged: latestCountBefore !== latestCountAfter,
        vehicleChanged: vehicleCountBefore !== vehicleCountAfter,
        contractChanged: contractCountBefore !== contractCountAfter,
        providerConfiguredChanged: providerConfiguredBefore !== providerConfiguredAfter,
      },
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e instanceof Error ? e.message : "failed" }));
  process.exit(1);
});
