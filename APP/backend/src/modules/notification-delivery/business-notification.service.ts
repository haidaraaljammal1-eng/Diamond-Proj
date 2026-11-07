import type { Prisma, PrismaClient } from "@prisma/client";
import { runIdempotent } from "src/lib/db/idempotency";
import {
  PUSHOVER_BUSINESS_IDEMPOTENCY_SCOPE,
} from "src/modules/notification-delivery/business-notification.constants";
import {
  loadCarInContext,
  loadCarOutContext,
  loadContractClosedNotificationContext,
  loadMaintenanceContext,
  loadManualExpenseContext,
  loadPaymentContext,
  loadRenewalContext,
  loadRoadLiabilityCollectionContext,
  loadRoadLiabilityContext,
} from "src/modules/notification-delivery/business-notification.context";
import {
  buildCarInMessage,
  buildCarOutMessage,
  buildContractFleetReturnMessage,
  buildMaintenanceCompletedMessage,
  buildMaintenanceStartedMessage,
  buildManualExpenseMessage,
  buildPaymentFailedMessage,
  buildPaymentAuthorizationIncompleteMessage,
  buildPaymentReceivedMessage,
  buildRentalExtendedMessage,
  buildRoadLiabilityCollectedMessage,
  buildRoadLiabilityCollectionFailedMessage,
  buildRoadLiabilityReceivedMessage,
} from "src/modules/notification-delivery/business-notification.messages";
import { notificationService } from "src/modules/notification-delivery/notification.service";
import type { NotificationSendResult } from "src/modules/notification-delivery/notification.types";

type JsonPayload = Record<string, unknown>;

export function createBusinessNotificationService(
  prisma: PrismaClient,
  send = notificationService.send.bind(notificationService),
) {
  async function deliverOnce(
    idempotencyKey: string,
    payload: { title: string; message: string },
  ): Promise<NotificationSendResult | null> {
    try {
      const outcome = await runIdempotent(
        prisma,
        { scope: PUSHOVER_BUSINESS_IDEMPOTENCY_SCOPE, key: idempotencyKey },
        () => send({ ...payload, inAppDedupeKey: idempotencyKey }),
      );
      if (outcome.deduped) return null;
      return outcome.result ?? null;
    } catch {
      return null;
    }
  }

  async function handleOutboxEvent(eventType: string, payload: JsonPayload): Promise<void> {
    switch (eventType) {
      case "payment.confirmed": {
        const paymentId = String(payload.paymentId ?? "");
        const purpose = String(payload.purpose ?? "");
        const ctx = await loadPaymentContext(prisma, paymentId);
        if (!ctx) return;

        if (purpose === "RENTAL") {
          await deliverOnce(`payment.confirmed:${paymentId}`, buildPaymentReceivedMessage({
            contractNumber: ctx.contractNumber,
            vehicleName: ctx.vehicleName,
            actor: ctx.paymentActor,
          }));
          return;
        }

        if (
          purpose === "RECONCILIATION" ||
          purpose === "POST_CLOSE_RECEIVABLE" ||
          purpose === "ROAD_LIABILITY"
        ) {
          const collection = await loadRoadLiabilityCollectionContext(prisma, paymentId);
          if (!collection?.liability) return;
          await deliverOnce(
            `road-liability.collected:${paymentId}`,
            buildRoadLiabilityCollectedMessage({
              contractNumber: collection.contractNumber,
              vehicleName: collection.vehicleName,
              actor: ctx.paymentActor,
            }),
          );
        }
        return;
      }
      case "payment.failed": {
        const paymentId = String(payload.paymentId ?? "");
        const ctx = await loadPaymentContext(prisma, paymentId);
        if (!ctx) return;
        const purpose = ctx.payment.purpose;
        const message = buildPaymentFailedMessage({
          contractNumber: ctx.contractNumber,
          vehicleName: ctx.vehicleName,
          actor: ctx.paymentActor,
        });

        if (
          purpose === "RECONCILIATION" ||
          purpose === "POST_CLOSE_RECEIVABLE" ||
          purpose === "ROAD_LIABILITY"
        ) {
          await deliverOnce(
            `road-liability.collection-failed:${paymentId}`,
            buildRoadLiabilityCollectionFailedMessage({
              contractNumber: ctx.contractNumber,
              vehicleName: ctx.vehicleName,
              actor: ctx.paymentActor,
            }),
          );
          return;
        }

        await deliverOnce(`payment.failed:${paymentId}`, message);
        return;
      }
      case "payment.authorization_incomplete": {
        const paymentId = String(payload.paymentId ?? "");
        const ctx = await loadPaymentContext(prisma, paymentId);
        if (!ctx) return;
        await deliverOnce(
          `payment.authorization_incomplete:${paymentId}`,
          buildPaymentAuthorizationIncompleteMessage({
            contractNumber: ctx.contractNumber,
            vehicleName: ctx.vehicleName,
            actor: ctx.paymentActor,
          }),
        );
        return;
      }
      case "contract.activated": {
        const contractId = String(payload.contractId ?? "");
        const ctx = await loadCarOutContext(prisma, contractId);
        if (!ctx) return;
        await deliverOnce(`contract.activated:${contractId}`, buildCarOutMessage(ctx));
        return;
      }
      case "contract.renewed": {
        const contractId = String(payload.contractId ?? "");
        const renewalId = String(payload.renewalId ?? "");
        const ctx = await loadRenewalContext(prisma, contractId, renewalId || undefined);
        if (!ctx) return;
        await deliverOnce(
          `contract.renewed:${renewalId || contractId}`,
          buildRentalExtendedMessage(ctx),
        );
        return;
      }
      case "contract.return_submitted": {
        const contractId = String(payload.contractId ?? "");
        const ctx = await loadCarInContext(prisma, contractId);
        if (!ctx) return;
        await deliverOnce(`contract.return_submitted:${contractId}`, buildCarInMessage(ctx));
        return;
      }
      case "contract.closed": {
        const contractId = String(payload.contractId ?? "");
        const actorUserId =
          typeof payload.actorUserId === "number"
            ? payload.actorUserId
            : payload.actorUserId != null
              ? Number(payload.actorUserId)
              : null;
        const ctx = await loadContractClosedNotificationContext(
          prisma,
          contractId,
          Number.isFinite(actorUserId) ? actorUserId : null,
        );
        if (!ctx) return;
        await deliverOnce(`contract.closed:${contractId}`, buildContractFleetReturnMessage(ctx));
        return;
      }
      case "road_liability.received": {
        const liabilityId = String(payload.liabilityId ?? "");
        const ctx = await loadRoadLiabilityContext(prisma, liabilityId);
        if (!ctx) return;
        await deliverOnce(`road_liability.received:${liabilityId}`, buildRoadLiabilityReceivedMessage({
          liabilityType: ctx.liabilityType,
          contractNumber: ctx.contractNumber,
          vehicleName: ctx.vehicleName,
          staffActor: ctx.staffActor ?? undefined,
        }));
        return;
      }
      case "maintenance.started": {
        const maintenanceOrderId = Number(payload.maintenanceOrderId);
        const ctx = await loadMaintenanceContext(prisma, maintenanceOrderId);
        if (!ctx) return;
        await deliverOnce(`maintenance.started:${maintenanceOrderId}`, buildMaintenanceStartedMessage({
          vehicleName: ctx.vehicleName,
          actor: ctx.actor,
        }));
        return;
      }
      case "maintenance.completed": {
        const maintenanceOrderId = Number(payload.maintenanceOrderId);
        const ctx = await loadMaintenanceContext(prisma, maintenanceOrderId);
        if (!ctx) return;
        await deliverOnce(`maintenance.completed:${maintenanceOrderId}`, buildMaintenanceCompletedMessage({
          vehicleName: ctx.vehicleName,
          actor: ctx.actor,
        }));
        return;
      }
      case "manual_expense.created": {
        const expenseId = String(payload.expenseId ?? "");
        const ctx = await loadManualExpenseContext(prisma, expenseId);
        if (!ctx) return;
        await deliverOnce(`manual-expense.created:${expenseId}`, buildManualExpenseMessage(ctx));
      }
    }
  }

  return { deliverOnce, handleOutboxEvent };
}

export type BusinessNotificationService = ReturnType<typeof createBusinessNotificationService>;

export function parseOutboxPayload(payload: Prisma.JsonValue | null): JsonPayload {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as JsonPayload;
  }
  return {};
}
