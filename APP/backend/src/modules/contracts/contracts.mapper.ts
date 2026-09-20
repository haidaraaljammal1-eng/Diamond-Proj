import type { Prisma } from "@prisma/client";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import type { ContractDetail, ContractListItem } from "src/modules/contracts/contracts.schema";
import { carOutReadiness } from "src/modules/contracts/car-out-evidence";
import { carInReadiness } from "src/modules/contracts/car-in-evidence";
import { readDamageMarks } from "src/modules/contracts/official-contract-interactive";
import {
  EMPTY_ROAD_LIABILITY_SIGNALS,
  type ContractRoadLiabilitySignals,
} from "src/modules/contracts/contract-road-liability-signals";

const DETAIL_INCLUDE = {
  company: { select: { id: true, code: true, displayName: true, accentColor: true } },
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
        include: { attachment: { select: { mimeType: true, createdAt: true, uploadedById: true, checksum: true } } },
      },
    },
  },
  carOutDraft: {
    include: { photos: {
      orderBy: { createdAt: "asc" as const },
      include: { attachment: { select: { mimeType: true, createdAt: true, uploadedById: true, checksum: true } } },
    } },
  },
  carIn: {
    include: {
      photos: {
        orderBy: { sortOrder: "asc" as const },
        include: { attachment: { select: { mimeType: true, createdAt: true, uploadedById: true, checksum: true } } },
      },
    },
  },
  carInDraft: {
    include: { photos: {
      orderBy: { createdAt: "asc" as const },
      include: { attachment: { select: { mimeType: true, createdAt: true, uploadedById: true, checksum: true } } },
    } },
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
  company: ContractDetailRow["company"];
  vehicle: ContractDetailRow["vehicle"];
  customer: { name: string } | null;
  hasSalikGpsSignal?: boolean;
  canCarOut: boolean;
  carOutStatus: ContractListItem["carOutStatus"];
  carIn?: { id: string } | null;
}): ContractListItem {
  return {
    id: row.id,
    contractNumber: row.contractNumber,
    status: row.status,
    company: row.company,
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
    // Same rule as the detail `actions.canCarIn`.
    actions: { canCarOut: row.canCarOut, canCarIn: row.status === "RETOUT" && !row.carIn && row.vehicle.operationalStatus === "RENTED" },
    carOutStatus: row.carOutStatus,
  };
}

function reconciliationSettled(row: ContractDetailRow): boolean {
  if (!row.reconciliation) return true;
  if (row.reconciliation.finalAmount <= 0) return true;
  return Boolean(row.reconciliation.settledAt);
}

function actionsFor(row: ContractDetailRow, canCarOut: boolean): ContractDetail["actions"] {
  return {
    canGenerateRentalLink: row.status === "AWAITING" || row.status === "FORM" || row.status === "SIGNED",
    canConfirmPayment: false,
    canCarOut,
    canGenerateReturnLink: row.status === "ACTIVE",
    canCarIn: row.status === "RETOUT" && !row.carIn && row.vehicle.operationalStatus === "RENTED",
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
  canCarOut = false,
): ContractDetail {
  const payment = row.payments[0] ?? null;
  const out = row.carOut ?? row.carOutDraft;
  const outProgress = carOutReadiness({
    mileageOut: out?.mileageOut ?? null,
    fuelOut: out?.fuelOut ?? null,
    hasSignature: Boolean(out?.hirerSignatureAttachmentId),
    photos: out?.photos ?? [],
  });
  const outStatus = row.carOut ? "COMPLETED" : row.carOutDraft
    ? outProgress.ready ? "READY" : "DRAFT" : "NOT_STARTED";
  const outPhotos = out?.photos.map((p) => ({
    id: p.id,
    contractId: row.id,
    vehicleId: row.carOut?.vehicleId ?? row.vehicleId,
    stage: "OUT" as const,
    attachmentId: p.attachmentId,
    angle: p.angle,
    url: `/contracts/${row.id}/car-out/photos/${p.id}/stream`,
    uploadedAt: p.attachment.createdAt,
    uploadedByUserId: p.attachment.uploadedById,
    checksum: p.attachment.checksum,
  })) ?? [];
  // Mileage/fuel/notes/photos come from the final row once it exists, else the draft.
  // The IN signature and damage have no home on the final ContractCarIn model (by
  // design, see contracts.prisma), so they always read from the draft, which is
  // never deleted on completion.
  const canCarIn = row.status === "RETOUT" && !row.carIn && row.vehicle.operationalStatus === "RENTED";
  const inSource = row.carIn ?? row.carInDraft;
  const inSignaturePresent = Boolean(row.carInDraft?.hirerSignatureAttachmentId);
  const inProgress = carInReadiness({
    mileageIn: inSource?.mileageIn ?? null,
    fuelIn: inSource?.fuelIn ?? null,
    hasSignature: inSignaturePresent,
    photos: inSource?.photos ?? [],
  });
  const inStatus = row.carIn ? "COMPLETED" : row.carInDraft
    ? inProgress.ready ? "READY" : "DRAFT" : "NOT_STARTED";
  const inPhotos = inSource?.photos.map((p) => ({
    id: p.id,
    contractId: row.id,
    vehicleId: row.vehicleId,
    stage: "IN" as const,
    attachmentId: p.attachmentId,
    angle: p.angle,
    url: `/contracts/${row.id}/car-in/photos/${p.id}/stream`,
    uploadedAt: p.attachment.createdAt,
    uploadedByUserId: p.attachment.uploadedById,
    checksum: p.attachment.checksum,
  })) ?? [];
  return {
    id: row.id,
    contractNumber: row.contractNumber,
    status: row.status,
    company: row.company,
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
    carOutHandover: {
      status: outStatus,
      mileageOut: out?.mileageOut ?? null,
      fuelOut: out?.fuelOut ?? null,
      damageOut: readDamageMarks(out?.damageOut),
      notes: out?.notes ?? null,
      photoEvidence: { ...outProgress, photos: outPhotos },
      signature: {
        present: Boolean(out?.hirerSignatureAttachmentId),
        attachmentId: out?.hirerSignatureAttachmentId ?? null,
        url: out?.hirerSignatureAttachmentId ? `/contracts/${row.id}/car-out/signature/stream` : null,
      },
      actualHandoverAt: row.carOut?.occurredAt ?? null,
      actions: {
        canEdit: canCarOut,
        canUploadPhotos: canCarOut,
        canDeletePhotos: canCarOut,
        canSign: canCarOut,
        canSaveDraft: canCarOut,
        canComplete: canCarOut && outProgress.ready,
      },
    },
    carInHandover: {
      status: inStatus,
      mileageIn: inSource?.mileageIn ?? null,
      fuelIn: inSource?.fuelIn ?? null,
      damageIn: readDamageMarks(row.carInDraft?.damageIn),
      notes: inSource?.notes ?? null,
      photoEvidence: { ...inProgress, photos: inPhotos },
      signature: {
        present: inSignaturePresent,
        attachmentId: row.carInDraft?.hirerSignatureAttachmentId ?? null,
        url: inSignaturePresent ? `/contracts/${row.id}/car-in/signature/stream` : null,
      },
      actualReturnAt: row.carIn?.occurredAt ?? null,
      actions: {
        canEdit: canCarIn,
        canUploadPhotos: canCarIn,
        canDeletePhotos: canCarIn,
        canSign: canCarIn,
        canSaveDraft: canCarIn,
        canComplete: canCarIn && inProgress.ready,
      },
    },
    carOut: row.carOut
      ? {
          id: row.carOut.id,
          occurredAt: row.carOut.occurredAt,
          mileageOut: row.carOut.mileageOut,
          fuelOut: row.carOut.fuelOut,
          notes: row.carOut.notes,
          damageOut: readDamageMarks(row.carOut.damageOut),
          vehicleId: row.carOut.vehicleId ?? row.vehicleId,
          hirerSignatureAttachmentId: row.carOut.hirerSignatureAttachmentId,
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
    actions: actionsFor(row, canCarOut),
    roadLiabilitySignals: signals,
    postCloseReceivables: toPostCloseSummary(row),
  };
}
