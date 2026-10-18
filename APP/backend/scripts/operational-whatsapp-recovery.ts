/**
 * Approved operational recovery: remove verified Whapi test fixtures and restore BLKWID-4FG3P.
 * Targets `haidara` or `haidara_recovery_lab` only. Never haidara_test.
 */
import "dotenv/config";
import {
  PrismaClient,
  WhatsAppConnectionStatus,
  WhatsAppConnectionWebhookStatus,
  WhatsAppProvider,
  WhatsAppProviderSessionStatus,
  type Prisma,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { decryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { extractPostgresDatabaseName } from "../tests/helpers/integration-harness";

const ALLOWED_DB = new Set(["haidara", "haidara_recovery_lab"]);
const FIXTURE_PROVIDER_IDS = ["hist-sync-test", "hist-hardening", "p3b-test", "cleanup-signoff"];
const FIXTURE_WA_IDS = ["971500000099"];

const BLKWID_ROW = {
  id: "3ddb050b-705f-4380-95cb-b97949fae023",
  provider: WhatsAppProvider.WHAPI,
  status: WhatsAppConnectionStatus.LINKED,
  displayPhoneNumber: "963984179466",
  credentialCiphertext:
    "enc:v1:XE8VEZL2h_T3Mis3swcVwSbjgk5F8jBkJ64c0AluH0kR2Uiq1aj2mg0uQMTJMSKB7J8swq7weYVCt3RN",
  connectedByUserId: 1,
  connectedAt: new Date("2026-10-16T21:06:42.396Z"),
  lastValidatedAt: new Date("2026-10-18T15:37:14.124Z"),
  createdAt: new Date("2026-10-16T21:06:42.578Z"),
  updatedAt: new Date("2026-10-18T15:37:14.125Z"),
  webhookStatus: WhatsAppConnectionWebhookStatus.ACTIVE,
  lastWebhookAt: new Date("2026-10-17T18:22:33.159Z"),
  providerInstanceId: "BLKWID-4FG3P",
  providerApiUrl: "https://gate.whapi.cloud",
  providerSessionStatus: WhatsAppProviderSessionStatus.AUTHENTICATED,
  providerSessionCheckedAt: new Date("2026-10-18T15:37:14.124Z"),
  webhookCallbackCiphertext:
    "enc:v1:ryz2thzW8FFxZ68_xOg69fm1_VQNuFweDX_OmwBNVsPfcd3dZi52SCLlD1HkPQQlBSbkAtEJPu-zFhXE4dO4La5Xp6apfYcoCh2f-VFm8Vs1P7pUtudEekIBLhla7LPJx7vItHZJUIsw7mAih4RfewVpkf0JL988G8pSRsUvvHJDW7H46w9VUDJHbAMkV6aEmiqw68CKLPORHEfGdA",
};

function assertRecoveryTarget(): string {
  if (process.env.WHATSAPP_OPERATIONAL_RECOVERY_CONFIRM !== "1") {
    throw new Error("Set WHATSAPP_OPERATIONAL_RECOVERY_CONFIRM=1 to run operational WhatsApp recovery.");
  }
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required");
  const db = extractPostgresDatabaseName(url);
  if (!ALLOWED_DB.has(db)) {
    throw new Error(`Refusing WhatsApp recovery on database "${db}" (allowed: ${[...ALLOWED_DB].join(", ")})`);
  }
  if (db === "haidara_test") {
    throw new Error("Refusing WhatsApp recovery on haidara_test");
  }
  return db;
}

type Db = PrismaClient | Prisma.TransactionClient;

async function purgeFixtureConnection(prisma: Db, connectionId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  await prisma.whatsAppConversation.updateMany({
    where: { connectionId },
    data: { lastMessageId: null },
  });

  counts.outboundAttempts = (
    await prisma.whatsAppOutboundAttempt.deleteMany({ where: { connectionId } })
  ).count;
  counts.messages = (await prisma.whatsAppMessage.deleteMany({ where: { connectionId } })).count;
  counts.conversations = (await prisma.whatsAppConversation.deleteMany({ where: { connectionId } })).count;
  counts.webhookEvents = (await prisma.whatsAppWebhookEvent.deleteMany({ where: { connectionId } })).count;
  counts.historySyncRuns = (await prisma.whatsAppHistorySyncRun.deleteMany({ where: { connectionId } })).count;
  counts.chatSyncCheckpoints = (
    await prisma.whatsAppConnectionChatSyncCheckpoint.deleteMany({ where: { connectionId } })
  ).count;
  counts.contactProfiles = (await prisma.whatsAppContactProfile.deleteMany({ where: { connectionId } })).count;
  counts.contactSyncState = (await prisma.whatsAppContactSyncState.deleteMany({ where: { connectionId } })).count;
  counts.groupProfiles = (await prisma.whatsAppGroupProfile.deleteMany({ where: { connectionId } })).count;
  counts.connections = (await prisma.whatsAppConnection.deleteMany({ where: { id: connectionId } })).count;
  counts.outbox = (
    await prisma.domainOutboxEvent.deleteMany({
      where: { eventType: { startsWith: "whatsapp." } },
    })
  ).count;

  return counts;
}

async function main(): Promise<void> {
  const dbName = assertRecoveryTarget();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const fixtures = await prisma.whatsAppConnection.findMany({
      where: { providerInstanceId: { in: FIXTURE_PROVIDER_IDS } },
      select: { id: true, providerInstanceId: true, status: true },
    });

    const fixtureConversations = await prisma.whatsAppConversation.findMany({
      where: {
        OR: [
          { customerWaId: { in: FIXTURE_WA_IDS } },
          { customerDisplayName: { contains: "History User", mode: "insensitive" } },
        ],
      },
      select: { id: true, connectionId: true, customerWaId: true, customerDisplayName: true },
    });

    const connectionIds = new Set<string>();
    for (const row of fixtures) {
      if (row.providerInstanceId === "BLKWID-4FG3P") continue;
      connectionIds.add(row.id);
    }
    for (const conv of fixtureConversations) {
      connectionIds.add(conv.connectionId);
    }

    const removed: Record<string, Record<string, number>> = {};
    await prisma.$transaction(async (tx) => {
      for (const connectionId of connectionIds) {
        removed[connectionId] = await purgeFixtureConnection(tx, connectionId);
      }

      const existing = await tx.whatsAppConnection.findUnique({ where: { id: BLKWID_ROW.id } });
      if (!existing) {
        await tx.whatsAppConnection.create({ data: BLKWID_ROW });
      } else {
        await tx.whatsAppConnection.update({ where: { id: BLKWID_ROW.id }, data: BLKWID_ROW });
      }

      const currentLinked = await tx.whatsAppConnection.count({
        where: { status: { in: ["LINKED", "LINKING", "REAUTH_REQUIRED", "ERROR"] } },
      });
      if (currentLinked !== 1) {
        throw new Error(`Expected exactly one current connection after recovery, found ${currentLinked}`);
      }
    });

    const restored = await prisma.whatsAppConnection.findFirst({
      where: { providerInstanceId: "BLKWID-4FG3P" },
    });
    if (!restored?.credentialCiphertext) {
      throw new Error("BLKWID row missing after recovery");
    }
    const token = decryptWhatsAppCredential(restored.credentialCiphertext);
    if (!token || token.length < 8) {
      throw new Error("Credential decrypt failed");
    }

    const apiUrl = (restored.providerApiUrl ?? process.env.WHAPI_API_URL ?? "https://gate.whapi.cloud").replace(
      /\/$/,
      "",
    );
    const healthRes = await fetch(`${apiUrl}/health`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const healthBody = await healthRes.text();

    const remainingFixtures = await prisma.whatsAppConnection.count({
      where: { providerInstanceId: { in: FIXTURE_PROVIDER_IDS } },
    });
    const remainingHistoryUser = await prisma.whatsAppConversation.count({
      where: { customerWaId: { in: FIXTURE_WA_IDS } },
    });

    console.log(
      JSON.stringify(
        {
          database: dbName,
          removed,
          restored: {
            id: restored.id,
            providerInstanceId: restored.providerInstanceId,
            status: restored.status,
            webhookStatus: restored.webhookStatus,
            displayPhoneNumber: restored.displayPhoneNumber,
            providerSessionStatus: restored.providerSessionStatus,
          },
          whapiHealth: { httpStatus: healthRes.status, bodyPreview: healthBody.slice(0, 200) },
          remainingFixtures,
          remainingHistoryUser,
        },
        null,
        2,
      ),
    );

    if (remainingFixtures > 0 || remainingHistoryUser > 0) {
      throw new Error("Fixture contamination remains after recovery");
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
