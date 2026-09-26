import type { Prisma, PrismaClient } from "@prisma/client";
import { runIdempotent } from "src/lib/db/idempotency";
import {
  PUSHOVER_BUSINESS_IDEMPOTENCY_SCOPE,
} from "src/modules/notification-delivery/business-notification.constants";
import {
  loadCarInContext,
  loadCarOutContext,
  loadContractBasics,
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
  buildContractSignedMessage,
  buildMaintenanceCompletedMessage,
  buildMaintenanceStartedMessage,
  buildManualExpenseMessage,
  buildPaymentFailedMessage,
  buildPaymentReceivedMessage,
  buildRentalExtendedMessage,
  buildRoadLiabilityCollectedMessage,
  buildRoadLiabilityCollectionFailedMessage,
  buildRoadLiabilityReceivedMessage,
} from "src/modules/notification-delivery/business-notification.messages";
import { notificationService } from "src/modules/notification-delivery/notification.service";
import type { NotificationSendResult } from "src/modules/notification-delivery/notification.types";

type JsonPayload = Record<string, unknown>;

function purposeLabel(purpose: string): string {
  switch (purpose) {
    case "RENTAL":
      return "Rental payment";
    case "RENEWAL":
      return "Renewal payment";
    case "RECONCILIATION":
      return "Road liability collection";
    case "POST_CLOSE_RECEIVABLE":
      return "Post-close road liability collection";
    case "ROAD_LIABILITY":
      return "Road liability collection";
    default:
      return purpose;
  }
}

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
        () => send(payload),
      );
      if (outcome.deduped) return null;
      return outcome.result ?? null;
    } catch {
      return null;
    }
  }

  async function handleOutboxEvent(eventType: string, payload: JsonPayload): Promise<void> {
    switch (eventType) {
      case "contract.signed": {
        const contractId = String(payload.contractId ?? "");
        const contract = await loadContractBasics(prisma, contractId);
        if (!contract) return;
        await deliverOnce(`contract.signed:${contractId}`, buildContractSignedMessage({
          ...contract,
          actor: { label: "Customer" },
          occurredAt: contract.acceptedAt,
        }));
        return;
      }
      case "payment.confirmed": {
        const paymentId = String(payload.paymentId ?? "");
        const purpose = String(payload.purpose ?? "");
        const ctx = await loadPaymentContext(prisma, paymentId);
        if (!ctx) return;

        if (purpose === "RENTAL") {
          await deliverOnce(`payment.confirmed:${paymentId}`, buildPaymentReceivedMessage({
            contractNumber: ctx.contractNumber,
            customerName: ctx.customerName,
            vehicleName: ctx.vehicleName,
            amount: ctx.payment.amount,
            currency: ctx.payment.currency,
            paymentSource: ctx.paymentSource,
            occurredAt: ctx.payment.confirmedAt ?? new Date(),
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
              vehicleName: collection.vehicleName,
              customerName: collection.customerName,
              contractNumber: collection.contractNumber,
              reference: collection.liability.reference,
              officialAmount: collection.liability.officialAmount,
              adminFee: collection.liability.adminFee,
              totalCollected: collection.liability.totalCollected,
              currency: collection.currency,
              collectionChannel: collection.collectionChannel,
              occurredAt: collection.occurredAt,
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
          customerName: ctx.customerName,
          vehicleName: ctx.vehicleName,
          amount: ctx.payment.amount,
          currency: ctx.payment.currency,
          purposeLabel: purposeLabel(purpose),
          occurredAt: ctx.payment.failedAt ?? new Date(),
        });

        if (
          purpose === "RECONCILIATION" ||
          purpose === "POST_CLOSE_RECEIVABLE" ||
          purpose === "ROAD_LIABILITY"
        ) {
          const collection = await loadRoadLiabilityCollectionContext(prisma, paymentId);
          await deliverOnce(
            `road-liability.collection-failed:${paymentId}`,
            buildRoadLiabilityCollectionFailedMessage({
              contractNumber: ctx.contractNumber,
              customerName: ctx.customerName,
              vehicleName: ctx.vehicleName,
              reference: collection?.liability?.reference ?? null,
              amount: ctx.payment.amount,
              currency: ctx.payment.currency,
              purposeLabel: purposeLabel(purpose),
              occurredAt: ctx.payment.failedAt ?? new Date(),
            }),
          );
          return;
        }

        await deliverOnce(`payment.failed:${paymentId}`, message);
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
      case "road_liability.chargeable": {
        const liabilityId = String(payload.liabilityId ?? "");
        const ctx = await loadRoadLiabilityContext(prisma, liabilityId);
        if (!ctx) return;
        await deliverOnce(`road-liability.received:${liabilityId}`, buildRoadLiabilityReceivedMessage(ctx));
        return;
      }
      case "maintenance.started": {
        const maintenanceOrderId = Number(payload.maintenanceOrderId);
        const ctx = await loadMaintenanceContext(prisma, maintenanceOrderId);
        if (!ctx) return;
        await deliverOnce(`maintenance.started:${maintenanceOrderId}`, buildMaintenanceStartedMessage({
          vehicleName: ctx.vehicleName,
          orderReference: ctx.orderReference,
          actor: ctx.actor,
          occurredAt: ctx.occurredAt,
        }));
        return;
      }
      case "maintenance.completed": {
        const maintenanceOrderId = Number(payload.maintenanceOrderId);
        const ctx = await loadMaintenanceContext(prisma, maintenanceOrderId);
        if (!ctx) return;
        await deliverOnce(`maintenance.completed:${maintenanceOrderId}`, buildMaintenanceCompletedMessage({
          vehicleName: ctx.vehicleName,
          orderReference: ctx.orderReference,
          actualCost: ctx.actualCost,
          currency: ctx.currency,
          actor: ctx.actor,
          occurredAt: ctx.occurredAt,
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
