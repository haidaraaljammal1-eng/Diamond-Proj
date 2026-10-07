import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { ApiRequestError } from "../../../infrastructure/api/errors.ts";
import { isUiDemoSimulationEnabled } from "../../demo-simulation/simulation.enabled.ts";
import {
  WHATSAPP_LINK_CUSTOMER_PERMISSION,
  WHATSAPP_MANAGE_CONNECTION_PERMISSION,
  WHATSAPP_READ_PERMISSION,
  WHATSAPP_SEND_PERMISSION,
} from "../whatsapp.permissions.ts";
import { buildWhatsAppConversationQuery } from "./whatsapp-query.ts";
import { resolveWhatsAppErrorMessage } from "./resolve-whatsapp-error.ts";
import {
  applyUnreadZero,
  appendMessageById,
  commitIfCurrent,
  connectionBanner,
  conversationEligibility,
  conversationTitle,
  formatCustomerWaId,
  isClientSendWindowStillOpen,
  isFreeTextSendAllowed,
  isMediaSendAllowed,
  isTemplateSendAllowed,
  lastMessagePreviewKind,
  mergeById,
  mergeAndSortWhatsAppMessages,
  compareWhatsAppMessages,
  mergeConversationListIntoDetail,
  reconcileSelectedConversation,
  nextClientProviderStatus,
  outboundUiStatus,
  patchOutboundMessage,
  prependOlderMessages,
  toChronologicalPage,
  unreadBadgeLabel,
  upsertConversationForRealtime,
} from "./whatsapp-view-model.ts";
import { selectWhatsAppPresentation } from "../simulation/select-whatsapp-presentation.ts";
import {
  buildWhatsAppSimulationInbox,
  isWhatsAppSimulationId,
  WHATSAPP_SIMULATION_ID_PREFIX,
  WHATSAPP_SIMULATION_TEMPLATES,
} from "../simulation/whatsapp-simulation.fixture.ts";
import { WHAPI_CAPABILITIES } from "../types/whatsapp.types.ts";
import { blankWhatsAppMessageFields } from "./whatsapp-view-model.ts";
import type { WhatsAppConnectionDto, WhatsAppMessageDto } from "../types/whatsapp.types.ts";
import { META_CLOUD_CAPABILITIES } from "../types/whatsapp.types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const moduleDir = join(here, "..");
const messagesDir = join(here, "../../../../messages");

function walkSources(dir: string): string {
  const files: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) visit(full);
      else if (/\.(ts|tsx|css)$/.test(entry) && !entry.endsWith(".test.ts")) {
        files.push(readFileSync(full, "utf8"));
      }
    }
  };
  visit(dir);
  return files.join("\n");
}

function readJson(name: "en.json" | "ar.json") {
  return JSON.parse(readFileSync(join(messagesDir, name), "utf8")) as Record<string, unknown>;
}

function keysOf(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    keysOf(child, prefix ? `${prefix}.${key}` : key),
  );
}

function message(partial: Partial<WhatsAppMessageDto>): WhatsAppMessageDto {
  return {
    id: "m1",
    direction: "INBOUND",
    messageType: "TEXT",
    textBody: "Hello",
    ...blankWhatsAppMessageFields(),
    providerOccurredAt: "2026-09-12T10:00:00.000Z",
    receivedAt: "2026-09-12T10:00:01.000Z",
    providerStatus: null,
    sendState: null,
    ...partial,
  };
}

const disconnected: WhatsAppConnectionDto = {
  status: "DISCONNECTED",
  provider: "META_CLOUD_API",
  displayPhoneNumber: null,
  verifiedName: null,
  businessAccountName: null,
  connectedAt: null,
  connectedBy: null,
  lastValidatedAt: null,
  webhookStatus: "NOT_CONFIGURED",
  lastWebhookAt: null,
  providerSessionStatus: null,
  capabilities: META_CLOUD_CAPABILITIES,
};

describe("whatsapp.read permission", () => {
  it("uses the catalog key and gates the page", () => {
    assert.equal(WHATSAPP_READ_PERMISSION, "whatsapp.read");
    assert.equal(WHATSAPP_SEND_PERMISSION, "whatsapp.send");
    assert.notEqual(WHATSAPP_READ_PERMISSION, WHATSAPP_SEND_PERMISSION);
    assert.equal(WHATSAPP_MANAGE_CONNECTION_PERMISSION, "whatsapp.manage_connection");
    assert.equal(WHATSAPP_LINK_CUSTOMER_PERMISSION, "whatsapp.link_customer");
    const screen = readFileSync(join(moduleDir, "components/whatsapp-screen/whatsapp-screen.tsx"), "utf8");
    const hook = readFileSync(join(moduleDir, "hooks/use-whatsapp.ts"), "utf8");
    assert.match(hook, /WHATSAPP_PAGE_PERMISSIONS/);
    assert.match(hook, /WHATSAPP_SEND_PERMISSION/);
    assert.match(screen, /inbox\.isAllowed/);
    assert.match(screen, /denied\.title/);
  });
});

describe("conversation mapping", () => {
  it("falls back from display name to wa_id", () => {
    assert.equal(conversationTitle("Demo North Desk", "15550001001"), "Demo North Desk");
    assert.equal(conversationTitle("  ", "15550001001"), "15550001001");
    assert.equal(conversationTitle(null, "15550001001"), "15550001001");
  });

  it("does not guess country codes when formatting wa_id", () => {
    assert.equal(formatCustomerWaId("15550001001"), "15550001001");
  });

  it("uses text preview or a type kind for non-text", () => {
    assert.deepEqual(lastMessagePreviewKind("Hello", "TEXT"), { kind: "text", text: "Hello" });
    assert.deepEqual(lastMessagePreviewKind(null, "IMAGE"), { kind: "IMAGE" });
  });

  it("renders unread badges including 99+", () => {
    assert.equal(unreadBadgeLabel(0), null);
    assert.equal(unreadBadgeLabel(3), "3");
    assert.equal(unreadBadgeLabel(120), "99+");
  });
});

describe("search and unread query", () => {
  it("sends backend search and unread=true", () => {
    const search = buildWhatsAppConversationQuery({
      search: "15550001001",
      unread: false,
      page: 1,
      pageSize: 20,
    });
    assert.ok(search.includes("search=15550001001"));
    assert.equal(search.includes("unread="), false);
    const unread = buildWhatsAppConversationQuery({
      search: "",
      unread: true,
      page: 2,
      pageSize: 20,
    });
    assert.ok(unread.includes("unread=true"));
    assert.ok(unread.includes("page=2"));
  });
});

describe("message chronology", () => {
  it("converts newest-first API pages into chronological UI order", () => {
    const newestFirst = [
      message({ id: "new", providerOccurredAt: "2026-09-12T11:00:00.000Z", receivedAt: "2026-09-12T11:00:00.000Z" }),
      message({ id: "old", providerOccurredAt: "2026-09-12T10:00:00.000Z", receivedAt: "2026-09-12T10:00:00.000Z" }),
    ];
    assert.deepEqual(
      toChronologicalPage(newestFirst).map((item) => item.id),
      ["old", "new"],
    );
  });

  it("prepends older pages and dedupes by message id", () => {
    const current = [
      message({ id: "mid", providerOccurredAt: "2026-09-12T10:00:00.000Z", receivedAt: "2026-09-12T10:00:00.000Z" }),
      message({ id: "new", providerOccurredAt: "2026-09-12T11:00:00.000Z", receivedAt: "2026-09-12T11:00:00.000Z" }),
    ];
    const olderNewestFirst = [
      message({ id: "mid", providerOccurredAt: "2026-09-12T10:00:00.000Z", receivedAt: "2026-09-12T10:00:00.000Z" }),
      message({ id: "oldest", providerOccurredAt: "2026-09-12T09:00:00.000Z", receivedAt: "2026-09-12T09:00:00.000Z" }),
    ];
    assert.deepEqual(
      prependOlderMessages(current, olderNewestFirst).map((item) => item.id),
      ["oldest", "mid", "new"],
    );
  });

  it("dedupes conversations by id", () => {
    const merged = mergeById(
      [{ id: "a", unreadCount: 1 }],
      [{ id: "a", unreadCount: 0 }, { id: "b", unreadCount: 2 }],
    );
    assert.equal(merged.length, 2);
    assert.equal(merged[0]?.unreadCount, 0);
  });
});

describe("unread mark-read", () => {
  it("zeros unread after a confirmed read without dropping the selected object", () => {
    const read = applyUnreadZero({
      id: "c1",
      customerWaId: "15550001001",
      customerDisplayName: "Demo",
      lastMessagePreview: "Hi",
      lastMessageType: "TEXT",
      lastMessageAt: "2026-09-12T10:00:00.000Z",
      unreadCount: 4,
      lastInboundAt: "2026-09-12T10:00:00.000Z",
      customerLinked: false,
      connection: { displayPhoneNumber: null, verifiedName: null },
    });
    assert.equal(read.unreadCount, 0);
    assert.equal(read.id, "c1");
  });
});

describe("stale requests", () => {
  it("ignores a late response from another conversation", () => {
    assert.equal(commitIfCurrent(1, 2, "b", "a", "payload"), undefined);
    assert.equal(commitIfCurrent(2, 2, "b", "b", "payload"), "payload");
  });
});

describe("connection banners", () => {
  it("maps disconnected, linked-inactive, webhook active, and reauth", () => {
    assert.equal(connectionBanner(disconnected), "disconnected");
    assert.equal(
      connectionBanner({ ...disconnected, status: "LINKED", webhookStatus: "PENDING" }),
      "webhookInactive",
    );
    assert.equal(
      connectionBanner({ ...disconnected, status: "LINKED", webhookStatus: "ACTIVE" }),
      "none",
    );
    assert.equal(
      connectionBanner({ ...disconnected, status: "REAUTH_REQUIRED", webhookStatus: "ACTIVE" }),
      "reauth",
    );
  });
});

describe("error resolver", () => {
  it("falls back safely for unknown API errors and missing keys", () => {
    const t = Object.assign((key: string) => key, { has: () => false });
    const error = new ApiRequestError({ code: "SOME_UNKNOWN_CODE", message: "nope" }, 500);
    assert.equal(resolveWhatsAppErrorMessage(t, error), "WhatsApp data could not be loaded. Try again.");
    assert.equal(resolveWhatsAppErrorMessage(t, { not: "an error" }), "WhatsApp data could not be loaded. Try again.");
  });
});

describe("simulation isolation", () => {
  it("is frontend-only, gated, and never mixed with real data", () => {
    assert.equal(isUiDemoSimulationEnabled("whatsapp", "true", "development"), true);
    assert.equal(isUiDemoSimulationEnabled("whatsapp", "false", "development"), false);
    assert.equal(isUiDemoSimulationEnabled("whatsapp", "true", "production"), false);
    const fixture = buildWhatsAppSimulationInbox();
    assert.ok(fixture.conversations.length >= 5);
    assert.ok(fixture.conversations.length <= 8);
    assert.ok(fixture.conversations.every((item) => isWhatsAppSimulationId(item.id)));
    assert.ok(WHATSAPP_SIMULATION_ID_PREFIX.startsWith("sim-"));
    const real = [{ id: "real" }];
    const simulated = [{ id: `${WHATSAPP_SIMULATION_ID_PREFIX}x` }];
    assert.deepEqual(selectWhatsAppPresentation(real, true, simulated), simulated);
    assert.deepEqual(selectWhatsAppPresentation(real, false, simulated), real);
  });
});

describe("i18n", () => {
  it("keeps AR and EN WhatsApp keys aligned with required labels", () => {
    const en = readJson("en.json");
    const ar = readJson("ar.json");
    const enWa = en.WhatsApp as Record<string, unknown>;
    const arWa = ar.WhatsApp as Record<string, unknown>;
    assert.deepEqual(keysOf(enWa).sort(), keysOf(arWa).sort());
    const navigation = en.navigation as Record<string, string>;
    const navigationAr = ar.navigation as Record<string, string>;
    assert.equal(navigation.chats, "WhatsApp");
    assert.equal(navigationAr.chats, "واتساب");
    assert.equal((enWa.filters as Record<string, string>).all, "All");
    assert.equal((arWa.filters as Record<string, string>).all, "الكل");
    assert.equal((enWa.filters as Record<string, string>).unread, "Unread");
    assert.equal((arWa.filters as Record<string, string>).unread, "غير المقروءة");
    const status = enWa.status as Record<string, string>;
    const statusAr = arWa.status as Record<string, string>;
    assert.equal(status.sending, "Sending");
    assert.equal(statusAr.sending, "جارٍ الإرسال");
    assert.equal(status.pending, "Pending");
    assert.equal(statusAr.pending, "قيد الإرسال");
    assert.equal(status.sent, "Sent");
    assert.equal(statusAr.sent, "تم الإرسال");
    assert.equal(status.delivered, "Delivered");
    assert.equal(statusAr.delivered, "تم التسليم");
    assert.equal(status.read, "Read");
    assert.equal(statusAr.read, "تمت القراءة");
    assert.equal(status.failed, "Failed");
    assert.equal(statusAr.failed, "فشل الإرسال");
    assert.equal(status.unknown, "Status uncertain");
    assert.equal(statusAr.unknown, "حالة الإرسال غير مؤكدة");
    const composer = enWa.composer as Record<string, unknown>;
    const composerAr = arWa.composer as Record<string, unknown>;
    assert.equal(composer.noPermission, "You do not have permission to send WhatsApp messages.");
    assert.equal(composerAr.noPermission, "ليس لديك صلاحية لإرسال رسائل واتساب.");
    const closed = (composer.reason as Record<string, string>).CUSTOMER_SERVICE_WINDOW_CLOSED;
    const closedAr = (composerAr.reason as Record<string, string>).CUSTOMER_SERVICE_WINDOW_CLOSED;
    assert.match(closed, /24-hour customer service window has ended/);
    assert.match(closedAr, /انتهت نافذة خدمة العميل لمدة 24 ساعة/);
  });
});

describe("prohibited WhatsApp UI", () => {
  it("does not persist history, expose secrets, or fake Meta send from the client", () => {
    const source = walkSources(moduleDir);
    assert.equal(source.includes("dangerouslySetInnerHTML"), false);
    assert.equal(source.includes("localStorage"), false);
    assert.equal(source.includes("sessionStorage"), false);
    assert.equal(source.includes("console.log"), false);
    assert.equal(source.includes("Typing"), false);
    assert.equal(source.includes("Last seen"), false);
    assert.equal(source.includes("Messaging Ready"), false);
    assert.equal(source.includes("Connected Now"), false);
    assert.equal(source.includes("providerMediaId"), false);
    assert.equal(source.includes("credentialCiphertext"), false);
    assert.match(source, /disabled/);
    assert.match(source, /markWhatsAppConversationRead/);
    assert.doesNotMatch(source, /read receipt/i);
    const composer = readFileSync(join(moduleDir, "components/composer/composer.tsx"), "utf8");
    assert.doesNotMatch(composer, /retry/i);
    const api = readFileSync(join(moduleDir, "api/whatsapp.api.ts"), "utf8");
    assert.equal(api.includes('method: "POST"') && api.includes("/read"), true);
    assert.match(api, /sendWhatsAppTextMessage/);
    assert.match(api, /Idempotency-Key/);
    assert.doesNotMatch(api, /toWaId/);
    assert.doesNotMatch(api, /providerMessageId/);
    const sendFns = ["sendWhatsAppTextMessage", "sendWhatsAppTemplateMessage", "sendWhatsAppMediaMessage"]
      .map((name) => {
        const start = api.indexOf(`export async function ${name}`);
        const next = api.indexOf("export async function", start + 1);
        return api.slice(start, next === -1 ? undefined : next);
      })
      .join("\n");
    assert.doesNotMatch(sendFns, /phoneNumberId/);
    assert.doesNotMatch(sendFns, /wabaId/);
  });

  it("keeps simulation removable without backend writes", () => {
    const store = readFileSync(join(moduleDir, "simulation/whatsapp-simulation.store.ts"), "utf8");
    const hook = readFileSync(join(moduleDir, "hooks/use-whatsapp.ts"), "utf8");
    const realtimeHook = readFileSync(join(moduleDir, "hooks/use-whatsapp-realtime.ts"), "utf8");
    const realStore = readFileSync(join(moduleDir, "stores/whatsapp.store.ts"), "utf8");
    const realtimeClient = readFileSync(join(moduleDir, "realtime/whatsapp.realtime-client.ts"), "utf8");
    const simRealtime = readFileSync(join(moduleDir, "simulation/whatsapp-simulation.realtime.ts"), "utf8");
    assert.match(store, /isWhatsAppDemoEnabled\(\)/);
    assert.match(hook, /simulationActive/);
    assert.match(hook, /selectSim\(id\)/);
    assert.match(hook, /if \(simulationActive\) \{\s*return sendSim/);
    assert.doesNotMatch(hook, /acquireWhatsAppRealtime/);
    assert.match(realtimeHook, /sessionStatus === "authenticated" && isAllowed/);
    assert.match(realtimeHook, /sessionStatus === "loading"/);
    assert.match(realtimeHook, /acquireWhatsAppRealtime/);
    const screen = readFileSync(join(moduleDir, "components/whatsapp-screen/whatsapp-screen.tsx"), "utf8");
    assert.match(screen, /useWhatsAppRealtimeSubscription/);
    assert.doesNotMatch(store, /markWhatsAppConversationRead/);
    assert.doesNotMatch(store, /listWhatsAppConversations/);
    assert.doesNotMatch(store, /sendWhatsAppTextMessage/);
    assert.match(realStore, /sendWhatsAppTextMessage/);
    assert.match(realStore, /applyRealtimeEvent/);
    assert.doesNotMatch(realStore, /sendSim/);
    assert.doesNotMatch(realStore, /buildWhatsAppSimulationInbox/);
    assert.doesNotMatch(realStore, /whatsapp-simulation/);
    assert.doesNotMatch(realtimeClient, /\?token=/);
    assert.match(realtimeClient, /Authorization/);
    assert.match(realtimeClient, /env\.apiUrl/);
    assert.doesNotMatch(realtimeClient, /EventSource/);
    assert.doesNotMatch(simRealtime, /\/whatsapp\/realtime/);
    assert.doesNotMatch(simRealtime, /acquireWhatsAppRealtime/);
  });
});

describe("manual outbound send UX", () => {
  it("maps sendState and providerStatus without treating ACCEPTED as SENT", () => {
    assert.equal(
      outboundUiStatus(message({ direction: "OUTBOUND", sendState: "PENDING", providerStatus: null })),
      "sending",
    );
    assert.equal(
      outboundUiStatus(message({ direction: "OUTBOUND", sendState: "ACCEPTED", providerStatus: null })),
      "pending",
    );
    assert.equal(
      outboundUiStatus(message({ direction: "OUTBOUND", sendState: "ACCEPTED", providerStatus: "SENT" })),
      "sent",
    );
    assert.equal(
      outboundUiStatus(
        message({ direction: "OUTBOUND", sendState: "ACCEPTED", providerStatus: "DELIVERED" }),
      ),
      "delivered",
    );
    assert.equal(
      outboundUiStatus(message({ direction: "OUTBOUND", sendState: "ACCEPTED", providerStatus: "READ" })),
      "read",
    );
    assert.equal(
      outboundUiStatus(message({ direction: "OUTBOUND", sendState: "FAILED", providerStatus: null })),
      "failed",
    );
    assert.equal(
      outboundUiStatus(message({ direction: "OUTBOUND", sendState: "UNKNOWN", providerStatus: null })),
      "unknown",
    );
    assert.equal(outboundUiStatus(message({ direction: "INBOUND", sendState: null })), null);
  });

  it("applies realtime list and status patches without duplicating bubbles or regressing READ", () => {
    const row = {
      id: "c1",
      customerWaId: "15550001001",
      customerDisplayName: "Demo",
      lastMessagePreview: "Hello",
      lastMessageType: "TEXT" as const,
      lastMessageAt: "2026-09-12T10:00:00.000Z",
      unreadCount: 2,
      lastInboundAt: "2026-09-12T10:00:00.000Z",
      customerLinked: false,
      connection: { displayPhoneNumber: null, verifiedName: null },
    };
    const listed = upsertConversationForRealtime([], row, { search: "", unread: false }, null);
    assert.equal(listed.length, 1);
    const unreadOnly = upsertConversationForRealtime(
      listed,
      { ...row, unreadCount: 0 },
      { search: "", unread: true },
      null,
    );
    assert.equal(unreadOnly.length, 0);
    const keepSelected = upsertConversationForRealtime(
      listed,
      { ...row, unreadCount: 0 },
      { search: "", unread: true },
      "c1",
    );
    assert.equal(keepSelected.length, 1);
    const hiddenBySearch = upsertConversationForRealtime(
      listed,
      row,
      { search: "zzz-no-match", unread: false },
      null,
    );
    assert.equal(hiddenBySearch.length, 0);
    const outbound = message({
      id: "out-9",
      direction: "OUTBOUND",
      sendState: "ACCEPTED",
      providerStatus: "SENT",
    });
    const delivered = patchOutboundMessage([outbound], "out-9", { providerStatus: "DELIVERED" });
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0]?.providerStatus, "DELIVERED");
    const raced = appendMessageById(delivered, {
      ...outbound,
      sendState: "ACCEPTED",
      providerStatus: "SENT",
    });
    assert.equal(raced.length, 1);
    assert.equal(nextClientProviderStatus("READ", "DELIVERED"), "READ");
    assert.equal(nextClientProviderStatus("DELIVERED", "READ"), "READ");
    const failed = patchOutboundMessage(delivered, "out-9", { sendState: "FAILED" });
    assert.equal(failed[0]?.sendState, "FAILED");
    assert.equal(failed[0]?.id, "out-9");
  });

  it("keeps failed and unknown outbound rows when merging by id", () => {
    const failed = message({
      id: "out-1",
      direction: "OUTBOUND",
      sendState: "FAILED",
      textBody: "Office note",
    });
    const unknown = message({
      id: "out-2",
      direction: "OUTBOUND",
      sendState: "UNKNOWN",
      textBody: "Second note",
    });
    const merged = appendMessageById([failed, unknown], { ...failed, sendState: "FAILED" });
    assert.equal(merged.length, 2);
    assert.equal(merged.find((item) => item.id === "out-1")?.sendState, "FAILED");
    assert.equal(merged.find((item) => item.id === "out-2")?.sendState, "UNKNOWN");
  });

  it("does not increment unread from an outbound list patch", () => {
    const patched = applyUnreadZero({
      id: "c1",
      customerWaId: "15550001001",
      customerDisplayName: "Demo",
      lastMessagePreview: "Outbound office note",
      lastMessageType: "TEXT",
      lastMessageAt: "2026-09-12T10:00:00.000Z",
      unreadCount: 0,
      lastInboundAt: "2026-09-12T10:00:00.000Z",
      customerLinked: false,
      connection: { displayPhoneNumber: null, verifiedName: null },
    });
    assert.equal(patched.unreadCount, 0);
    assert.equal(patched.lastMessagePreview, "Outbound office note");
  });

  it("treats eligibility as backend-authored and disables at window expiry", () => {
    const ready = {
      id: "c1",
      customerWaId: "15550001001",
      customerDisplayName: "Demo",
      lastMessagePreview: "Hi",
      lastMessageType: "TEXT" as const,
      lastMessageAt: "2026-09-12T10:00:00.000Z",
      unreadCount: 0,
      lastInboundAt: "2026-09-12T10:00:00.000Z",
      lastReadAt: null,
      createdAt: "2026-09-12T09:00:00.000Z",
      customerLinked: false,
      customerLink: { linked: false, customer: null, linkedAt: null },
      connection: { displayPhoneNumber: null, verifiedName: null },
      messagingEligibility: {
        canSendText: true,
        canSendMedia: true,
        canSendTemplate: true,
        reason: "READY" as const,
        windowExpiresAt: "2026-09-13T10:00:00.000Z",
      },
    };
    assert.equal(conversationEligibility(ready)?.canSendText, true);
    assert.equal(
      isClientSendWindowStillOpen("2026-09-13T10:00:00.000Z", Date.parse("2026-09-13T09:59:59.000Z")),
      true,
    );
    assert.equal(
      isClientSendWindowStillOpen("2026-09-13T10:00:00.000Z", Date.parse("2026-09-13T10:00:00.000Z")),
      false,
    );
    const closed = {
      ...ready,
      messagingEligibility: {
        canSendText: false,
        canSendMedia: false,
        canSendTemplate: true,
        reason: "CUSTOMER_SERVICE_WINDOW_CLOSED" as const,
        windowExpiresAt: "2026-09-13T10:00:00.000Z",
      },
    };
    assert.equal(conversationEligibility(closed)?.canSendText, false);
    assert.equal(conversationEligibility(closed)?.reason, "CUSTOMER_SERVICE_WINDOW_CLOSED");
  });

  it("gates the composer on permission, eligibility, text, and a reused idempotency key", () => {
    const composer = readFileSync(join(moduleDir, "components/composer/composer.tsx"), "utf8");
    const hook = readFileSync(join(moduleDir, "hooks/use-whatsapp.ts"), "utf8");
    const store = readFileSync(join(moduleDir, "stores/whatsapp.store.ts"), "utf8");
    assert.match(composer, /inbox\.hasSendPermission/);
    assert.match(composer, /composer\.noPermission/);
    assert.match(composer, /CUSTOMER_SERVICE_WINDOW_CLOSED/);
    assert.match(composer, /composer\.reason\.\$\{eligibility\.reason\}/);
    assert.match(composer, /idempotencyKey\.current/);
    assert.match(composer, /crypto\.randomUUID/);
    assert.match(composer, /disabled=\{file \? !canSendMedia : !canSubmitText\}/);
    assert.match(composer, /disabled=\{!enabled \|\| \(!inbox\.canSend && !file\)\}/);
    assert.match(composer, /inbox\.canSend/);
    assert.doesNotMatch(composer, /SENT/);
    assert.match(hook, /isFreeTextSendAllowed/);
    assert.match(hook, /reconcileSelectedConversation/);
    assert.match(store, /if \(get\(\)\.sending\) return false/);
    assert.match(store, /reconcileSelectedConversation/);
    assert.match(store, /mergeAndSortWhatsAppMessages/);
    assert.match(store, /queueConversationReconcile/);
    assert.match(store, /Promise\.all/);
    assert.match(store, /appendMessageById/);
    assert.doesNotMatch(store, /providerStatus: "SENT"/);
  });

  it("orders messages by provider time regardless of arrival order", () => {
    const mk = (
      id: string,
      providerOccurredAt: string,
      direction: "INBOUND" | "OUTBOUND",
    ) =>
      ({
        id,
        direction,
        messageType: "TEXT" as const,
        textBody: id,
        caption: null,
        mediaFilename: null,
        mediaMimeType: null,
        mediaSizeBytes: null,
        hasProtectedMedia: false,
        templateName: null,
        templateLanguage: null,
        templatePreview: null,
        location: null,
        contacts: null,
        reaction: null,
        interactive: null,
        sendState: null,
        providerStatus: null,
        providerOccurredAt,
        receivedAt: providerOccurredAt,
      }) satisfies import("../types/whatsapp.types.ts").WhatsAppMessageDto;

    const shuffled = [
      mk("m4", "2026-10-02T04:01:00.000Z", "OUTBOUND"),
      mk("m1", "2026-10-02T03:39:00.000Z", "INBOUND"),
      mk("m3", "2026-10-02T03:59:00.000Z", "INBOUND"),
      mk("m2", "2026-10-02T03:58:00.000Z", "OUTBOUND"),
    ];
    const ordered = mergeAndSortWhatsAppMessages([], shuffled).map((m) => m.id);
    assert.deepEqual(ordered, ["m1", "m2", "m3", "m4"]);

    const merged = mergeAndSortWhatsAppMessages(
      [mk("m1", "2026-10-02T03:39:00.000Z", "INBOUND")],
      [mk("m2", "2026-10-02T03:58:00.000Z", "OUTBOUND"), mk("m1", "2026-10-02T03:39:00.000Z", "INBOUND")],
    );
    assert.equal(merged.length, 2);
    assert.equal(merged[0].id, "m1");
    assert.equal(merged[1].id, "m2");
    const tieA = mk("aaa", "2026-10-02T03:00:00.000Z", "INBOUND");
    const tieB = mk("bbb", "2026-10-02T03:00:00.000Z", "OUTBOUND");
    assert.ok(compareWhatsAppMessages(tieA, tieB) < 0);
  });

  it("preserves detail eligibility when the list row refreshes", () => {
    const listRow = {
      id: "c-whapi",
      customerWaId: "963984179466",
      customerDisplayName: "Inbound",
      lastMessagePreview: "مرحبا",
      lastMessageType: "TEXT" as const,
      lastMessageAt: "2026-10-02T12:00:00.000Z",
      unreadCount: 1,
      lastInboundAt: "2026-10-02T12:00:00.000Z",
      customerLinked: false,
      connection: { displayPhoneNumber: "963984179466", verifiedName: null },
    };
    const detail = {
      ...listRow,
      unreadCount: 0,
      lastReadAt: "2026-10-02T12:01:00.000Z",
      createdAt: "2026-10-02T11:00:00.000Z",
      customerLink: { linked: false, customer: null, linkedAt: null },
      messagingEligibility: {
        canSendText: true,
        canSendMedia: true,
        canSendTemplate: false,
        reason: "READY" as const,
        windowExpiresAt: null,
      },
    };
    const merged = reconcileSelectedConversation([listRow], detail);
    assert.equal(conversationEligibility(merged)?.canSendText, true);
    assert.equal(merged && "lastReadAt" in merged ? merged.lastReadAt : null, detail.lastReadAt);
    assert.equal(merged && "messagingEligibility" in merged ? merged.unreadCount : null, 1);
    const mergedFields = mergeConversationListIntoDetail(detail, { ...listRow, unreadCount: 0 });
    assert.equal(mergedFields.unreadCount, 0);
    assert.equal(mergedFields.messagingEligibility.reason, "READY");
  });

  it("does not apply Meta service window to WHAPI free-text send", () => {
    const eligibility = {
      canSendText: true,
      canSendMedia: true,
      canSendTemplate: false,
      reason: "READY" as const,
      windowExpiresAt: "2020-01-01T00:00:00.000Z",
    };
    assert.equal(
      isFreeTextSendAllowed(eligibility, {
        hasSendPermission: true,
        requiresCustomerServiceWindow: WHAPI_CAPABILITIES.requiresCustomerServiceWindow,
        simulationActive: false,
      }),
      true,
    );
    assert.equal(
      isFreeTextSendAllowed(eligibility, {
        hasSendPermission: true,
        requiresCustomerServiceWindow: true,
        simulationActive: false,
      }),
      false,
    );
    assert.equal(
      isFreeTextSendAllowed(eligibility, {
        hasSendPermission: false,
        requiresCustomerServiceWindow: false,
        simulationActive: false,
      }),
      false,
    );
    assert.equal(
      isTemplateSendAllowed(
        { ...eligibility, canSendTemplate: false },
        { hasSendPermission: true, simulationActive: false },
      ),
      false,
    );
    assert.equal(
      isMediaSendAllowed(eligibility, {
        hasSendPermission: true,
        requiresCustomerServiceWindow: false,
        simulationActive: false,
      }),
      true,
    );
  });

  it("includes open and closed simulation windows and stays frontend-only", () => {
    const fixture = buildWhatsAppSimulationInbox();
    const open = Object.values(fixture.details).filter((item) => item.messagingEligibility.canSendText);
    assert.ok(open.length >= 1);
    assert.equal(fixture.connection.capabilities.requiresCustomerServiceWindow, false);
    const simStore = readFileSync(join(moduleDir, "simulation/whatsapp-simulation.store.ts"), "utf8");
    assert.match(simStore, /sim-wa-send-|WHATSAPP_SIMULATION_ID_PREFIX/);
    assert.match(simStore, /sendState: "ACCEPTED"/);
    assert.doesNotMatch(simStore, /providerStatus: "SENT"/);
    assert.match(simStore, /QR_REQUIRED/);
  });
});

describe("final Inbox UX", () => {
  it("keeps closed-window free text off and template action available", () => {
    const fixture = buildWhatsAppSimulationInbox();
    assert.equal(fixture.connection.capabilities.supportsTemplates, false);
    assert.equal(fixture.connection.capabilities.requiresCustomerServiceWindow, false);
    assert.ok(
      Object.values(fixture.details).every((item) => item.messagingEligibility.canSendTemplate === false),
    );
    const composer = readFileSync(join(moduleDir, "components/composer/composer.tsx"), "utf8");
    assert.match(composer, /whatsapp-use-template/);
    assert.match(composer, /canSendTemplate/);
    assert.match(composer, /whatsapp-attach/);
    assert.match(composer, /PROVIDER_NOT_AUTHENTICATED/);
    assert.match(composer, /QR_REQUIRED/);
  });

  it("lists only sendable templates and keeps unapproved ones out of send", () => {
    assert.ok(WHATSAPP_SIMULATION_TEMPLATES.some((item) => item.sendable && item.name === "hello_office"));
    assert.ok(WHATSAPP_SIMULATION_TEMPLATES.some((item) => !item.sendable));
    const dialog = readFileSync(join(moduleDir, "components/template-dialog/template-dialog.tsx"), "utf8");
    assert.match(dialog, /item\.sendable/);
    assert.match(dialog, /headerParameters/);
    assert.match(dialog, /bodyParameters/);
  });

  it("renders inbound media types and keeps failed/unknown outbound visible", () => {
    const fixture = buildWhatsAppSimulationInbox();
    const all = Object.values(fixture.messages).flat();
    assert.ok(all.some((item) => item.messageType === "IMAGE"));
    assert.ok(all.some((item) => item.messageType === "DOCUMENT"));
    assert.ok(all.some((item) => item.messageType === "AUDIO"));
    assert.ok(all.some((item) => item.messageType === "VIDEO"));
    assert.ok(all.some((item) => item.messageType === "STICKER"));
    assert.ok(all.some((item) => item.messageType === "LOCATION"));
    assert.ok(all.some((item) => item.direction === "OUTBOUND" && item.sendState === "FAILED"));
    assert.ok(all.some((item) => item.direction === "OUTBOUND" && item.sendState === "UNKNOWN"));
    const bubble = readFileSync(join(moduleDir, "components/message-bubble/message-bubble.tsx"), "utf8");
    assert.match(bubble, /fetchWhatsAppMediaObjectUrl/);
    assert.match(bubble, /message\.mediaUnavailable/);
    assert.doesNotMatch(bubble, /autoPlay/);
  });

  it("shows linked customer and possible match without auto-link", () => {
    const fixture = buildWhatsAppSimulationInbox();
    const north = Object.values(fixture.details).find((item) => item.customerLink.linked);
    assert.ok(north);
    assert.equal(north?.customerLink.customer?.name, "Demo Linked Customer");
    const strip = readFileSync(join(moduleDir, "components/customer-strip/customer-strip.tsx"), "utf8");
    assert.match(strip, /possibleMatch/);
    assert.match(strip, /AMBIGUOUS/);
    assert.doesNotMatch(strip, /auto-link/i);
    assert.match(strip, /searchDiamondCustomers/);
  });

  it("gates Manage WhatsApp and uses official Embedded Signup bootstrap only", () => {
    const screen = readFileSync(join(moduleDir, "components/whatsapp-screen/whatsapp-screen.tsx"), "utf8");
    const settings = readFileSync(join(moduleDir, "components/connection-settings/connection-settings.tsx"), "utf8");
    assert.match(screen, /hasManageConnectionPermission/);
    assert.match(screen, /manage\.button/);
    assert.match(settings, /bootstrapWhatsAppConnection/);
    assert.match(settings, /supportsEmbeddedSignup/);
    assert.match(settings, /supportsQrAuthentication/);
    assert.match(settings, /startWhatsAppConnectionAttempt/);
    assert.match(settings, /WHATSAPP_EMBEDDED_SIGNUP_NOT_CONFIGURED/);
    assert.match(settings, /activateWhatsAppWebhook/);
    assert.match(settings, /changeAccountConfirm/);
    assert.match(settings, /whatsapp-qr-dialog/);
    assert.doesNotMatch(settings, /localStorage/);
    assert.doesNotMatch(settings, /sessionStorage/);
  });

  it("does not put media bytes or recipient overrides on the client API", () => {
    const api = readFileSync(join(moduleDir, "api/whatsapp.api.ts"), "utf8");
    assert.match(api, /template-messages/);
    assert.match(api, /media-messages/);
    assert.match(api, /customer-match/);
    assert.match(api, /webhook\/activate/);
    assert.doesNotMatch(api, /toWaId/);
    assert.doesNotMatch(api, /credentialCiphertext/);
    assert.doesNotMatch(api, /META_APP_SECRET/);
    const realtime = readFileSync(join(moduleDir, "realtime/whatsapp.realtime.ts"), "utf8");
    assert.doesNotMatch(realtime, /base64/);
  });
});
