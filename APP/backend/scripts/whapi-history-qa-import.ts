/**
 * Limited history import into haidara_test only. Read-only Whapi GET; no channel mutations.
 */
import dotenv from "dotenv";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertTestDatabaseUrl } from "../tests/helpers/integration-harness";
import { encryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import type { FastifyBaseLogger } from "fastify";
import { createWhatsAppHistorySyncService } from "src/modules/whatsapp/whatsapp.history-sync.service";
import { resetWhatsAppTables } from "../tests/helpers/whatsapp-reset";

const qaLog = console as unknown as FastifyBaseLogger;

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main(): Promise<void> {
  if (process.env.WHAPI_HISTORY_QA_IMPORT !== "1") {
    console.error("Set WHAPI_HISTORY_QA_IMPORT=1 to run isolated test DB import.");
    process.exit(1);
  }
  const testUrl = process.env.TEST_DATABASE_URL?.trim();
  if (!testUrl) {
    console.error("TEST_DATABASE_URL is required.");
    process.exit(1);
  }
  assertTestDatabaseUrl(testUrl);
  process.env.DATABASE_URL = testUrl;
  process.env.WHATSAPP_HISTORY_SYNC_AUTO_EXECUTE = "false";

  const token = process.env.WHAPI_TOKEN?.trim();
  if (!token) {
    console.error("WHAPI_TOKEN is required.");
    process.exit(1);
  }

  const maxBatches = Number.parseInt(process.env.WHAPI_HISTORY_QA_MAX_BATCHES ?? "8", 10);
  const adapter = new PrismaPg({ connectionString: testUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    await resetWhatsAppTables(prisma);
    const connection = await prisma.whatsAppConnection.create({
      data: {
        provider: "WHAPI",
        status: "LINKED",
        providerInstanceId: process.env.WHAPI_CHANNEL_ID?.trim() ?? "qa-channel",
        providerSessionStatus: "AUTHENTICATED",
        credentialCiphertext: encryptWhatsAppCredential(token),
        webhookCallbackCiphertext: encryptWhatsAppCredential("qa-callback"),
      },
    });

    const sync = createWhatsAppHistorySyncService({ prisma, log: qaLog });
    const run = await prisma.whatsAppHistorySyncRun.create({
      data: {
        connectionId: connection.id,
        status: "RUNNING",
        phase: "CHATS",
        startedAt: new Date(),
      },
    });

    for (let i = 0; i < maxBatches; i += 1) {
      const more = await sync.processHistorySyncBatch(run.id);
      if (!more) break;
    }

    const final = await prisma.whatsAppHistorySyncRun.findUniqueOrThrow({ where: { id: run.id } });
    const messageCount = await prisma.whatsAppMessage.count({ where: { connectionId: connection.id } });
    const conversationCount = await prisma.whatsAppConversation.count({
      where: { connectionId: connection.id },
    });

    console.log(
      JSON.stringify({
        connectionId: connection.id,
        runStatus: final.status,
        phase: final.phase,
        chatsDiscovered: final.chatsDiscovered,
        chatsCompleted: final.chatsCompleted,
        messagesImported: final.messagesImported,
        messagesSkipped: final.messagesSkipped,
        messagesOffset: final.messagesOffset,
        conversationCount,
        messageCount,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : "import_failed" }));
  process.exit(1);
});
