import type { FastifyInstance } from "fastify";
import type { Prisma, WhatsAppConnectionAttempt, WhatsAppConnectionStatus } from "@prisma/client";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { withTransaction } from "src/lib/db/transaction";
import { expiryFromNow, generateOpaqueToken, hashToken, isExpired } from "src/lib/security/tokens";
import type { AuditContext } from "src/types/fastify";
import {
  WHATSAPP_AUDIT,
  WHATSAPP_CONNECTION_ATTEMPT_TTL_SECONDS,
  WHATSAPP_CONNECTION_LOCK_NS,
  WHATSAPP_CURRENT_STATUSES,
  WHATSAPP_OFFICE_LOCK_ID,
  WHATSAPP_PROVIDER,
} from "src/modules/whatsapp/whatsapp.constants";
import {
  isWhatsAppWebhookConfigured,
  whatsappFrontendBootstrap,
} from "src/modules/whatsapp/whatsapp.config";
import {
  decryptWhatsAppCredential,
  encryptWhatsAppCredential,
  hashesEqual,
} from "src/modules/whatsapp/whatsapp.credentials";
import { WhatsAppErrorReason, whatsappError } from "src/modules/whatsapp/whatsapp.errors";
import { findGrantedPhone, grantHasWaba, parseGrantMetadata } from "src/modules/whatsapp/whatsapp.grant";
import { toConnectionDto, toSelectableChoices } from "src/modules/whatsapp/whatsapp.mapper";
import { writeWhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime-outbox";
import { publishWhatsAppRealtime } from "src/modules/whatsapp/whatsapp.realtime-publisher";
import type { WhatsAppRealtimeEvent } from "src/modules/whatsapp/whatsapp.realtime";
import { createWhatsAppProvider } from "src/modules/whatsapp/whatsapp.provider";
import type { WhatsAppAuthorizeBody, WhatsAppSelectBody } from "src/modules/whatsapp/whatsapp.schema";
import type {
  WhatsAppGrantMetadata,
  WhatsAppProviderFailure,
  WhatsAppProviderResult,
} from "src/modules/whatsapp/whatsapp.types";
import {
  diamondUltraMsgWebhookUrl,
  publicWebhookUrlRequired,
  ultramsgRuntimeConfig,
} from "src/modules/whatsapp/ultramsg.config";
import { env } from "src/config/env";

type AuditWrite = (partial: Partial<AuditContext>) => void;

const CURRENT_STATUSES: WhatsAppConnectionStatus[] = [...WHATSAPP_CURRENT_STATUSES];
const CURRENT_WHERE = { status: { in: CURRENT_STATUSES } };

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

function mapProviderFailure(failure: WhatsAppProviderFailure) {
  const extra = failure.providerErrorCode;
  const trace = failure.fbtraceId ? { providerTraceId: failure.fbtraceId } : undefined;
  switch (failure.code) {
    case "NOT_CONFIGURED":
      return whatsappError.providerNotConfigured();
    case "AUTH_FAILED":
      return whatsappError.providerAuthFailed(extra);
    case "WABA_NOT_GRANTED":
      return whatsappError.wabaNotGranted();
    case "PHONE_NOT_GRANTED":
      return whatsappError.phoneNotGranted();
    default:
      return whatsappError.validationFailed(extra);
  }
}

function unwrap<T>(result: WhatsAppProviderResult<T>): T {
  if (!result.ok) throw mapProviderFailure(result);
  return result.value;
}

function requireProvider() {
  const provider = createWhatsAppProvider();
  if (!provider.configured) throw whatsappError.providerNotConfigured();
  return provider;
}

export function createWhatsAppConnectionService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function getConnection() {
    const row = await prisma.whatsAppConnection.findFirst({
      where: CURRENT_WHERE,
      select: { ...CONNECTION_PUBLIC, credentialCiphertext: true },
    });
    const provider = createWhatsAppProvider();
    if (
      row?.credentialCiphertext &&
      provider.configured &&
      provider.capabilities().supportsQrAuthentication
    ) {
      await refreshUltraMsgSession(row.id, row.credentialCiphertext);
      const fresh = await prisma.whatsAppConnection.findFirst({
        where: { id: row.id },
        select: CONNECTION_PUBLIC,
      });
      return toConnectionDto(fresh, provider.capabilities());
    }
    return toConnectionDto(row, provider.capabilities());
  }

  async function refreshUltraMsgSession(connectionId: string, credentialCiphertext: string) {
    const provider = createWhatsAppProvider();
    let token: string;
    try {
      token = decryptWhatsAppCredential(credentialCiphertext);
    } catch {
      return;
    }
    const session = await provider.getSession(token);
    const identity = session.ok ? await provider.getInstanceIdentity(token) : null;
    await prisma.whatsAppConnection.update({
      where: { id: connectionId },
      data: {
        providerSessionStatus: session.ok ? session.value.status : "UNKNOWN",
        providerSessionCheckedAt: new Date(),
        lastValidatedAt: new Date(),
        ...(identity?.ok
          ? {
              displayPhoneNumber: identity.value.displayPhone,
              verifiedName: identity.value.displayName,
            }
          : {}),
      },
    });
  }

  async function startAttempt(userId: number, audit: AuditWrite) {
    const provider = requireProvider();
    if (!provider.capabilities().supportsEmbeddedSignup) {
      throw whatsappError.embeddedSignupNotConfigured();
    }
    const state = generateOpaqueToken();
    const expiresAt = expiryFromNow(WHATSAPP_CONNECTION_ATTEMPT_TTL_SECONDS);
    const attempt = await prisma.whatsAppConnectionAttempt.create({
      data: {
        initiatedByUserId: userId,
        status: "PENDING",
        stateNonceHash: hashToken(state),
        expiresAt,
      },
    });
    audit({
      action: WHATSAPP_AUDIT.ATTEMPT_STARTED,
      entityType: "WhatsAppConnectionAttempt",
      entityId: attempt.id,
      metadata: { attemptId: attempt.id, expiresAt: expiresAt.toISOString() },
    });
    return {
      attemptId: attempt.id,
      state,
      expiresAt,
      provider: WHATSAPP_PROVIDER,
      bootstrap: whatsappFrontendBootstrap(),
    };
  }

  async function loadOwnedAttempt(id: string, userId: number): Promise<WhatsAppConnectionAttempt> {
    const attempt = await prisma.whatsAppConnectionAttempt.findUnique({ where: { id } });
    if (!attempt || attempt.initiatedByUserId !== userId) {
      throw whatsappError.attemptNotFound();
    }
    return attempt;
  }

  async function markAttemptFailed(id: string, lastErrorCode: string) {
    await prisma.whatsAppConnectionAttempt.update({
      where: { id },
      data: { status: "FAILED", lastErrorCode },
    });
  }

  async function authorize(
    userId: number,
    attemptId: string,
    input: WhatsAppAuthorizeBody,
    audit: AuditWrite,
  ) {
    const provider = requireProvider();
    const attempt = await loadOwnedAttempt(attemptId, userId);
    if (attempt.usedAt || ["COMPLETED", "FAILED", "SELECTED", "EXPIRED"].includes(attempt.status)) {
      throw whatsappError.attemptUsed();
    }
    if (isExpired(attempt.expiresAt) || attempt.status === "EXPIRED") {
      if (attempt.status !== "EXPIRED") {
        await prisma.whatsAppConnectionAttempt.update({
          where: { id: attempt.id },
          data: { status: "EXPIRED" },
        });
      }
      throw whatsappError.attemptExpired();
    }
    if (attempt.status !== "PENDING") throw whatsappError.attemptUsed();
    if (!hashesEqual(attempt.stateNonceHash, hashToken(input.state))) {
      throw whatsappError.attemptNotFound();
    }

    try {
      const credential = unwrap(await provider.exchangeAuthorizationCode(input.authorizationCode));
      const inspected = unwrap(await provider.inspectGrantedBusinessAccess(credential.accessToken));
      if (!inspected.isValid) throw whatsappError.providerAuthFailed();
      if (inspected.wabaIds.length === 0) throw whatsappError.wabaNotGranted();

      const wabas = unwrap(
        await provider.listGrantedWhatsAppBusinessAccounts(
          credential.accessToken,
          inspected.wabaIds,
        ),
      );
      const phones = [];
      for (const waba of wabas) {
        const listed = unwrap(
          await provider.listGrantedPhoneNumbers(credential.accessToken, waba.wabaId),
        );
        phones.push(...listed);
      }
      if (phones.length === 0) throw whatsappError.phoneNotGranted();

      const grant: WhatsAppGrantMetadata = { wabas, phones };
      const ciphertext = encryptWhatsAppCredential(credential.accessToken);
      await prisma.whatsAppConnectionAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "AUTHORIZED",
          temporaryCredentialCiphertext: ciphertext,
          temporaryCredentialExpiresAt: credential.expiresAt,
          providerGrantMetadata: grant as unknown as Prisma.InputJsonValue,
        },
      });
      audit({
        action: WHATSAPP_AUDIT.PROVIDER_AUTHORIZED,
        entityType: "WhatsAppConnectionAttempt",
        entityId: attempt.id,
        metadata: {
          attemptId: attempt.id,
          wabaCount: wabas.length,
          phoneCount: phones.length,
        },
      });
      return { attemptId: attempt.id, choices: toSelectableChoices(wabas, phones) };
    } catch (err) {
      const reason =
        err && typeof err === "object" && "context" in err
          ? String((err as { context?: { reason?: string } }).context?.reason ?? WhatsAppErrorReason.PROVIDER_AUTH_FAILED)
          : WhatsAppErrorReason.PROVIDER_AUTH_FAILED;
      await markAttemptFailed(attempt.id, reason);
      audit({
        action: WHATSAPP_AUDIT.CONNECTION_FAILED,
        entityType: "WhatsAppConnectionAttempt",
        entityId: attempt.id,
        metadata: { attemptId: attempt.id, reason },
      });
      throw err;
    }
  }

  async function select(
    userId: number,
    attemptId: string,
    input: WhatsAppSelectBody,
    audit: AuditWrite,
  ) {
    const provider = requireProvider();
    const attempt = await loadOwnedAttempt(attemptId, userId);
    if (attempt.usedAt || attempt.status === "COMPLETED" || attempt.status === "FAILED") {
      throw whatsappError.attemptUsed();
    }
    if (isExpired(attempt.expiresAt) || attempt.status === "EXPIRED") {
      throw whatsappError.attemptExpired();
    }
    if (attempt.status !== "AUTHORIZED") throw whatsappError.attemptUsed();

    const grant = parseGrantMetadata(attempt.providerGrantMetadata);
    if (!grant) throw whatsappError.validationFailed();
    if (!grantHasWaba(grant, input.wabaId)) throw whatsappError.wabaNotGranted();
    const grantedPhone = findGrantedPhone(grant, input.wabaId, input.phoneNumberId);
    if (!grantedPhone) throw whatsappError.phoneNotGranted();
    if (!attempt.temporaryCredentialCiphertext) throw whatsappError.validationFailed();

    let accessToken: string;
    try {
      accessToken = decryptWhatsAppCredential(attempt.temporaryCredentialCiphertext);
    } catch {
      throw whatsappError.validationFailed();
    }

    let validated;
    try {
      unwrap(await provider.validateCredential(accessToken));
      validated = unwrap(
        await provider.validatePhoneNumberAccess(
          accessToken,
          input.wabaId,
          input.phoneNumberId,
        ),
      );
    } catch (err) {
      const reason =
        err && typeof err === "object" && "context" in err
          ? String(
              (err as { context?: { reason?: string } }).context?.reason ??
                WhatsAppErrorReason.CONNECTION_VALIDATION_FAILED,
            )
          : WhatsAppErrorReason.CONNECTION_VALIDATION_FAILED;
      audit({
        action: WHATSAPP_AUDIT.CONNECTION_FAILED,
        entityType: "WhatsAppConnectionAttempt",
        entityId: attempt.id,
        metadata: { attemptId: attempt.id, reason },
      });
      throw err;
    }

    const ciphertext = encryptWhatsAppCredential(accessToken);
    const businessName =
      grant.wabas.find((w) => w.wabaId === validated.wabaId)?.businessName ?? null;

    const promoted = await withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, WHATSAPP_CONNECTION_LOCK_NS, WHATSAPP_OFFICE_LOCK_ID);
      const fresh = await tx.whatsAppConnectionAttempt.findUnique({ where: { id: attempt.id } });
      if (!fresh || fresh.initiatedByUserId !== userId) throw whatsappError.attemptNotFound();
      if (fresh.usedAt || fresh.status === "COMPLETED") throw whatsappError.attemptUsed();
      if (fresh.status !== "AUTHORIZED") throw whatsappError.alreadyChanged();
      if (isExpired(fresh.expiresAt)) throw whatsappError.attemptExpired();

      const current = await tx.whatsAppConnection.findFirst({ where: CURRENT_WHERE });
      if (current) {
        await tx.whatsAppConnection.update({
          where: { id: current.id },
          data: {
            status: "DISCONNECTED",
            credentialCiphertext: null,
            credentialExpiresAt: null,
            disconnectedAt: new Date(),
            disconnectedByUserId: userId,
            webhookStatus: "NOT_CONFIGURED",
          },
        });
      }

      const created = await tx.whatsAppConnection.create({
        data: {
          provider: "META_CLOUD_API",
          status: "LINKED",
          wabaId: validated.wabaId,
          phoneNumberId: validated.phoneNumberId,
          displayPhoneNumber: validated.displayPhoneNumber,
          verifiedName: validated.verifiedName,
          businessAccountName: businessName,
          credentialCiphertext: ciphertext,
          credentialExpiresAt: fresh.temporaryCredentialExpiresAt,
          connectedByUserId: userId,
          connectedAt: new Date(),
          lastValidatedAt: new Date(),
          webhookStatus: isWhatsAppWebhookConfigured() ? "PENDING" : "NOT_CONFIGURED",
        },
        select: CONNECTION_PUBLIC,
      });

      await tx.whatsAppConnectionAttempt.update({
        where: { id: fresh.id },
        data: {
          status: "COMPLETED",
          usedAt: new Date(),
          temporaryCredentialCiphertext: null,
          temporaryCredentialExpiresAt: null,
        },
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
        dedupeKey: `whatsapp.connection.updated:${created.id}:${created.status}:${created.webhookStatus}`,
        connectionId: created.id,
      });
      if (createdEvent) events.push(createdEvent);

      return {
        created,
        previousId: current?.id ?? null,
        previousPhone: current?.displayPhoneNumber ?? null,
        events,
      };
    });

    publishWhatsAppRealtime(promoted.events);

    audit({
      action: promoted.previousId ? WHATSAPP_AUDIT.CONNECTION_CHANGED : WHATSAPP_AUDIT.CONNECTION_LINKED,
      entityType: "WhatsAppConnection",
      entityId: promoted.created.id,
      metadata: {
        connectionId: promoted.created.id,
        previousConnectionId: promoted.previousId,
        wabaId: validated.wabaId,
        displayPhoneNumber: validated.displayPhoneNumber,
        status: "LINKED",
      },
    });
    return toConnectionDto(promoted.created);
  }

  async function disconnect(userId: number, audit: AuditWrite) {
    const result = await withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, WHATSAPP_CONNECTION_LOCK_NS, WHATSAPP_OFFICE_LOCK_ID);
      const current = await tx.whatsAppConnection.findFirst({ where: CURRENT_WHERE });
      if (!current) throw whatsappError.connectionNotFound();
      const updated = await tx.whatsAppConnection.update({
        where: { id: current.id },
        data: {
          status: "DISCONNECTED",
          credentialCiphertext: null,
          credentialExpiresAt: null,
          disconnectedAt: new Date(),
          disconnectedByUserId: userId,
          webhookStatus: "NOT_CONFIGURED",
        },
        select: CONNECTION_PUBLIC,
      });
      const event = await writeWhatsAppRealtimeEvent(tx, {
        type: "whatsapp.connection.updated",
        dedupeKey: `whatsapp.connection.updated:${updated.id}:DISCONNECTED`,
        connectionId: updated.id,
      });
      return {
        updated,
        previousStatus: current.status,
        displayPhoneNumber: current.displayPhoneNumber,
        wabaId: current.wabaId,
        events: event ? [event] : [],
      };
    });
    publishWhatsAppRealtime(result.events);
    audit({
      action: WHATSAPP_AUDIT.CONNECTION_DISCONNECTED,
      entityType: "WhatsAppConnection",
      entityId: result.updated.id,
      metadata: {
        connectionId: result.updated.id,
        wabaId: result.wabaId,
        displayPhoneNumber: result.displayPhoneNumber,
        fromStatus: result.previousStatus,
        toStatus: "DISCONNECTED",
      },
    });
    return toConnectionDto(null);
  }

  async function activateWebhook(userId: number, audit: AuditWrite) {
    const provider = createWhatsAppProvider();
    if (provider.capabilities().supportsQrAuthentication) {
      return activateUltraMsgWebhook(userId, audit);
    }
    const current = await prisma.whatsAppConnection.findFirst({
      where: CURRENT_WHERE,
      select: {
        id: true,
        status: true,
        wabaId: true,
        credentialCiphertext: true,
        webhookStatus: true,
      },
    });
    if (!current || current.status !== "LINKED" || !current.wabaId || !current.credentialCiphertext) {
      throw whatsappError.connectionNotFound();
    }
    if (!provider.configured) {
      await prisma.whatsAppConnection.update({
        where: { id: current.id },
        data: { webhookStatus: "ERROR", lastProviderErrorCode: WhatsAppErrorReason.PROVIDER_NOT_CONFIGURED },
      });
      throw whatsappError.providerNotConfigured();
    }
    let accessToken: string;
    try {
      accessToken = decryptWhatsAppCredential(current.credentialCiphertext);
    } catch {
      throw whatsappError.sendAuthFailed();
    }
    const subscribed = await provider.subscribeWaba(accessToken, current.wabaId);
    if (!subscribed.ok) {
      const updated = await prisma.whatsAppConnection.update({
        where: { id: current.id },
        data: {
          webhookStatus: "ERROR",
          lastProviderErrorCode: subscribed.providerErrorCode ?? subscribed.code,
        },
        select: CONNECTION_PUBLIC,
      });
      if (subscribed.code === "NOT_CONFIGURED") throw whatsappError.providerNotConfigured();
      throw whatsappError.validationFailed(subscribed.providerErrorCode);
    }
    const status = await provider.getWebhookSubscriptionStatus(accessToken, current.wabaId);
    const active = status.ok && status.value.subscribed === true;
    const updated = await withTransaction(prisma, async (tx) => {
      const row = await tx.whatsAppConnection.update({
        where: { id: current.id },
        data: {
          webhookStatus: active ? "ACTIVE" : "ERROR",
          lastProviderErrorCode: active ? null : "WHATSAPP_WEBHOOK_NOT_ACTIVE",
        },
        select: CONNECTION_PUBLIC,
      });
      const event = await writeWhatsAppRealtimeEvent(tx, {
        type: "whatsapp.connection.updated",
        dedupeKey: `whatsapp.connection.updated:${row.id}:${row.webhookStatus}`,
        connectionId: row.id,
      });
      return { row, events: event ? [event] : [] };
    });
    publishWhatsAppRealtime(updated.events);
    audit({
      action: WHATSAPP_AUDIT.WEBHOOK_ACTIVATED,
      entityType: "WhatsAppConnection",
      entityId: updated.row.id,
      metadata: {
        connectionId: updated.row.id,
        webhookStatus: updated.row.webhookStatus,
        actorUserId: userId,
      },
    });
    if (!active) throw whatsappError.webhookNotActive();
    return toConnectionDto(updated.row);
  }

  async function bootstrap(userId: number, audit: AuditWrite) {
    const provider = requireProvider();
    if (!provider.capabilities().supportsQrAuthentication) {
      throw whatsappError.providerNotConfigured();
    }
    const cfg = ultramsgRuntimeConfig();
    if (!cfg.token) throw whatsappError.providerNotConfigured();
    const session = await provider.getSession(cfg.token);
    if (!session.ok) throw whatsappError.validationFailed(session.providerErrorCode);
    const identity = await provider.getInstanceIdentity(cfg.token);
    const ciphertext = encryptWhatsAppCredential(cfg.token);
    const callbackKey = cfg.webhookCallbackKey || generateOpaqueToken();
    const callbackCipher = encryptWhatsAppCredential(callbackKey);

    const promoted = await withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, WHATSAPP_CONNECTION_LOCK_NS, WHATSAPP_OFFICE_LOCK_ID);
      const current = await tx.whatsAppConnection.findFirst({ where: CURRENT_WHERE });
      if (
        current &&
        current.provider === "ULTRAMSG" &&
        current.providerInstanceId === cfg.instanceId
      ) {
        const updated = await tx.whatsAppConnection.update({
          where: { id: current.id },
          data: {
            status: "LINKED",
            credentialCiphertext: ciphertext,
            providerApiUrl: cfg.apiUrl,
            providerInstanceId: cfg.instanceId,
            providerSessionStatus: session.value.status,
            providerSessionCheckedAt: new Date(),
            webhookCallbackCiphertext: callbackCipher,
            displayPhoneNumber: identity.ok ? identity.value.displayPhone : current.displayPhoneNumber,
            verifiedName: identity.ok ? identity.value.displayName : current.verifiedName,
            connectedByUserId: userId,
            connectedAt: current.connectedAt ?? new Date(),
            lastValidatedAt: new Date(),
            lastProviderErrorCode: null,
          },
          select: CONNECTION_PUBLIC,
        });
        const event = await writeWhatsAppRealtimeEvent(tx, {
          type: "whatsapp.connection.updated",
          dedupeKey: `whatsapp.connection.updated:${updated.id}:${updated.status}:${session.value.status}`,
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
            disconnectedAt: new Date(),
            disconnectedByUserId: userId,
            webhookStatus: "NOT_CONFIGURED",
          },
        });
      }

      const created = await tx.whatsAppConnection.create({
        data: {
          provider: "ULTRAMSG",
          status: "LINKED",
          providerInstanceId: cfg.instanceId,
          providerApiUrl: cfg.apiUrl,
          providerSessionStatus: session.value.status,
          providerSessionCheckedAt: new Date(),
          webhookCallbackCiphertext: callbackCipher,
          displayPhoneNumber: identity.ok ? identity.value.displayPhone : null,
          verifiedName: identity.ok ? identity.value.displayName : null,
          credentialCiphertext: ciphertext,
          connectedByUserId: userId,
          connectedAt: new Date(),
          lastValidatedAt: new Date(),
          webhookStatus: "NOT_CONFIGURED",
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
        dedupeKey: `whatsapp.connection.updated:${created.id}:${created.status}:${created.webhookStatus}`,
        connectionId: created.id,
      });
      if (createdEvent) events.push(createdEvent);
      return { created, previousId: current?.id ?? null, events };
    });

    publishWhatsAppRealtime(promoted.events);
    audit({
      action: promoted.previousId ? WHATSAPP_AUDIT.CONNECTION_CHANGED : WHATSAPP_AUDIT.CONNECTION_LINKED,
      entityType: "WhatsAppConnection",
      entityId: promoted.created.id,
      metadata: {
        connectionId: promoted.created.id,
        previousConnectionId: promoted.previousId,
        provider: "ULTRAMSG",
        providerInstanceId: cfg.instanceId,
        status: "LINKED",
        providerSessionStatus: session.value.status,
      },
    });
    return toConnectionDto(promoted.created, provider.capabilities());
  }

  async function getQr() {
    const provider = requireProvider();
    if (!provider.capabilities().supportsQrAuthentication) {
      throw whatsappError.qrUnavailable();
    }
    const current = await prisma.whatsAppConnection.findFirst({
      where: CURRENT_WHERE,
      select: { credentialCiphertext: true, providerSessionStatus: true },
    });
    if (!current?.credentialCiphertext) throw whatsappError.connectionNotFound();
    if (current.providerSessionStatus === "AUTHENTICATED") {
      return { imageDataUrl: null, qrCode: null };
    }
    let token: string;
    try {
      token = decryptWhatsAppCredential(current.credentialCiphertext);
    } catch {
      throw whatsappError.sendAuthFailed();
    }
    const qr = await provider.getQr(token);
    if (!qr.ok) throw whatsappError.qrUnavailable();
    return qr.value;
  }

  async function activateUltraMsgWebhook(userId: number, audit: AuditWrite) {
    const current = await prisma.whatsAppConnection.findFirst({
      where: CURRENT_WHERE,
      select: {
        id: true,
        status: true,
        credentialCiphertext: true,
        webhookCallbackCiphertext: true,
      },
    });
    if (!current || current.status !== "LINKED" || !current.credentialCiphertext) {
      throw whatsappError.connectionNotFound();
    }
    if (publicWebhookUrlRequired()) throw whatsappError.publicWebhookUrlRequired();
    if (!env.ULTRAMSG_CONFIGURE_WEBHOOK) throw whatsappError.webhookSetupFailed();

    const provider = createWhatsAppProvider();
    if (!provider.configured) throw whatsappError.providerNotConfigured();
    let token: string;
    try {
      token = decryptWhatsAppCredential(current.credentialCiphertext);
    } catch {
      throw whatsappError.sendAuthFailed();
    }

    let callbackKey = env.ULTRAMSG_WEBHOOK_CALLBACK_KEY.trim();
    if (!callbackKey && current.webhookCallbackCiphertext) {
      try {
        callbackKey = decryptWhatsAppCredential(current.webhookCallbackCiphertext);
      } catch {
        callbackKey = "";
      }
    }
    if (!callbackKey) callbackKey = generateOpaqueToken();
    const webhookUrl = diamondUltraMsgWebhookUrl(callbackKey);
    if (!webhookUrl) throw whatsappError.publicWebhookUrlRequired();

    const existing = await provider.getInstanceSettings(token);
    if (!existing.ok) {
      await prisma.whatsAppConnection.update({
        where: { id: current.id },
        data: {
          webhookStatus: "ERROR",
          lastProviderErrorCode: existing.providerErrorCode ?? existing.code,
        },
      });
      throw whatsappError.webhookSetupFailed();
    }

    const applied = await provider.applyWebhookSettings(token, {
      sendDelay: existing.value.sendDelay,
      sendDelayMax: existing.value.sendDelayMax,
      webhookUrl,
      webhookMessageReceived: true,
      webhookMessageCreate: true,
      webhookMessageAck: true,
      webhookMessageDownloadMedia: true,
    });
    const verified =
      applied.ok &&
      applied.value.webhookUrl === webhookUrl &&
      applied.value.webhookMessageReceived &&
      applied.value.webhookMessageCreate &&
      applied.value.webhookMessageAck &&
      applied.value.webhookMessageDownloadMedia;

    const updated = await withTransaction(prisma, async (tx) => {
      const row = await tx.whatsAppConnection.update({
        where: { id: current.id },
        data: {
          webhookStatus: verified ? "ACTIVE" : "ERROR",
          lastProviderErrorCode: verified ? null : WhatsAppErrorReason.WEBHOOK_SETUP_FAILED,
          webhookCallbackCiphertext: encryptWhatsAppCredential(callbackKey),
        },
        select: CONNECTION_PUBLIC,
      });
      const event = await writeWhatsAppRealtimeEvent(tx, {
        type: "whatsapp.connection.updated",
        dedupeKey: `whatsapp.connection.updated:${row.id}:${row.webhookStatus}`,
        connectionId: row.id,
      });
      return { row, events: event ? [event] : [] };
    });
    publishWhatsAppRealtime(updated.events);
    audit({
      action: WHATSAPP_AUDIT.WEBHOOK_ACTIVATED,
      entityType: "WhatsAppConnection",
      entityId: updated.row.id,
      metadata: {
        connectionId: updated.row.id,
        webhookStatus: updated.row.webhookStatus,
        actorUserId: userId,
      },
    });
    if (!verified) throw whatsappError.webhookSetupFailed();
    return toConnectionDto(updated.row, provider.capabilities());
  }

  return { getConnection, startAttempt, authorize, select, disconnect, activateWebhook, bootstrap, getQr };
}

export type WhatsAppConnectionService = ReturnType<typeof createWhatsAppConnectionService>;
