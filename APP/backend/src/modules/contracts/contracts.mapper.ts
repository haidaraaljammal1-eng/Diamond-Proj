import type { Prisma } from "@prisma/client";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import type { ContractDetail, ContractListItem } from "src/modules/contracts/contracts.schema";
import {
  EMPTY_ROAD_LIABILITY_SIGNALS,
  type ContractRoadLiabilitySignals,
} from "src/modules/contracts/contract-road-liability-signals";

const DETAIL_INCLUDE = {
  vehicle: { include: { model: { select: { name: true } } } },
  customer: true,
  payments: {
    where: { purpose: "RENTAL" },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
  carOut: {
    include: {
      photos: {
        orderBy: { sortOrder: "asc" as const },
        include: { attachment: { select: { mimeType: true } } },
      },
    },
  },
  carIn: {
    include: {
      photos: {
        orderBy: { sortOrder: "asc" as const },
        include: { attachment: { select: { mimeType: true } } },
      },
    },
  },
  reconciliation: { include: { lines: { orderBy: { createdAt: "asc" as const } } } },
  renewals: { orderBy: { createdAt: "asc" as const } },
  postCloseReceivables: {
    orderBy: { createdAt: "desc" as const },
    include: { roadLiability: { select: { type: true } } },
  },
} satisfies Prisma.ContractInclude;

export type ContractDetailRow = Prisma.ContractGetPayload<{ include: typeof DETAIL_INCLUDE }>;
export const CONTRACT_DETAIL_INCLUDE = DETAIL_INCLUDE;

function displayName(vehicle: ContractDetailRow["vehicle"]): string {
  return vehicleDisplayName({
    vehicleName: vehicle.vehicleName,
    modelName: vehicle.model?.name ?? null,
    modelYear: vehicle.modelYear,
    plateNumber: vehicle.plateNumber,
  });
}

export function toListItem(row: {
  id: string;
  contractNumber: string;
  status: ContractDetail["status"];
  vehicleId: number;
  customerId: number | null;
  priceType: ContractDetail["priceType"];
  rentalDays: number;
  agreedAmount: number;
  currency: string;
  startAt: Date | null;
  endAt: Date | null;
  createdAt: Date;
  vehicle: ContractDetailRow["vehicle"];
  customer: { name: string } | null;
  hasSalikGpsSignal?: boolean;
}): ContractListItem {
  return {
    id: row.id,
    contractNumber: row.contractNumber,
    status: row.status,
    vehicleId: row.vehicleId,
    vehicleName: displayName(row.vehicle),
    plateNumber: row.vehicle.plateNumber,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    priceType: row.priceType,
    rentalDays: row.rentalDays,
    agreedAmount: row.agreedAmount,
    currency: row.currency,
    startAt: row.startAt,
    endAt: row.endAt,
    createdAt: row.createdAt,
    hasSalikGpsSignal: row.hasSalikGpsSignal ?? false,
  };
}

function reconciliationSettled(row: ContractDetailRow): boolean {
  if (!row.reconciliation) return true;
  if (row.reconciliation.finalAmount <= 0) return true;
  return Boolean(row.reconciliation.settledAt);
}

function actionsFor(row: ContractDetailRow): ContractDetail["actions"] {
  return {
    canGenerateRentalLink: row.status === "AWAITING" || row.status === "FORM" || row.status === "SIGNED",
    canConfirmPayment: false,
    canCarOut: row.status === "PAID",
    canGenerateReturnLink: row.status === "ACTIVE",
    canCarIn: row.status === "RETOUT" && !row.carIn,
    canReconcile: row.status === "REVIEW",
    canClose:
      row.status === "REVIEW" &&
      !!row.carIn &&
      !!row.reconciliation?.approvedAt &&
      reconciliationSettled(row),
    canRenew: row.status === "ACTIVE",
  };
}

function toPostCloseSummary(row: ContractDetailRow): ContractDetail["postCloseReceivables"] {
  const items = row.postCloseReceivables.map((item) => ({
    id: item.id,
    amount: item.amount,
    currency: item.currency,
    status: item.status,
    settledAt: item.settledAt,
    roadLiabilityType: item.roadLiability.type,
    createdAt: item.createdAt,
  }));
  return {
    count: items.length,
    openAmount: items.filter((item) => item.status === "OPEN").reduce((sum, item) => sum + item.amount, 0),
    items,
  };
}

export function toDetail(
  row: ContractDetailRow,
  signals: ContractRoadLiabilitySignals = EMPTY_ROAD_LIABILITY_SIGNALS,
): ContractDetail {
  const payment = row.payments[0] ?? null;
  return {
    id: row.id,
    contractNumber: row.contractNumber,
    status: row.status,
    vehicleId: row.vehicleId,
    customerId: row.customerId,
    createdByUserId: row.createdByUserId,
    assignedEmployeeUserId: row.assignedEmployeeUserId,
    priceType: row.priceType,
    rentalDays: row.rentalDays,
    agreedAmount: row.agreedAmount,
    currency: row.currency,
    startAt: row.startAt,
    endAt: row.endAt,
    termsVersion: row.termsVersion,
    snapshot: row.snapshot,
    activatedAt: row.activatedAt,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    vehicle: {
      id: row.vehicle.id,
      displayName: displayName(row.vehicle),
      plateNumber: row.vehicle.plateNumber,
      operationalStatus: row.vehicle.operationalStatus,
    },
    customer: row.customer
      ? {
          id: row.customer.id,
          name: row.customer.name,
          mobile: row.customer.mobile,
          email: row.customer.email,
        }
      : null,
    payment: payment
      ? {
          id: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          method: payment.method,
          status: payment.status,
          confirmedAt: payment.confirmedAt,
        }
      : null,
    carOut: row.carOut
      ? {
          id: row.carOut.id,
          occurredAt: row.carOut.occurredAt,
          mileageOut: row.carOut.mileageOut,
          fuelOut: row.carOut.fuelOut,
          notes: row.carOut.notes,
          photos: row.carOut.photos.map((p) => ({
            id: p.id,
            attachmentId: p.attachmentId,
            angle: p.angle,
            url: `/contracts/${row.id}/car-out/photos/${p.id}/stream`,
          })),
        }
      : null,
    carIn: row.carIn
      ? {
          id: row.carIn.id,
          occurredAt: row.carIn.occurredAt,
          mileageIn: row.carIn.mileageIn,
          fuelIn: row.carIn.fuelIn,
          notes: row.carIn.notes,
          photos: row.carIn.photos.map((p) => ({
            id: p.id,
            attachmentId: p.attachmentId,
            angle: p.angle,
            url: `/contracts/${row.id}/car-in/photos/${p.id}/stream`,
          })),
        }
      : null,
    reconciliation: row.reconciliation
      ? {
          id: row.reconciliation.id,
          chargesTotal: row.reconciliation.chargesTotal,
          finalAmount: row.reconciliation.chargesTotal,
          approvedAt: row.reconciliation.approvedAt,
          settledAt: row.reconciliation.settledAt,
          settled: reconciliationSettled(row),
          lines: row.reconciliation.lines.map((l) => ({
            id: l.id,
            type: l.type,
            description: l.description,
            amount: l.amount,
            externalReference: l.externalReference,
            sourceDomain: l.sourceDomain,
            roadLiabilityId: l.roadLiabilityId ?? null,
            officialAmountSnapshot: l.officialAmountSnapshot ?? null,
            adjustmentAmount: l.adjustmentAmount ?? null,
            adjustmentReason: l.adjustmentReason ?? null,
          })),
        }
      : null,
    renewals: row.renewals.map((r) => ({
      id: r.id,
      additionalDays: r.additionalDays,
      additionalAmount: r.additionalAmount,
      previousEndAt: r.previousEndAt,
      newEndAt: r.newEndAt,
      createdAt: r.createdAt,
      approvedAt: r.approvedAt,
      appliedAt: r.appliedAt,
      awaitingPayment:
        r.approvedAt != null && r.appliedAt == null && r.additionalAmount > 0,
    })),
    actions: actionsFor(row),
    roadLiabilitySignals: signals,
    postCloseReceivables: toPostCloseSummary(row),
  };
}
