import type { Prisma } from "@prisma/client";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import type { ContractDetail, ContractListItem } from "src/modules/contracts/contracts.schema";

const DETAIL_INCLUDE = {
  vehicle: { include: { model: { select: { name: true } } } },
  customer: true,
  payments: { orderBy: { createdAt: "desc" as const }, take: 1 },
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
  };
}

function actionsFor(row: ContractDetailRow): ContractDetail["actions"] {
  return {
    canGenerateRentalLink: row.status === "AWAITING" || row.status === "FORM" || row.status === "SIGNED",
    canConfirmPayment: row.status === "SIGNED",
    canCarOut: row.status === "PAID",
    canGenerateReturnLink: row.status === "ACTIVE",
    canCarIn: row.status === "RETOUT" && !row.carIn,
    canReconcile: row.status === "REVIEW",
    canClose: row.status === "REVIEW" && !!row.carIn && !!row.reconciliation?.approvedAt,
    canRenew: row.status === "ACTIVE",
  };
}

export function toDetail(row: ContractDetailRow): ContractDetail {
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
    depositAmount: row.depositAmount,
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
          depositAmount: row.reconciliation.depositAmount,
          deductions: row.reconciliation.deductions,
          finalAmount: row.reconciliation.finalAmount,
          approvedAt: row.reconciliation.approvedAt,
          lines: row.reconciliation.lines.map((l) => ({
            id: l.id,
            type: l.type,
            description: l.description,
            amount: l.amount,
            externalReference: l.externalReference,
            sourceDomain: l.sourceDomain,
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
    })),
    actions: actionsFor(row),
  };
}
