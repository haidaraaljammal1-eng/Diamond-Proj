import type { Prisma, PrismaClient } from "@prisma/client";
import { buildDrivingLicenseExtractionCreateData } from "src/modules/contracts/driving-license-extraction.mapper";
import {
  LICENSE_UPLOAD_FAILURE_META_KEY,
  type LicenseUploadFailureCode,
} from "src/modules/contracts/license-frame";
import type { DrivingLicenseOcrSuccess } from "src/modules/contracts/ocr/driving-license-ocr.types";

type Db = PrismaClient | Prisma.TransactionClient;

export async function createFailedDrivingLicenseExtractionForUpload(
  tx: Db,
  params: {
    contractId: string;
    documentId: string;
    attachmentId: string;
    provider: string | null;
    providerVersion: string | null;
    failureCode: LicenseUploadFailureCode;
  },
) {
  return tx.drivingLicenseExtraction.create({
    data: {
      contractId: params.contractId,
      documentId: params.documentId,
      attachmentId: params.attachmentId,
      status: "FAILED",
      provider: params.provider,
      providerVersion: params.providerVersion,
      fieldsMeta: { [LICENSE_UPLOAD_FAILURE_META_KEY]: params.failureCode },
      completedAt: new Date(),
    },
  });
}

export async function createDrivingLicenseExtractionForUpload(
  tx: Db,
  params: {
    contractId: string;
    documentId: string;
    attachmentId: string;
    ocr: DrivingLicenseOcrSuccess;
  },
) {
  const data = buildDrivingLicenseExtractionCreateData(params);
  return tx.drivingLicenseExtraction.create({ data });
}

export async function findDrivingLicenseExtractionByDocumentId(tx: Db, documentId: string) {
  return tx.drivingLicenseExtraction.findUnique({ where: { documentId } });
}

/** Active licence OCR: document not superseded by a retake. */
export async function activeDrivingLicenseExtraction(tx: Db, contractId: string) {
  return tx.drivingLicenseExtraction.findFirst({
    where: { contractId, document: { supersededAt: null } },
    orderBy: { createdAt: "desc" },
  });
}
