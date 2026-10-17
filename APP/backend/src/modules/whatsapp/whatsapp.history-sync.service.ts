import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import type {
  Prisma,
  PrismaClient,
  WhatsAppConnectionStatus,
  WhatsAppHistorySyncRun,
  WhatsAppHistorySyncStatus,
} from "@prisma/client";
import { env } from "src/config/env";
import { withTransaction } from "src/lib/db/transaction";
import { WhapiClient } from "src/modules/whatsapp/providers/whapi.client";
import {
  chatIdFromWhapiChatRow,
  createWhapiHistoryClient,
  displayNameFromWhapiChatRow,
  type WhapiHistoryClient,
} from "src/modules/whatsapp/whapi.history.client";
import {
  parseWhapiHistoryMessage,
  type ParsedWhapiHistoryMessage,
} from "src/modules/whatsapp/whapi.history.parse";
import { isWhapiDirectChatId, isWhapiGroupChatId } from "src/modules/whatsapp/whapi.chat-id";
import { whapiRuntimeConfig } from "src/modules/whatsapp/whapi.config";
import {
  WHATSAPP_CURRENT_STATUSES,
  WHATSAPP_HISTORY_SYNC_CHATS_PAGE,
  WHATSAPP_HISTORY_SYNC_INTER_REQUEST_MS,
  WHATSAPP_HISTORY_SYNC_MAX_PROVIDER_RETRIES,
  WHATSAPP_HISTORY_SYNC_MESSAGES_PAGE,
  WHATSAPP_HISTORY_SYNC_MESSAGES_PER_TICK,
  WHATSAPP_HISTORY_SYNC_PROVIDER_BACKOFF_BASE_MS,
} from "src/modules/whatsapp/whatsapp.constants";
import { isRetriableWhapiHistoryError } from "src/modules/whatsapp/whatsapp.history-sync.provider-errors";
import { decryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { whatsappError } from "src/modules/whatsapp/whatsapp.errors";
import { materializeInboundMessage } from "src/modules/whatsapp/whatsapp.inbound.service";
import { materializeOutboundEchoMessage } from "src/modules/whatsapp/whatsapp.outbound-echo.service";
import { writeWhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime-outbox";
import { publishWhatsAppRealtime } from "src/modules/whatsapp/whatsapp.realtime-publisher";
import type { WhatsAppHistorySyncStatusDto } from "src/modules/whatsapp/whatsapp.schema";

export type HistorySyncChatQueueEntry = {
  chatId: string;
  displayName: string | null;
};

function parseChatQueue(value: Prisma.JsonValue): HistorySyncChatQueueEntry[] {
  if (!Array.isArray(value)) return [];
  const out: HistorySyncChatQueueEntry[] = [];
  for (const row of value) {
    if (typeof row === "string" && row.trim()) {
      out.push({ chatId: row.trim(), displayName: null });
      continue;
    }
    if (row && typeof row === "object" && !Array.isArray(row)) {
      const record = row as Record<string, unknown>;
      const chatId = typeof record.chatId === "string" ? record.chatId.trim() : "";
      if (!chatId) continue;
      const displayName =
        typeof record.displayName === "string" && record.displayName.trim()
          ? record.displayName.trim()
          : null;
      out.push({ chatId, displayName });
    }
  }
  return out;
}

function serializeChatQueue(queue: HistorySyncChatQueueEntry[]): Prisma.InputJsonValue {
  return queue as Prisma.InputJsonValue;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let historyClientOverride: WhapiHistoryClient | null = null;
const providerRetryStreak = new Map<string, number>();

function clearProviderRetryStreak(runId: string): void {
  providerRetryStreak.delete(runId);
}

function backoffMs(attempt: number): number {
  return WHATSAPP_HISTORY_SYNC_PROVIDER_BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1);
}

/** Test-only injection for Whapi list APIs. */
export function setWhapiHistoryClientForTests(client: WhapiHistoryClient | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("history client injection is not allowed in production");
  }
  historyClientOverride = client;
}

type HistorySyncDeps = {
  prisma: PrismaClient;
  log: FastifyBaseLogger;
};

export function createWhatsAppHistorySyncService(deps: FastifyInstance | HistorySyncDeps) {
  const prisma = deps.prisma;
  const log = deps.log;

  async function resolveHistoryClient(connectionId: string): Promise<WhapiHistoryClient> {
    if (historyClientOverride) return historyClientOverride;
    const connection = await prisma.whatsAppConnection.findUnique({
      where: { id: connectionId },
      select: { credentialCiphertext: true, providerApiUrl: true, provider: true, status: true },
    });
    if (!connection || connection.provider !== "WHAPI") throw whatsappError.providerNotConfigured();
    const currentStatuses: WhatsAppConnectionStatus[] = [...WHATSAPP_CURRENT_STATUSES];
    if (!currentStatuses.includes(connection.status)) {
      throw whatsappError.connectionNotFound();
    }
    if (!connection.credentialCiphertext) {
      throw whatsappError.providerNotConfigured();
    }
    const token = decryptWhatsAppCredential(connection.credentialCiphertext);
    const cfg = whapiRuntimeConfig();
    const apiUrl = connection.providerApiUrl?.trim() || cfg.apiUrl;
    return createWhapiHistoryClient(new WhapiClient({ apiUrl, token }));
  }

  async function getCurrentConnectionId(): Promise<string> {
    const row = await prisma.whatsAppConnection.findFirst({
      where: { status: { in: [...WHATSAPP_CURRENT_STATUSES] }, provider: "WHAPI" },
      select: { id: true },
    });
    if (!row) throw whatsappError.connectionNotFound();
    return row.id;
  }

  async function toStatusDto(run: WhatsAppHistorySyncRun | null): Promise<WhatsAppHistorySyncStatusDto> {
    const queue = run ? parseChatQueue(run.chatQueue) : [];
    const status: WhatsAppHistorySyncStatus | "IDLE" = run?.status ?? "IDLE";
    return {
      runId: run?.id ?? null,
      connectionId: run?.connectionId ?? null,
      status,
      phase: run?.phase ?? null,
      chatsDiscovered: run?.chatsDiscovered ?? 0,
      chatsCompleted: run?.chatsCompleted ?? 0,
      chatsQueued: queue.length,
      chatQueueIndex: run?.chatQueueIndex ?? 0,
      messagesImported: run?.messagesImported ?? 0,
      messagesSkipped: run?.messagesSkipped ?? 0,
      cancelRequested: run?.cancelRequested ?? false,
      lastErrorCode: run?.lastErrorCode ?? null,
      partialHistoryNotice: true,
      startedAt: run?.startedAt?.toISOString() ?? null,
      completedAt: run?.completedAt?.toISOString() ?? null,
      updatedAt: run?.updatedAt?.toISOString() ?? null,
    };
  }

  async function getStatus() {
    const connectionId = await getCurrentConnectionId();
    const run = await prisma.whatsAppHistorySyncRun.findFirst({
      where: { connectionId },
      orderBy: { createdAt: "desc" },
    });
    return toStatusDto(run);
  }

  async function enqueueForConnection(connectionId: string, queuedByUserId: number | null) {
    const active = await prisma.whatsAppHistorySyncRun.findFirst({
      where: {
        connectionId,
        status: { in: ["QUEUED", "RUNNING"] },
      },
    });
    if (active) return active;

    return prisma.whatsAppHistorySyncRun.create({
      data: {
        connectionId,
        status: "QUEUED",
        phase: "CHATS",
        queuedByUserId,
      },
    });
  }

  async function start(userId: number, execute: boolean) {
    if (env.WHATSAPP_PROVIDER !== "WHAPI") throw whatsappError.providerNotConfigured();
    const connectionId = await getCurrentConnectionId();
    let run = await prisma.whatsAppHistorySyncRun.findFirst({
      where: { connectionId, status: { in: ["QUEUED", "RUNNING"] } },
      orderBy: { createdAt: "desc" },
    });
    if (!run) {
      run = await enqueueForConnection(connectionId, userId);
    }
    if (run.status === "RUNNING") {
      return toStatusDto(run);
    }
    if (execute) {
      run = await prisma.whatsAppHistorySyncRun.update({
        where: { id: run.id },
        data: {
          status: "RUNNING",
          startedAt: run.startedAt ?? new Date(),
          queuedByUserId: run.queuedByUserId ?? userId,
          cancelRequested: false,
        },
      });
      scheduleRun(run.id);
    }
    return toStatusDto(run);
  }

  async function cancel(userId: number) {
    const connectionId = await getCurrentConnectionId();
    const run = await prisma.whatsAppHistorySyncRun.findFirst({
      where: { connectionId, status: { in: ["QUEUED", "RUNNING"] } },
      orderBy: { createdAt: "desc" },
    });
    if (!run) return toStatusDto(null);
    const updated = await prisma.whatsAppHistorySyncRun.update({
      where: { id: run.id },
      data: { cancelRequested: true, queuedByUserId: run.queuedByUserId ?? userId },
    });
    return toStatusDto(updated);
  }

  const scheduled = new Set<string>();

  function scheduleRun(runId: string) {
    if (scheduled.has(runId)) return;
    scheduled.add(runId);
    void (async () => {
      try {
        while (await processHistorySyncBatch(runId)) {
          await sleep(WHATSAPP_HISTORY_SYNC_INTER_REQUEST_MS);
        }
      } catch (err) {
        log.error({ err, runId }, "whatsapp history sync: worker failed");
      } finally {
        scheduled.delete(runId);
      }
    })();
  }

  async function materializeHistoryMessage(
    connectionId: string,
    parsed: ParsedWhapiHistoryMessage | null,
    receivedAt: Date,
  ): Promise<"imported" | "skipped"> {
    if (!parsed) return "skipped";
    const displayPayload: Record<string, unknown> = { source: "history_import" };
    if (parsed.voiceNote) displayPayload.whapi = { voice: true };

    if (parsed.fromMe) {
      const result = await materializeOutboundEchoMessage(prisma, {
        connectionId,
        customerWaId: parsed.customerWaId,
        providerChatId: parsed.chatId,
        providerMessageId: parsed.providerMessageId,
        messageType: parsed.messageType,
        textBody: parsed.textBody,
        caption: parsed.caption,
        mediaFilename: parsed.mediaFilename,
        providerMediaId: parsed.providerMediaId,
        mediaMimeType: parsed.mediaMimeType,
        voiceNote: parsed.voiceNote,
        providerOccurredAt: parsed.providerOccurredAt,
        receivedAt,
        historical: true,
        source: "history_import",
      });
      return result.created ? "imported" : "skipped";
    }

    const result = await materializeInboundMessage(
      prisma,
      {
        connectionId,
        customerWaId: parsed.customerWaId,
        providerChatId: parsed.chatId,
        customerDisplayName: parsed.displayName,
        providerMessageId: parsed.providerMessageId,
        messageType: parsed.messageType,
        textBody: parsed.textBody,
        providerMediaId: parsed.providerMediaId,
        caption: parsed.caption,
        mediaFilename: parsed.mediaFilename,
        mediaMimeType: parsed.mediaMimeType,
        mediaSizeBytes: parsed.mediaSizeBytes,
        displayPayload,
        providerOccurredAt: parsed.providerOccurredAt,
        receivedAt,
      },
      { historical: true },
    );
    return result.created ? "imported" : "skipped";
  }

  /**
   * Processes one bounded batch. Returns true when more work may remain.
   */
  async function isConnectionActiveForRun(connectionId: string): Promise<boolean> {
    const connection = await prisma.whatsAppConnection.findUnique({
      where: { id: connectionId },
      select: { status: true },
    });
    const currentStatuses: WhatsAppConnectionStatus[] = [...WHATSAPP_CURRENT_STATUSES];
    return Boolean(connection && currentStatuses.includes(connection.status));
  }

  async function processHistorySyncBatch(runId: string): Promise<boolean> {
    const run = await prisma.whatsAppHistorySyncRun.findUnique({ where: { id: runId } });
    if (!run || run.status !== "RUNNING") return false;
    if (!(await isConnectionActiveForRun(run.connectionId))) {
      await prisma.whatsAppHistorySyncRun.update({
        where: { id: runId },
        data: {
          status: "CANCELLED",
          lastErrorCode: "WHATSAPP_HISTORY_SYNC_CONNECTION_INACTIVE",
          completedAt: new Date(),
        },
      });
      clearProviderRetryStreak(runId);
      return false;
    }
    if (run.cancelRequested) {
      await prisma.whatsAppHistorySyncRun.update({
        where: { id: runId },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
      clearProviderRetryStreak(runId);
      return false;
    }

    let client: WhapiHistoryClient;
    try {
      client = await resolveHistoryClient(run.connectionId);
    } catch (err) {
      await prisma.whatsAppHistorySyncRun.update({
        where: { id: runId },
        data: {
          status: "FAILED",
          lastErrorCode: "WHATSAPP_HISTORY_SYNC_NOT_CONFIGURED",
          completedAt: new Date(),
        },
      });
      return false;
    }

    const receivedAt = new Date();
    let queue = parseChatQueue(run.chatQueue);
    let chatsOffset = run.chatsOffset;
    let chatQueueIndex = run.chatQueueIndex;
    let messagesOffset = run.messagesOffset;
    let phase = run.phase;
    let chatsDiscovered = run.chatsDiscovered;
    let chatsCompleted = run.chatsCompleted;
    let messagesImported = run.messagesImported;
    let messagesSkipped = run.messagesSkipped;

    try {
      if (phase === "CHATS") {
        const page = await client.listChats(WHATSAPP_HISTORY_SYNC_CHATS_PAGE, chatsOffset);
        const existing = new Set(queue.map((entry) => entry.chatId));
        for (const row of page.items) {
          const chatId = chatIdFromWhapiChatRow(row);
          if (!chatId || isWhapiGroupChatId(chatId) || !isWhapiDirectChatId(chatId)) continue;
          if (existing.has(chatId)) continue;
          existing.add(chatId);
          queue.push({ chatId, displayName: displayNameFromWhapiChatRow(row) });
          chatsDiscovered += 1;
        }
        chatsOffset += page.items.length;
        if (!page.hasMore || page.items.length === 0) {
          phase = "MESSAGES";
          chatQueueIndex = 0;
          messagesOffset = 0;
        }
      } else if (phase === "MESSAGES") {
        if (chatQueueIndex >= queue.length) {
          phase = "DONE";
        } else {
          const current = queue[chatQueueIndex]!;
          const page = await client.listMessages(
            current.chatId,
            WHATSAPP_HISTORY_SYNC_MESSAGES_PAGE,
            messagesOffset,
            "asc",
          );
          if (page.items.length === 0) {
            chatQueueIndex += 1;
            messagesOffset = 0;
            chatsCompleted += 1;
          } else {
            const batch = page.items.slice(0, WHATSAPP_HISTORY_SYNC_MESSAGES_PER_TICK);
            for (const row of batch) {
              const parsed = parseWhapiHistoryMessage(row, current.chatId, current.displayName);
              const outcome = await materializeHistoryMessage(run.connectionId, parsed, receivedAt);
              if (outcome === "imported") messagesImported += 1;
              else messagesSkipped += 1;
            }
            messagesOffset += batch.length;
            if (!page.hasMore && batch.length === page.items.length) {
              chatQueueIndex += 1;
              messagesOffset = 0;
              chatsCompleted += 1;
            }
          }
        }
      }

      if (phase === "DONE") {
        const events = await withTransaction(prisma, async (tx) => {
          await tx.whatsAppHistorySyncRun.update({
            where: { id: runId },
            data: {
              status: "COMPLETED",
              phase: "DONE",
              completedAt: new Date(),
              chatQueue: serializeChatQueue(queue),
              chatsOffset,
              chatQueueIndex,
              messagesOffset,
              chatsDiscovered,
              chatsCompleted,
              messagesImported,
              messagesSkipped,
            },
          });
          const event = await writeWhatsAppRealtimeEvent(tx, {
            type: "whatsapp.realtime.resync",
            dedupeKey: `whatsapp.history_sync.completed:${runId}`,
            connectionId: run.connectionId,
          });
          return event ? [event] : [];
        });
        publishWhatsAppRealtime(events);
        clearProviderRetryStreak(runId);
        return false;
      }

      clearProviderRetryStreak(runId);
      await prisma.whatsAppHistorySyncRun.update({
        where: { id: runId },
        data: {
          phase,
          chatQueue: serializeChatQueue(queue),
          chatsOffset,
          chatQueueIndex,
          messagesOffset,
          chatsDiscovered,
          chatsCompleted,
          messagesImported,
          messagesSkipped,
        },
      });
      return true;
    } catch (err) {
      if (isRetriableWhapiHistoryError(err)) {
        const streak = (providerRetryStreak.get(runId) ?? 0) + 1;
        providerRetryStreak.set(runId, streak);
        if (streak < WHATSAPP_HISTORY_SYNC_MAX_PROVIDER_RETRIES) {
          log.warn({ err, runId, streak }, "whatsapp history sync: retriable provider error");
          await sleep(backoffMs(streak));
          return true;
        }
      }
      const code =
        err instanceof Error && err.message.startsWith("whapi_")
          ? "WHATSAPP_HISTORY_SYNC_PROVIDER_ERROR"
          : "WHATSAPP_HISTORY_SYNC_FAILED";
      log.warn({ err, runId }, "whatsapp history sync: batch failed");
      clearProviderRetryStreak(runId);
      await prisma.whatsAppHistorySyncRun.update({
        where: { id: runId },
        data: {
          status: "FAILED",
          lastErrorCode: code,
          completedAt: new Date(),
          chatQueue: serializeChatQueue(queue),
          chatsOffset,
          chatQueueIndex,
          messagesOffset,
          chatsDiscovered,
          chatsCompleted,
          messagesImported,
          messagesSkipped,
        },
      });
      return false;
    }
  }

  async function enqueueAfterConnection(connectionId: string, userId: number | null) {
    if (!env.WHATSAPP_HISTORY_SYNC_ENQUEUE_ON_CONNECT) return null;
    const run = await enqueueForConnection(connectionId, userId);
    if (env.WHATSAPP_HISTORY_SYNC_AUTO_EXECUTE) {
      const started = await prisma.whatsAppHistorySyncRun.update({
        where: { id: run.id },
        data: { status: "RUNNING", startedAt: new Date() },
      });
      scheduleRun(started.id);
    }
    return run.id;
  }

  return {
    getStatus,
    start,
    cancel,
    enqueueAfterConnection,
    processHistorySyncBatch,
    scheduleRun,
  };
}

export async function enqueueWhapiHistorySyncAfterConnect(
  deps: HistorySyncDeps,
  connectionId: string,
  userId: number | null,
) {
  const service = createWhatsAppHistorySyncService(deps);
  return service.enqueueAfterConnection(connectionId, userId);
}
