import type { PrismaClient, WhatsAppConnectionStatus } from "@prisma/client";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { withTransaction } from "src/lib/db/transaction";
import { generateOpaqueToken } from "src/lib/security/tokens";
import type { AuditContext } from "src/types/fastify";
import { env } from "src/config/env";
import {
  WHATSAPP_AUDIT,
  WHATSAPP_CONNECTION_LOCK_NS,
  WHATSAPP_CURRENT_STATUSES,
  WHATSAPP_OFFICE_LOCK_ID,
} from "src/modules/whatsapp/whatsapp.constants";
import { encryptWhatsAppCredential } from "src/modules/whatsapp/whatsapp.credentials";
import { whatsappError } from "src/modules/whatsapp/whatsapp.errors";
import { toConnectionDto } from "src/modules/whatsapp/whatsapp.mapper";
import { writeWhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime-outbox";
import { publishWhatsAppRealtime } from "src/modules/whatsapp/whatsapp.realtime-publisher";
import type { WhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime";
import type { WhatsAppProvider } from "src/modules/whatsapp/whatsapp.types";
import {
  diamondWhapiWebhookUrl,
  publicWebhookUrlRequired,
  whapiReportedChannelMatches,
  whapiRuntimeConfig,
} from "src/modules/whatsapp/whapi.config";
import { encodeWhapiWebhookMaterial } from "src/modules/whatsapp/whapi.webhook-material";

type AuditWrite = (partial: Partial<AuditContext>) => void;

const CURRENT_STATUSES: WhatsAppConnectionStatus[] = [...WHATSAPP_CURRENT_STATUSES];

const CONNECTION_PUBLIC = {
  id: true,
  status: true,
  provider: true,
  wabaId: true,
  phoneNumberId: true,
  displayPhoneNumber: true,
  verifiedName: true,
  businessAccountName: true,
  connectedAt: true,
  lastValidatedAt: true,
  webhookStatus: true,
  lastWebhookAt: true,
  providerSessionStatus: true,
  connectedBy: { select: { id: true, name: true } },
} as const;

/**
 * P3 entry. Contacts, groups, and history import stay out of channel cutover.
 * A later stage can subscribe here without changing the activation transaction.
 */
export const WHAPI_DEFERRED_SYNC_STAGES = ["contacts", "groups", "history"] as const;

export function whapiDeferredSyncPlan(connectionId: string): {
  connectionId: string;
  scheduled: false;
  stages: readonly string[];
} {
  return { connectionId, scheduled: false, stages: WHAPI_DEFERRED_SYNC_STAGES };
}

/**
 * Validate a Whapi token and channel, register the Diamond webhook, then
 * activate that connection. A failed webhook registration leaves the previous
 * Whapi session suspended and does not resume it.
 */
export async function configureWhapiOfficeConnection(
  prisma: PrismaClient,
  input: {
    userId: number;
    token: string;
    channelId: string;
    audit: AuditWrite;
    provider: WhatsAppProvider;
  },
) {
  if (env.WHATSAPP_PROVIDER !== "WHAPI") throw whatsappError.providerNotConfigured();
  if (!input.provider.configured) throw whatsappError.providerNotConfigured();

  const token = input.token.trim();
  const channelId = input.channelId.trim();
  const session = await input.provider.getSession(token);
  if (!session.ok) throw whatsappError.validationFailed(session.providerErrorCode);
  if (session.value.status !== "AUTHENTICATED") throw whatsappError.providerNotAuthenticated();

  const identity = await input.provider.getInstanceIdentity(token);
  if (!identity.ok) throw whatsappError.validationFailed(identity.providerErrorCode);
  if (!whapiReportedChannelMatches(channelId, identity.value)) {
    throw whatsappError.whapiChannelMismatch();
  }
  if (publicWebhookUrlRequired()) throw whatsappError.publicWebhookUrlRequired();

  const callbackKey = generateOpaqueToken();
  const webhookSecret = generateOpaqueToken();
  const webhookUrl = diamondWhapiWebhookUrl(callbackKey);
  if (!webhookUrl) throw whatsappError.publicWebhookUrlRequired();

  await suspendCurrentWhapi(prisma);

  const applied = await input.provider.applyWebhookSettings(
    token,
    {
      sendDelay: 0,
      sendDelayMax: 0,
      webhookUrl,
      webhookMessageReceived: true,
      webhookMessageCreate: true,
      webhookMessageAck: true,
      webhookMessageDownloadMedia: false,
    },
    { webhookSecret, force: true },
  );
  const verified =
    applied.ok &&
    applied.value.webhookUrl === webhookUrl &&
    applied.value.webhookMessageReceived &&
    applied.value.webhookMessageAck &&
    applied.value.webhookMessageDownloadMedia === false;
  if (!verified) throw whatsappError.webhookSetupFailed();

  const cfg = whapiRuntimeConfig();
  const ciphertext = encryptWhatsAppCredential(token);
  const callbackCipher = encryptWhatsAppCredential(
    encodeWhapiWebhookMaterial({ callbackKey, webhookSecret }),
  );
  const now = new Date();

  const promoted = await withTransaction(prisma, async (tx) => {
    await acquireAdvisoryLock(tx, WHATSAPP_CONNECTION_LOCK_NS, WHATSAPP_OFFICE_LOCK_ID);
    const current = await tx.whatsAppConnection.findFirst({
      where: { status: { in: CURRENT_STATUSES } },
    });
    const sameChannel =
      current?.provider === "WHAPI" && current.providerInstanceId === channelId;

    if (sameChannel && current) {
      const updated = await tx.whatsAppConnection.update({
        where: { id: current.id },
        data: {
          status: "LINKED",
          credentialCiphertext: ciphertext,
          providerApiUrl: cfg.apiUrl,
          providerInstanceId: channelId,
          phoneNumberId: null,
          providerSessionStatus: "AUTHENTICATED",
          providerSessionCheckedAt: now,
          webhookCallbackCiphertext: callbackCipher,
          webhookStatus: "ACTIVE",
          displayPhoneNumber: identity.value.displayPhone ?? current.displayPhoneNumber,
          verifiedName: identity.value.displayName ?? current.verifiedName,
          connectedByUserId: input.userId,
          connectedAt: current.connectedAt ?? now,
          lastValidatedAt: now,
          lastProviderErrorCode: null,
        },
        select: CONNECTION_PUBLIC,
      });
      const event = await writeWhatsAppRealtimeEvent(tx, {
        type: "whatsapp.connection.updated",
        dedupeKey: `whatsapp.connection.updated:${updated.id}:LINKED:ACTIVE`,
        connectionId: updated.id,
      });
      return { created: updated, previousId: null as string | null, events: event ? [event] : [] };
    }

    if (current) {
      await tx.whatsAppConnection.update({
        where: { id: current.id },
        data: {
          status: "DISCONNECTED",
          credentialCiphertext: null,
          credentialExpiresAt: null,
          disconnectedAt: now,
          disconnectedByUserId: input.userId,
          webhookStatus: "NOT_CONFIGURED",
          providerSessionStatus: "DISCONNECTED",
        },
      });
    }

    const created = await tx.whatsAppConnection.create({
      data: {
        provider: "WHAPI",
        status: "LINKED",
        providerInstanceId: channelId,
        providerApiUrl: cfg.apiUrl,
        phoneNumberId: null,
        providerSessionStatus: "AUTHENTICATED",
        providerSessionCheckedAt: now,
        webhookCallbackCiphertext: callbackCipher,
        webhookStatus: "ACTIVE",
        displayPhoneNumber: identity.value.displayPhone,
        verifiedName: identity.value.displayName,
        credentialCiphertext: ciphertext,
        connectedByUserId: input.userId,
        connectedAt: now,
        lastValidatedAt: now,
      },
      select: CONNECTION_PUBLIC,
    });
    const events: WhatsAppRealtimeEvent[] = [];
    if (current) {
      const previousEvent = await writeWhatsAppRealtimeEvent(tx, {
        type: "whatsapp.connection.updated",
        dedupeKey: `whatsapp.connection.updated:${current.id}:DISCONNECTED`,
        connectionId: current.id,
      });
      if (previousEvent) events.push(previousEvent);
    }
    const createdEvent = await writeWhatsAppRealtimeEvent(tx, {
      type: "whatsapp.connection.updated",
      dedupeKey: `whatsapp.connection.updated:${created.id}:LINKED:ACTIVE`,
      connectionId: created.id,
    });
    if (createdEvent) events.push(createdEvent);
    return { created, previousId: current?.id ?? null, events };
  });

  publishWhatsAppRealtime(promoted.events);
  void whapiDeferredSyncPlan(promoted.created.id);
  input.audit({
    action: promoted.previousId ? WHATSAPP_AUDIT.CONNECTION_CHANGED : WHATSAPP_AUDIT.CONNECTION_LINKED,
    entityType: "WhatsAppConnection",
    entityId: promoted.created.id,
    metadata: {
      connectionId: promoted.created.id,
      previousConnectionId: promoted.previousId,
      provider: "WHAPI",
      providerInstanceId: channelId,
      status: "LINKED",
      webhookStatus: "ACTIVE",
    },
  });
  return toConnectionDto(promoted.created, input.provider.capabilities());
}

async function suspendCurrentWhapi(prisma: PrismaClient): Promise<void> {
  const suspended = await withTransaction(prisma, async (tx) => {
    await acquireAdvisoryLock(tx, WHATSAPP_CONNECTION_LOCK_NS, WHATSAPP_OFFICE_LOCK_ID);
    const current = await tx.whatsAppConnection.findFirst({
      where: { status: { in: CURRENT_STATUSES }, provider: "WHAPI" },
      select: { id: true, providerSessionStatus: true },
    });
    if (!current || current.providerSessionStatus === "STANDBY") {
      return null;
    }
    const row = await tx.whatsAppConnection.update({
      where: { id: current.id },
      data: { providerSessionStatus: "STANDBY", providerSessionCheckedAt: new Date() },
      select: { id: true },
    });
    const event = await writeWhatsAppRealtimeEvent(tx, {
      type: "whatsapp.connection.updated",
      dedupeKey: `whatsapp.connection.updated:${row.id}:STANDBY`,
      connectionId: row.id,
    });
    return { events: event ? [event] : [], connectionId: row.id };
  });
  if (!suspended) return;
  publishWhatsAppRealtime(suspended.events);
}
