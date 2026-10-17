/**
 * Read-only Whapi history QA probe. Logs counts and field keys only — never message bodies.
 * Refuses to run unless WHAPI_HISTORY_QA_PROBE=1.
 */
import dotenv from "dotenv";
import path from "node:path";
import { WhapiClient } from "src/modules/whatsapp/providers/whapi.client";
import {
  chatIdFromWhapiChatRow,
  createWhapiHistoryClient,
} from "src/modules/whatsapp/whapi.history.client";
import { whapiRuntimeConfig } from "src/modules/whatsapp/whapi.config";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main(): Promise<void> {
  if (process.env.WHAPI_HISTORY_QA_PROBE !== "1") {
    console.error("Set WHAPI_HISTORY_QA_PROBE=1 to run read-only Whapi probe.");
    process.exit(1);
  }
  const token = process.env.WHAPI_TOKEN?.trim();
  if (!token) {
    console.error("WHAPI_TOKEN is required.");
    process.exit(1);
  }
  const cfg = whapiRuntimeConfig();
  const client = createWhapiHistoryClient(
    new WhapiClient({ apiUrl: cfg.apiUrl, token }),
  );

  const chatsPage = await client.listChats(5, 0);
  console.log(
    JSON.stringify({
      phase: "chats",
      itemCount: chatsPage.items.length,
      hasMore: chatsPage.hasMore,
      firstItemKeys: chatsPage.items[0] ? Object.keys(chatsPage.items[0]).sort() : [],
    }),
  );

  const firstChatId = chatsPage.items.map((row) => chatIdFromWhapiChatRow(row)).find(Boolean);
  if (!firstChatId) {
    console.log(JSON.stringify({ phase: "messages", skipped: true, reason: "no_direct_chat" }));
    return;
  }

  const messagesPage = await client.listMessages(firstChatId, 5, 0, "asc");
  console.log(
    JSON.stringify({
      phase: "messages",
      chatIdSuffix: firstChatId.slice(-8),
      itemCount: messagesPage.items.length,
      hasMore: messagesPage.hasMore,
      firstItemKeys: messagesPage.items[0] ? Object.keys(messagesPage.items[0]).sort() : [],
    }),
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : "probe_failed" }));
  process.exit(1);
});
