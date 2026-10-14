import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { env } from "src/config/env";
import { ErrorCode } from "src/constants/error-codes";
import { AppError } from "src/lib/errors/app-error";
import { archiveRowNotFoundError } from "src/modules/archive/archive.errors";
import {
  clearManualCellValue,
  parseManualCellValues,
  serializeManualCellValues,
} from "src/modules/archive/archive-manual-cell-values";
import {
  type ArchiveSyncAutoField,
  ARCHIVE_SYNC_AUTO_FIELDS,
  buildSyncArchiveRowUpdate,
  isManualOverride,
  parseManualOverrides,
  setManualOverride,
  serializeManualOverrides,
} from "src/modules/archive/archive-manual-overrides";
import { toArchiveRow } from "src/modules/archive/archive.mapper";
import type { ArchiveRowDto } from "src/modules/archive/archive.schema";
import { recomputeArchiveAutoFields } from "src/modules/archive/archive-sync.recompute";

export function createArchiveRestoreAutoService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const offsetMinutes = env.BUSINESS_TIMEZONE_OFFSET_MINUTES;

  async function restoreChargeFieldToAuto(
    rowId: number,
    field: ArchiveSyncAutoField,
  ): Promise<ArchiveRowDto> {
    if (!ARCHIVE_SYNC_AUTO_FIELDS.includes(field)) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "This field cannot be restored to automatic values",
        statusCode: 400,
      });
    }

    const existing = await prisma.archiveRow.findUnique({ where: { id: rowId } });
    if (!existing) throw archiveRowNotFoundError();
    if (!existing.contractId) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Only contract-linked archive rows support restore to automatic",
        statusCode: 400,
      });
    }

    const contract = await prisma.contract.findUnique({
      where: { id: existing.contractId },
      include: {
        customer: { select: { name: true, mobile: true } },
        acceptance: true,
        carOut: true,
        carIn: true,
        payments: true,
        reconciliation: { include: { lines: true } },
      },
    });
    if (!contract?.acceptance) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Contract is not eligible for archive auto values",
        statusCode: 400,
      });
    }

    const charges = await prisma.roadLiabilityCustomerCharge.findMany({
      where: { contractId: contract.id },
      include: {
        roadLiability: {
          select: {
            type: true,
            attributionStatus: true,
            attributedContractId: true,
          },
        },
      },
    });

    const auto = recomputeArchiveAutoFields({
      contractId: contract.id,
      rentalDays: contract.rentalDays,
      agreedAmount: contract.agreedAmount,
      snapshot: contract.snapshot,
      customer: contract.customer,
      carOut: contract.carOut,
      carIn: contract.carIn,
      payments: contract.payments,
      reconciliationLines: contract.reconciliation?.lines ?? [],
      roadCharges: charges,
      businessTimezoneOffsetMinutes: offsetMinutes,
      parkingForTotal: existing.parking,
      includeCustomer: true,
    });

    let overrides = setManualOverride(
      parseManualOverrides(existing.manualOverrides),
      field,
      false,
    );

    const manualCellValues = clearManualCellValue(
      parseManualCellValues(existing.manualCellValues),
      field,
    );
    const withClearedOverride: typeof existing = {
      ...existing,
      manualOverrides: serializeManualOverrides(overrides) as typeof existing.manualOverrides,
      manualCellValues: serializeManualCellValues(manualCellValues) as typeof existing.manualCellValues,
    };

    const syncPayload = buildSyncArchiveRowUpdate(
      withClearedOverride,
      auto,
      contract.payments,
    );
    const totalStillManual = isManualOverride(overrides, "total");

    const row = await prisma.archiveRow.update({
      where: { id: rowId },
      data: {
        ...syncPayload,
        total: totalStillManual ? existing.total : syncPayload.total,
        manualOverrides: serializeManualOverrides(
          overrides,
        ) as Prisma.InputJsonValue,
        manualCellValues: withClearedOverride.manualCellValues as Prisma.InputJsonValue,
      },
    });
    return toArchiveRow(row);
  }

  return { restoreChargeFieldToAuto };
}
