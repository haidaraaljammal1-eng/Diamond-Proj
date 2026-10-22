import type { PrismaClient } from "@prisma/client";
import { withTransaction, type Tx } from "src/lib/db/transaction";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import {
  CONTRACT_LIFECYCLE_LOCK_NS,
  CONTRACT_PAYMENT_LOCK_NS,
  VEHICLE_RENTAL_LOCK_NS,
} from "src/modules/contracts/contracts.constants";
import { contractError } from "src/modules/contracts/contracts.errors";
import { revokeUnusedRentalLinks } from "src/modules/contracts/contracts-links";
import { writeOutboxEvent } from "src/lib/db/outbox";

const IN_FLIGHT_PAYMENT = ["PENDING", "PROCESSING"] as const;
const IN_FLIGHT_ATTEMPT = ["PREPARING", "RECOVERING", "READY"] as const;

const BLOCKING_LIFECYCLE = ["PAID", "ACTIVE", "RETOUT", "REVIEW", "CLOSED"] as const;

async function assertDeletablePrePaymentContract(
  tx: Tx,
  contractId: string,
  expectedVehicleId?: number,
): Promise<{ id: string; vehicleId: number; contractNumber: string }> {
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    select: {
      id: true,
      status: true,
      vehicleId: true,
      contractNumber: true,
      carOut: { select: { id: true } },
      carIn: { select: { id: true } },
      reconciliation: { select: { id: true } },
    },
  });
  if (!contract) throw contractError.notFound();
  if (expectedVehicleId != null && contract.vehicleId !== expectedVehicleId) {
    throw contractError.notFound();
  }
  if (BLOCKING_LIFECYCLE.includes(contract.status as (typeof BLOCKING_LIFECYCLE)[number])) {
    throw contractError.rentalRequestNotCancellable();
  }
  if (!["AWAITING", "FORM", "SIGNED"].includes(contract.status)) {
    throw contractError.rentalRequestNotCancellable();
  }
  if (contract.carOut || contract.carIn || contract.reconciliation) {
    throw contractError.rentalRequestDeleteBlocked();
  }

  const invoiceCount = await tx.invoice.count({ where: { contractId } });
  if (invoiceCount > 0) throw contractError.rentalRequestHasInvoice();

  const confirmed = await tx.contractPayment.findFirst({
    where: { contractId, purpose: "RENTAL", status: "CONFIRMED" },
    select: { id: true },
  });
  if (confirmed) throw contractError.paymentAlreadyConfirmed();

  const inflight = await tx.contractPayment.findFirst({
    where: { contractId, purpose: "RENTAL", status: { in: [...IN_FLIGHT_PAYMENT] } },
    select: { id: true, providerReference: true, status: true },
  });
  if (inflight) throw contractError.paymentInFlight();

  const inflightAttempt = await tx.contractPaymentAttempt.findFirst({
    where: {
      contractPayment: { contractId, purpose: "RENTAL" },
      status: { in: [...IN_FLIGHT_ATTEMPT] },
    },
    select: { id: true },
  });
  if (inflightAttempt) throw contractError.paymentInFlight();

  const ledgerOnContract = await tx.financialLedgerEntry.count({ where: { contractId } });
  if (ledgerOnContract > 0) throw contractError.rentalRequestDeleteBlocked();

  return contract;
}

async function deleteExclusiveAttachments(tx: Tx, attachmentIds: string[]): Promise<void> {
  for (const attachmentId of attachmentIds) {
    const stillLinked =
      (await tx.contractDocument.count({ where: { attachmentId } })) +
      (await tx.officialContractSignature.count({ where: { attachmentId } })) +
      (await tx.contractAcceptance.count({ where: { signatureAttachmentId: attachmentId } })) +
      (await tx.customerDocument.count({ where: { attachmentId } }));
    if (stillLinked > 0) continue;
    await tx.attachment.deleteMany({ where: { id: attachmentId } });
  }
}

async function deletePendingRentalRequestInTx(
  tx: Tx,
  contractId: string,
  expectedVehicleId?: number,
): Promise<{ contractId: string; vehicleId: number; contractNumber: string }> {
  await acquireAdvisoryLock(tx, CONTRACT_PAYMENT_LOCK_NS, `RENTAL:${contractId}`);
  await acquireAdvisoryLock(tx, CONTRACT_LIFECYCLE_LOCK_NS, contractId);

  const contract = await assertDeletablePrePaymentContract(tx, contractId, expectedVehicleId);
  await acquireAdvisoryLock(tx, VEHICLE_RENTAL_LOCK_NS, contract.vehicleId);

  await revokeUnusedRentalLinks(tx, contractId);

  const attachmentIds = new Set<string>();
  const docs = await tx.contractDocument.findMany({
    where: { contractId },
    select: { attachmentId: true },
  });
  for (const doc of docs) {
    if (doc.attachmentId) attachmentIds.add(doc.attachmentId);
  }
  const signatures = await tx.officialContractSignature.findMany({
    where: { contractId },
    select: { attachmentId: true },
  });
  for (const sig of signatures) attachmentIds.add(sig.attachmentId);

  await tx.drivingLicenseExtraction.deleteMany({ where: { contractId } });
  await tx.passportExtraction.deleteMany({ where: { contractId } });
  await tx.drivingLicenseVerification.deleteMany({ where: { contractId } });
  await tx.officialContractSignature.deleteMany({ where: { contractId } });
  await tx.contractDocument.deleteMany({ where: { contractId } });
  await tx.contractAcceptance.deleteMany({ where: { contractId } });
  await tx.officialContractReviewDraft.deleteMany({ where: { contractId } });

  const payments = await tx.contractPayment.findMany({
    where: { contractId },
    select: { id: true },
  });
  for (const payment of payments) {
    await tx.contractPaymentAllocation.deleteMany({ where: { contractPaymentId: payment.id } });
    await tx.contractPaymentAttempt.deleteMany({ where: { contractPaymentId: payment.id } });
    await tx.contractPaymentOffSessionAttempt.deleteMany({ where: { contractPaymentId: payment.id } });
  }
  await tx.contractPayment.deleteMany({ where: { contractId } });
  await tx.contractCardPaymentMethod.deleteMany({ where: { contractId } });
  await tx.contractLink.deleteMany({ where: { contractId } });

  await deleteExclusiveAttachments(tx, [...attachmentIds]);

  await tx.contract.delete({ where: { id: contractId } });

  await writeOutboxEvent(tx, {
    eventType: "contract.rental_request_deleted",
    aggregateType: "contract",
    aggregateId: contractId,
    dedupeKey: `contract.rental_request_deleted:${contractId}`,
    payload: { contractId, contractNumber: contract.contractNumber, vehicleId: contract.vehicleId },
  });

  return {
    contractId,
    vehicleId: contract.vehicleId,
    contractNumber: contract.contractNumber,
  };
}

export function createPendingRentalRequestDeleteService(prisma: PrismaClient) {
  return {
    deletePendingRentalRequest(
      contractId: string,
      options: { expectedVehicleId?: number } = {},
    ) {
      return withTransaction(prisma, (tx) =>
        deletePendingRentalRequestInTx(tx, contractId, options.expectedVehicleId),
      );
    },
  };
}
