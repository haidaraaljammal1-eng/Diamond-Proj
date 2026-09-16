import type { WhatsAppWebhookEventType } from "@prisma/client";
import {
  extractDisplayPayload,
  extractInboundMediaFields,
} from "src/modules/whatsapp/whatsapp.display-payload";

export interface ParsedWebhookItem {
  eventType: WhatsAppWebhookEventType;
  providerEventKey: string;
  wabaId: string | null;
  phoneNumberId: string | null;
  providerMessageId: string | null;
  customerWaId: string | null;
  customerDisplayName: string | null;
  occurredAt: Date | null;
  messageType: string | null;
  textBody: string | null;
  providerMediaId: string | null;
  caption: string | null;
  mediaFilename: string | null;
  mediaMimeType: string | null;
  displayPayload: Record<string, unknown> | null;
  failureCode: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function metaId(value: unknown): string | null {
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return value;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return String(Math.trunc(value));
  }
  return null;
}

/** Official Meta message timestamps are unix seconds (string). */
export function parseMetaUnixTimestamp(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1e11) {
    const date = new Date(value * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds >= 1e11) return null;
    const date = new Date(seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function contactNameByWaId(contacts: unknown): Map<string, string | null> {
  const map = new Map<string, string | null>();
  if (!Array.isArray(contacts)) return map;
  for (const item of contacts) {
    const row = asRecord(item);
    const waId = asString(row?.wa_id);
    if (!waId) continue;
    const profile = asRecord(row?.profile);
    map.set(waId, asString(profile?.name));
  }
  return map;
}

function eventTypeForField(field: string): WhatsAppWebhookEventType {
  if (field === "messages") return "UNKNOWN";
  if (field === "message_template_status_update") return "TEMPLATE_STATUS";
  if (field === "account_update" || field === "account_alerts") return "ACCOUNT_EVENT";
  if (field.startsWith("phone_number_")) return "PHONE_EVENT";
  return "UNKNOWN";
}

function changeKey(envelopeHash: string, entryIndex: number, changeIndex: number): string {
  return `change:${envelopeHash}:${entryIndex}:${changeIndex}`;
}

/**
 * Forward-compatible extraction of official WhatsApp Cloud API webhook items.
 * Unknown future fields are ignored; missing security-critical ids fail that item.
 * `envelopeHash` is sha256(raw body) so non-message events stay idempotent on retry.
 */
export function parseWhatsAppWebhookItems(
  payload: unknown,
  envelopeHash: string,
): ParsedWebhookItem[] {
  const root = asRecord(payload);
  if (!root) return [];
  const entries = Array.isArray(root.entry) ? root.entry : [];
  const items: ParsedWebhookItem[] = [];

  entries.forEach((entry, entryIndex) => {
    const entryRow = asRecord(entry);
    const wabaId = metaId(entryRow?.id) ?? asString(entryRow?.id);
    const changes = Array.isArray(entryRow?.changes) ? entryRow.changes : [];
    changes.forEach((change, changeIndex) => {
      const changeRow = asRecord(change);
      const field = asString(changeRow?.field) ?? "";
      const value = asRecord(changeRow?.value);
      const metadata = asRecord(value?.metadata);
      const phoneNumberId = metaId(metadata?.phone_number_id);
      const fallbackKey = changeKey(envelopeHash, entryIndex, changeIndex);

      if (field === "messages" && value) {
        const names = contactNameByWaId(value.contacts);
        const messages = Array.isArray(value.messages) ? value.messages : [];
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        let extracted = 0;
        for (const message of messages) {
          const msg = asRecord(message);
          const providerMessageId = asString(msg?.id);
          if (!providerMessageId) continue;
          const from = asString(msg?.from);
          const type = asString(msg?.type) ?? "unknown";
          const text = asRecord(msg?.text);
          const textBody = type === "text" ? asString(text?.body) : null;
          const mediaObj = asRecord(msg?.[type]);
          const media = extractInboundMediaFields(type, mediaObj);
          const displayPayload = extractDisplayPayload(type, msg ?? {});
          items.push({
            eventType: "MESSAGE_RECEIVED",
            providerEventKey: `wamid:${providerMessageId}`,
            wabaId,
            phoneNumberId,
            providerMessageId,
            customerWaId: from,
            customerDisplayName: from ? (names.get(from) ?? null) : null,
            occurredAt: parseMetaUnixTimestamp(msg?.timestamp),
            messageType: type,
            textBody,
            providerMediaId: media.providerMediaId,
            caption: media.caption,
            mediaFilename: media.filename,
            mediaMimeType: media.mimeType,
            displayPayload: displayPayload as Record<string, unknown> | null,
            failureCode: phoneNumberId ? null : "WHATSAPP_WEBHOOK_MALFORMED_PAYLOAD",
          });
          extracted += 1;
        }
        for (const statusRow of statuses) {
          const st = asRecord(statusRow);
          const providerMessageId = asString(st?.id);
          const status = asString(st?.status);
          if (!providerMessageId || !status) continue;
          items.push({
            eventType: "MESSAGE_STATUS",
            providerEventKey: `wamid:${providerMessageId}:status:${status}`,
            wabaId,
            phoneNumberId,
            providerMessageId,
            customerWaId: asString(st?.recipient_id),
            customerDisplayName: null,
            occurredAt: parseMetaUnixTimestamp(st?.timestamp),
            messageType: status,
            textBody: null,
            providerMediaId: null,
            caption: null,
            mediaFilename: null,
            mediaMimeType: null,
            displayPayload: null,
            failureCode: phoneNumberId ? null : "WHATSAPP_WEBHOOK_MALFORMED_PAYLOAD",
          });
          extracted += 1;
        }
        if (extracted === 0) {
          items.push({
            eventType: "UNKNOWN",
            providerEventKey: fallbackKey,
            wabaId,
            phoneNumberId,
            providerMessageId: null,
            customerWaId: null,
            customerDisplayName: null,
            occurredAt: null,
            messageType: field,
            textBody: null,
            providerMediaId: null,
            caption: null,
            mediaFilename: null,
            mediaMimeType: null,
            displayPayload: null,
            failureCode: "WHATSAPP_WEBHOOK_UNSUPPORTED_EVENT",
          });
        }
        return;
      }

      items.push({
        eventType: eventTypeForField(field),
        providerEventKey: fallbackKey,
        wabaId,
        phoneNumberId,
        providerMessageId: null,
        customerWaId: null,
        customerDisplayName: null,
        occurredAt: null,
        messageType: field || null,
        textBody: null,
        providerMediaId: null,
        caption: null,
        mediaFilename: null,
        mediaMimeType: null,
        displayPayload: null,
        failureCode: field ? null : "WHATSAPP_WEBHOOK_UNSUPPORTED_EVENT",
      });
    });
  });

  return items;
}
