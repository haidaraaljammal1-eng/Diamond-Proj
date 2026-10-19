/**
 * Read-only GPS + WhatsApp integrity manifest (no secrets in output).
 * Usage: MANIFEST_DATABASE_URL or LAB_DATABASE_URL or DATABASE_URL (haidara read-only audit only).
 */
import crypto from "node:crypto";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { extractPostgresDatabaseName } from "../src/lib/db/integration-database-guard";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const BLKWID_CONNECTION_ID = "3ddb050b-705f-4380-95cb-b97949fae023";
const BLKWID_CHANNEL = "BLKWID-4FG3P";
const BLKWID_PHONE = "963984179466";

function resolveDatabaseUrl(): string {
  const url =
    process.env.MANIFEST_DATABASE_URL?.trim() ||
    process.env.LAB_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "";
  if (!url) {
    throw new Error("Set MANIFEST_DATABASE_URL, LAB_DATABASE_URL, or DATABASE_URL");
  }
  return url;
}

function sha256Canonical(rows: Record<string, unknown>[]): string {
  const lines = rows.map((row) => JSON.stringify(row)).sort();
  return crypto.createHash("sha256").update(lines.join("\n")).digest("hex");
}

function ciphertextFingerprint(value: string | null | undefined): string | null {
  if (!value) return null;
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function buildManifest(prisma: PrismaClient) {
  const [
    providerAccounts,
    bindings,
    bindingHistory,
    latestStates,
    waConnections,
    waWebhookEvents,
    waConversations,
    waMessages,
    waOutbound,
    waConnectionAttempts,
    waChatSync,
    waContactProfiles,
    waContactSync,
    waGroupProfiles,
    waHistorySync,
  ] = await Promise.all([
    prisma.gpsProviderAccount.findMany({
      select: {
        id: true,
        providerKey: true,
        accountKey: true,
        displayName: true,
        enabled: true,
        companyScopeId: true,
        updatedAt: true,
        secretEncrypted: true,
        lastSuccessfulSyncAt: true,
        lastDeviceCount: true,
      },
      orderBy: { id: "asc" },
    }),
    prisma.vehicleGpsBinding.findMany({
      select: {
        id: true,
        vehicleId: true,
        providerAccountId: true,
        providerKey: true,
        externalDeviceId: true,
        externalDeviceUid: true,
        isActive: true,
        updatedAt: true,
      },
      orderBy: { vehicleId: "asc" },
    }),
    prisma.vehicleGpsBindingHistory.findMany({
      select: {
        id: true,
        vehicleId: true,
        providerAccountId: true,
        providerKey: true,
        externalDeviceId: true,
        endedAt: true,
      },
      orderBy: { id: "asc" },
    }),
    prisma.vehicleGpsLatestState.findMany({
      select: {
        id: true,
        vehicleId: true,
        bindingId: true,
        latitude: true,
        longitude: true,
        motionState: true,
        capturedAt: true,
        updatedAt: true,
      },
      orderBy: { vehicleId: "asc" },
    }),
    prisma.whatsAppConnection.findMany({
      select: {
        id: true,
        provider: true,
        status: true,
        providerInstanceId: true,
        displayPhoneNumber: true,
        webhookStatus: true,
        webhookCallbackCiphertext: true,
        credentialCiphertext: true,
        updatedAt: true,
        connectedAt: true,
      },
      orderBy: { id: "asc" },
    }),
    prisma.whatsAppWebhookEvent.count(),
    prisma.whatsAppConversation.count(),
    prisma.whatsAppMessage.count(),
    prisma.whatsAppOutboundAttempt.count(),
    prisma.whatsAppConnectionAttempt.count(),
    prisma.whatsAppConnectionChatSyncCheckpoint.count(),
    prisma.whatsAppContactProfile.count(),
    prisma.whatsAppContactSyncState.count(),
    prisma.whatsAppGroupProfile.count(),
    prisma.whatsAppHistorySyncRun.count(),
  ]);

  const trackedVehicleIds = bindings.filter((b) => b.isActive).map((b) => b.vehicleId);
  const liveMyBindings = bindings.filter((b) => b.providerKey === "LIVE_GPS");

  const gpsProviderFingerprints = providerAccounts.map((a) => ({
    id: a.id,
    providerKey: a.providerKey,
    accountKey: a.accountKey,
    enabled: a.enabled,
    updatedAt: a.updatedAt.toISOString(),
    secretFingerprint: ciphertextFingerprint(a.secretEncrypted),
    lastDeviceCount: a.lastDeviceCount,
  }));

  const gpsBindingFingerprints = bindings.map((b) => ({
    id: b.id,
    vehicleId: b.vehicleId,
    providerKey: b.providerKey,
    externalDeviceId: b.externalDeviceId,
    isActive: b.isActive,
    updatedAt: b.updatedAt.toISOString(),
  }));

  const blkwid = waConnections.find((c) => c.id === BLKWID_CONNECTION_ID);

  const whatsappConnectionFingerprints = waConnections.map((c) => ({
    id: c.id,
    provider: c.provider,
    status: c.status,
    providerInstanceId: c.providerInstanceId,
    displayPhoneNumber: c.displayPhoneNumber,
    webhookStatus: c.webhookStatus,
    updatedAt: c.updatedAt.toISOString(),
    credentialFingerprint: ciphertextFingerprint(c.credentialCiphertext),
    webhookCallbackFingerprint: ciphertextFingerprint(c.webhookCallbackCiphertext),
  }));

  return {
    generatedAt: new Date().toISOString(),
    gps: {
      providerAccountCount: providerAccounts.length,
      activeBindingCount: bindings.filter((b) => b.isActive).length,
      trackedVehicleCount: trackedVehicleIds.length,
      trackedVehicleIds,
      liveMyGpsBindingCount: liveMyBindings.length,
      liveMyGpsVehicleIds: liveMyBindings.map((b) => b.vehicleId),
      bindingHistoryCount: bindingHistory.length,
      latestStateCount: latestStates.length,
      providerAccountsDigest: sha256Canonical(gpsProviderFingerprints),
      bindingsDigest: sha256Canonical(gpsBindingFingerprints),
      latestStatesDigest: sha256Canonical(
        latestStates.map((s) => ({
          vehicleId: s.vehicleId,
          bindingId: s.bindingId,
          lat: String(s.latitude),
          lng: String(s.longitude),
          motionState: s.motionState,
          capturedAt: s.capturedAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        })),
      ),
      bindingHistoryDigest: sha256Canonical(
        bindingHistory.map((h) => ({
          id: h.id,
          vehicleId: h.vehicleId,
          providerKey: h.providerKey,
          externalDeviceId: h.externalDeviceId,
          endedAt: h.endedAt.toISOString(),
        })),
      ),
    },
    whatsapp: {
      connectionCount: waConnections.length,
      tableCounts: {
        webhookEvents: waWebhookEvents,
        conversations: waConversations,
        messages: waMessages,
        outboundAttempts: waOutbound,
        connectionAttempts: waConnectionAttempts,
        chatSyncCheckpoints: waChatSync,
        contactProfiles: waContactProfiles,
        contactSyncState: waContactSync,
        groupProfiles: waGroupProfiles,
        historySyncRuns: waHistorySync,
      },
      blkwid: {
        connectionId: BLKWID_CONNECTION_ID,
        expectedChannel: BLKWID_CHANNEL,
        expectedPhone: BLKWID_PHONE,
        present: Boolean(blkwid),
        channelMatches: blkwid?.providerInstanceId === BLKWID_CHANNEL,
        phoneMatches: blkwid?.displayPhoneNumber === BLKWID_PHONE,
        status: blkwid?.status ?? null,
        webhookStatus: blkwid?.webhookStatus ?? null,
        credentialFingerprint: ciphertextFingerprint(blkwid?.credentialCiphertext ?? null),
        webhookCallbackFingerprint: ciphertextFingerprint(blkwid?.webhookCallbackCiphertext ?? null),
      },
      connectionsDigest: sha256Canonical(whatsappConnectionFingerprints),
    },
  };
}

async function main() {
  const databaseUrl = resolveDatabaseUrl();
  const dbName = extractPostgresDatabaseName(databaseUrl);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    const manifest = await buildManifest(prisma);
    const outArg = process.argv[2];
    const payload = { database: dbName, ...manifest };
    const json = JSON.stringify(payload, null, 2);
    if (outArg) {
      fs.mkdirSync(path.dirname(path.resolve(outArg)), { recursive: true });
      fs.writeFileSync(path.resolve(outArg), json);
      console.log(JSON.stringify({ written: path.resolve(outArg), database: dbName }));
    } else {
      console.log(json);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
