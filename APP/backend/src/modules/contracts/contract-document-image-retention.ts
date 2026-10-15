import type { ContractDocumentType, Prisma } from "@prisma/client";
import type { Tx } from "src/lib/db/transaction";

/**
 * Detach superseded contract document images so physical files can be removed.
 * Active documents (supersededAt null) are never modified.
 * Returns attachment ids that were detached and are candidates for filesystem cleanup.
 */
export async function detachSupersededContractDocumentImages(
  tx: Tx,
  params: { contractId: string; type: ContractDocumentType },
): Promise<string[]> {
  const superseded = await tx.contractDocument.findMany({
    where: {
      contractId: params.contractId,
      type: params.type,
      supersededAt: { not: null },
      attachmentId: { not: null },
    },
    select: { id: true, attachmentId: true },
  });
  if (!superseded.length) return [];

  const attachmentIds = [
    ...new Set(
      superseded
        .map((row) => row.attachmentId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  if (params.type === "DRIVING_LICENSE" && attachmentIds.length) {
    await tx.customerDocument.deleteMany({
      where: { attachmentId: { in: attachmentIds } },
    });
  }

  await tx.contractDocument.updateMany({
    where: { id: { in: superseded.map((row) => row.id) } },
    data: { attachmentId: null },
  });

  return attachmentIds;
}

export type AttachmentReferenceCounts = {
  contractDocuments: number;
  customerDocuments: number;
  vehiclePhotos: number;
  contractCarOutPhotos: number;
  contractCarOutDraftPhotos: number;
  contractCarInPhotos: number;
  contractCarInDraftPhotos: number;
  contractSignatures: number;
  officialContractSignatures: number;
  manualExpenses: number;
  tarsUploads: number;
  carOutHirerSignatures: number;
  carOutDraftHirerSignatures: number;
  carInDraftHirerSignatures: number;
};

export async function countAttachmentReferences(
  db: Prisma.TransactionClient | Prisma.DefaultPrismaClient,
  attachmentId: string,
): Promise<AttachmentReferenceCounts> {
  const [
    contractDocuments,
    customerDocuments,
    vehiclePhotos,
    contractCarOutPhotos,
    contractCarOutDraftPhotos,
    contractCarInPhotos,
    contractCarInDraftPhotos,
    contractSignatures,
    officialContractSignatures,
    manualExpenses,
    tarsUploads,
    carOutHirerSignatures,
    carOutDraftHirerSignatures,
    carInDraftHirerSignatures,
  ] = await Promise.all([
    db.contractDocument.count({ where: { attachmentId } }),
    db.customerDocument.count({ where: { attachmentId } }),
    db.vehiclePhoto.count({ where: { attachmentId } }),
    db.contractCarOutPhoto.count({ where: { attachmentId } }),
    db.contractCarOutDraftPhoto.count({ where: { attachmentId } }),
    db.contractCarInPhoto.count({ where: { attachmentId } }),
    db.contractCarInDraftPhoto.count({ where: { attachmentId } }),
    db.contractAcceptance.count({ where: { signatureAttachmentId: attachmentId } }),
    db.officialContractSignature.count({ where: { attachmentId } }),
    db.manualExpense.count({ where: { attachmentId } }),
    db.tarsAttachmentUpload.count({ where: { attachmentId } }),
    db.contractCarOut.count({ where: { hirerSignatureAttachmentId: attachmentId } }),
    db.contractCarOutDraft.count({ where: { hirerSignatureAttachmentId: attachmentId } }),
    db.contractCarInDraft.count({ where: { hirerSignatureAttachmentId: attachmentId } }),
  ]);

  return {
    contractDocuments,
    customerDocuments,
    vehiclePhotos,
    contractCarOutPhotos,
    contractCarOutDraftPhotos,
    contractCarInPhotos,
    contractCarInDraftPhotos,
    contractSignatures,
    officialContractSignatures,
    manualExpenses,
    tarsUploads,
    carOutHirerSignatures,
    carOutDraftHirerSignatures,
    carInDraftHirerSignatures,
  };
}

export function attachmentReferenceTotal(counts: AttachmentReferenceCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}
