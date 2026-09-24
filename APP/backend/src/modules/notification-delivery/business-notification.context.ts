import type { PrismaClient } from "@prisma/client";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import type { BusinessActor } from "src/modules/notification-delivery/business-notification.messages";

const CONTRACT_INCLUDE = {
  customer: { select: { name: true } },
  vehicle: { include: { model: { select: { name: true } } } },
  acceptance: { select: { acceptedAt: true } },
  payments: {
    where: { purpose: "RENTAL", status: "CONFIRMED" },
    select: { id: true },
    take: 1,
  },
} as const;

export function summarizeDamageMarks(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "None reported";
  return `${value.length} mark(s)`;
}

export const UNKNOWN_STAFF_ACTOR_LABEL = "Unknown Staff";

export async function loadActorLabel(
  prisma: PrismaClient,
  userId: number | null | undefined,
  fallback: string,
): Promise<BusinessActor> {
  if (!userId) return { label: fallback };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  return { label: user?.name?.trim() || fallback };
}

export async function loadContractBasics(prisma: PrismaClient, contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: CONTRACT_INCLUDE,
  });
  if (!contract) return null;
  return {
    contractNumber: contract.contractNumber,
    customerName: contract.customer?.name ?? "Unknown customer",
    vehicleName: vehicleDisplayName(contract.vehicle),
    amountDue: contract.agreedAmount,
    currency: contract.currency,
    paymentState: contract.payments.length > 0 ? "Paid" : "Pending",
    acceptedAt: contract.acceptance?.acceptedAt ?? contract.updatedAt,
  };
}

export async function loadPaymentContext(prisma: PrismaClient, paymentId: string) {
  const payment = await prisma.contractPayment.findUnique({
    where: { id: paymentId },
    include: {
      contract: {
        include: {
          customer: { select: { name: true } },
          vehicle: { include: { model: { select: { name: true } } } },
        },
      },
    },
  });
  if (!payment) return null;
  return {
    payment,
    contractNumber: payment.contract.contractNumber,
    customerName: payment.contract.customer?.name ?? "Unknown customer",
    vehicleName: vehicleDisplayName(payment.contract.vehicle),
    paymentSource: payment.provider === "stripe" ? "Stripe" : payment.method,
  };
}

export async function loadCarOutContext(prisma: PrismaClient, contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      customer: { select: { name: true } },
      vehicle: { include: { model: { select: { name: true } } } },
      carOut: { select: { mileageOut: true, fuelOut: true, performedByUserId: true, occurredAt: true } },
    },
  });
  if (!contract?.carOut) return null;
  const actor = await loadActorLabel(prisma, contract.carOut.performedByUserId, "Staff");
  return {
    contractNumber: contract.contractNumber,
    customerName: contract.customer?.name ?? "Unknown customer",
    vehicleName: vehicleDisplayName(contract.vehicle),
    mileageOut: contract.carOut.mileageOut,
    fuelOut: contract.carOut.fuelOut,
    actor,
    occurredAt: contract.carOut.occurredAt,
  };
}

export async function loadRenewalContext(
  prisma: PrismaClient,
  contractId: string,
  renewalId?: string,
) {
  const renewal = renewalId
    ? await prisma.contractRenewal.findUnique({
        where: { id: renewalId },
        include: {
          contract: {
            include: {
              customer: { select: { name: true } },
              vehicle: { include: { model: { select: { name: true } } } },
            },
          },
        },
      })
    : await prisma.contractRenewal.findFirst({
        where: { contractId, appliedAt: { not: null } },
        orderBy: { appliedAt: "desc" },
        include: {
          contract: {
            include: {
              customer: { select: { name: true } },
              vehicle: { include: { model: { select: { name: true } } } },
            },
          },
        },
      });
  if (!renewal || !renewal.appliedAt) return null;
  const actor = await loadActorLabel(prisma, renewal.createdByUserId, "Staff");
  return {
    contractNumber: renewal.contract.contractNumber,
    customerName: renewal.contract.customer?.name ?? "Unknown customer",
    vehicleName: vehicleDisplayName(renewal.contract.vehicle),
    previousEndAt: renewal.previousEndAt,
    newEndAt: renewal.newEndAt,
    additionalAmount: renewal.additionalAmount,
    currency: renewal.contract.currency,
    actor,
    occurredAt: renewal.appliedAt ?? renewal.approvedAt ?? new Date(),
  };
}

export async function loadCarInContext(prisma: PrismaClient, contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      customer: { select: { name: true } },
      vehicle: { include: { model: { select: { name: true } } } },
      carIn: {
        select: { mileageIn: true, fuelIn: true, occurredAt: true, performedByUserId: true },
      },
      officialReviewDraft: { select: { damageIn: true } },
    },
  });
  if (!contract?.carIn) return null;
  const actor = await loadActorLabel(
    prisma,
    contract.carIn.performedByUserId,
    UNKNOWN_STAFF_ACTOR_LABEL,
  );
  return {
    contractNumber: contract.contractNumber,
    customerName: contract.customer?.name ?? "Unknown customer",
    vehicleName: vehicleDisplayName(contract.vehicle),
    mileageIn: contract.carIn.mileageIn,
    fuelIn: contract.carIn.fuelIn,
    damageSummary: summarizeDamageMarks(contract.officialReviewDraft?.damageIn),
    actor,
    occurredAt: contract.carIn.occurredAt,
  };
}

export async function loadRoadLiabilityContext(prisma: PrismaClient, liabilityId: string) {
  const liability = await prisma.roadLiability.findUnique({
    where: { id: liabilityId },
    include: {
      vehicle: { include: { model: { select: { name: true } } } },
      attributedContract: {
        select: {
          contractNumber: true,
          customer: { select: { name: true } },
        },
      },
      customerCharge: {
        select: {
          officialAmountSnapshot: true,
          customerChargeAmount: true,
          adjustmentAmount: true,
        },
      },
    },
  });
  if (!liability) return null;

  const officialAmount = liability.amount;
  const adminFee = liability.customerCharge?.adjustmentAmount ?? null;
  const totalDue = liability.customerCharge?.customerChargeAmount ?? officialAmount;

  return {
    vehicleName: liability.vehicle ? vehicleDisplayName(liability.vehicle) : null,
    customerName: liability.attributedContract?.customer?.name ?? null,
    contractNumber: liability.attributedContract?.contractNumber ?? null,
    reference:
      liability.authoritativeExternalReference?.trim() ||
      liability.id.slice(0, 8).toUpperCase(),
    officialAmount,
    adminFee,
    totalDue,
    currency: liability.currency ?? "AED",
    source: liability.authoritativeSourceKey ?? "System",
    occurredAt: liability.occurredAt,
  };
}

export async function loadRoadLiabilityCollectionContext(
  prisma: PrismaClient,
  paymentId: string,
) {
  const payment = await prisma.contractPayment.findUnique({
    where: { id: paymentId },
    include: {
      contract: {
        include: {
          customer: { select: { name: true } },
          vehicle: { include: { model: { select: { name: true } } } },
        },
      },
    },
  });
  if (!payment) return null;

  let liability:
    | {
        reference: string;
        officialAmount: number;
        adminFee: number;
        totalCollected: number;
      }
    | null = null;

  if (payment.purpose === "RECONCILIATION") {
    const line = await prisma.contractReconciliationLine.findFirst({
      where: {
        reconciliationId: payment.targetId,
        sourceDomain: "road_liability",
      },
      include: {
        customerCharge: {
          include: { roadLiability: true },
        },
      },
    });
    const charge = line?.customerCharge;
    if (charge) {
      liability = {
        reference:
          charge.roadLiability.authoritativeExternalReference?.trim() ||
          charge.roadLiabilityId.slice(0, 8).toUpperCase(),
        officialAmount: charge.officialAmountSnapshot,
        adminFee: charge.adjustmentAmount,
        totalCollected: charge.customerChargeAmount,
      };
    }
  }

  if (payment.purpose === "POST_CLOSE_RECEIVABLE") {
    const receivable = await prisma.contractPostCloseReceivable.findUnique({
      where: { id: payment.targetId },
      include: {
        roadLiabilityCustomerCharge: {
          include: { roadLiability: true },
        },
      },
    });
    const charge = receivable?.roadLiabilityCustomerCharge;
    if (charge) {
      liability = {
        reference:
          charge.roadLiability.authoritativeExternalReference?.trim() ||
          charge.roadLiabilityId.slice(0, 8).toUpperCase(),
        officialAmount: charge.officialAmountSnapshot,
        adminFee: charge.adjustmentAmount,
        totalCollected: charge.customerChargeAmount,
      };
    }
  }

  return {
    contractNumber: payment.contract.contractNumber,
    customerName: payment.contract.customer?.name ?? "Unknown customer",
    vehicleName: vehicleDisplayName(payment.contract.vehicle),
    amount: payment.amount,
    currency: payment.currency,
    purpose: payment.purpose,
    liability,
    occurredAt: payment.confirmedAt ?? new Date(),
    collectionChannel: payment.provider === "stripe" ? "Stripe" : payment.method,
  };
}

export async function loadMaintenanceContext(prisma: PrismaClient, maintenanceOrderId: number) {
  const order = await prisma.maintenanceOrder.findUnique({
    where: { id: maintenanceOrderId },
    include: {
      vehicle: { include: { model: { select: { name: true } } } },
    },
  });
  if (!order) return null;
  const actor = await loadActorLabel(prisma, order.createdByUserId, "Staff");
  return {
    vehicleName: vehicleDisplayName(order.vehicle),
    orderReference: `MO-${order.id}`,
    actualCost: order.cost,
    currency: "AED",
    actor,
    occurredAt: order.completedAt ?? order.startedAt ?? order.createdAt,
  };
}

export async function loadManualExpenseContext(prisma: PrismaClient, expenseId: string) {
  const expense = await prisma.manualExpense.findUnique({
    where: { id: expenseId },
    select: {
      amount: true,
      category: true,
      description: true,
      recognizedAt: true,
      createdByUserId: true,
    },
  });
  if (!expense) return null;
  const actor = await loadActorLabel(prisma, expense.createdByUserId, "Staff");
  return {
    category: expense.category,
    description: expense.description,
    amount: expense.amount,
    currency: "AED",
    actor,
    occurredAt: expense.recognizedAt,
  };
}
