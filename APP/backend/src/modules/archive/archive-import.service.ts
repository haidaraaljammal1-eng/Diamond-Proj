import type { FastifyInstance } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import type { Prisma } from "@prisma/client";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { withTransaction } from "src/lib/db/transaction";
import { ARCHIVE_VEHICLE_LOCK_NS } from "src/modules/archive/archive.constants";
import {
  ArchiveImportErrorReason,
  archiveImportContractLinkError,
  archiveImportTokenError,
  invalidArchiveImportFileError,
  invalidArchiveImportWorkbookError,
  type ArchiveImportCellError,
  type ArchiveImportUnmatchedSheet,
} from "src/modules/archive/archive-import.errors";
import {
  assertSheetLayout,
  matchVehicleByHeader,
  parseArchiveImportSheetRows,
  parseVehicleHeaderCell,
  type FleetVehicleForImportMatch,
} from "src/modules/archive/archive-import.parse";
import {
  archiveExcelMetaKey,
  parseArchiveExcelMetaSheet,
} from "src/modules/archive/archive-excel-meta";
import {
  effectiveNumericField,
  parseManualCellValues,
  serializeManualCellValues,
} from "src/modules/archive/archive-manual-cell-values";
import {
  ARCHIVE_SYNC_AUTO_FIELDS,
  effectiveChargeSnapshot,
  isManualOverride,
  mergeImportManualOverrides,
  serializeManualOverrides,
} from "src/modules/archive/archive-manual-overrides";
import { computeArchiveCashVisa } from "src/modules/archive/archive-payment-allocation";
import { archiveTotalFromCharges } from "src/modules/archive/archive-row-total";
import { ARCHIVE_EXCEL_META_SHEET_NAME } from "src/modules/archive/archive-sync.constants";
import {
  consumeArchiveImportSession,
  createArchiveImportSession,
} from "src/modules/archive/archive-import.session";
import type { ArchiveImportPreviewDto } from "src/modules/archive/archive-import.schema";
import type {
  ArchiveImportPreparedVehicle,
  ArchiveImportRowData,
} from "src/modules/archive/archive-import.types";
import type { z } from "zod";
import { toArchiveVehicle } from "src/modules/archive/archive.mapper";
import type { CreateArchiveRowSchema } from "src/modules/archive/archive.schema";

const ARCHIVE_MANUAL_FIELD_KEYS = [
  "kmIn",
  "km",
  "kmOut",
  "deliveryDate",
  "deliveryTime",
  "returnDate",
  "returnTime",
  "customerName",
  "customerPhone",
  "description",
  "days",
  "dailyRate",
  "rentalTotal",
  "salik",
  "parking",
  "fuel",
  "blackPoints",
  "fines",
  "total",
  "dollar",
  "cash",
  "visa",
  "transfer",
  "remaining",
] as const satisfies ReadonlyArray<keyof z.infer<typeof CreateArchiveRowSchema>>;

function pickArchiveManualFields(
  body: ArchiveImportRowData,
): Prisma.ArchiveRowUncheckedUpdateInput {
  const data = {} as Prisma.ArchiveRowUncheckedUpdateInput;
  for (const key of ARCHIVE_MANUAL_FIELD_KEYS) {
    const value = body[key];
    if (value !== undefined) {
      (data as Record<string, unknown>)[key] = value;
    }
  }
  return data;
}

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const ARCHIVE_VEHICLE_SELECT = {
  id: true,
  vehicleName: true,
  plateNumber: true,
  modelYear: true,
  model: { select: { name: true } },
  isActive: true,
} satisfies Prisma.VehicleSelect;

function isXlsxUpload(file: MultipartFile): boolean {
  const name = file.filename?.toLowerCase() ?? "";
  if (name.endsWith(".xlsx")) return true;
  const mime = file.mimetype?.toLowerCase() ?? "";
  return mime === XLSX_MIME || mime === "application/octet-stream";
}

async function readUploadBuffer(file: MultipartFile): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of file.file) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function createArchiveImportService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function loadFleetForImport(): Promise<FleetVehicleForImportMatch[]> {
    const rows = await prisma.vehicle.findMany({
      where: { isActive: true },
      select: ARCHIVE_VEHICLE_SELECT,
      orderBy: [{ vehicleName: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => {
      const dto = toArchiveVehicle(row);
      return {
        id: dto.id,
        displayName: dto.displayName,
        plateNumber: dto.plateNumber,
      };
    });
  }

  async function countExistingRows(vehicleIds: number[]): Promise<Map<number, number>> {
    if (vehicleIds.length === 0) return new Map();
    const grouped = await prisma.archiveRow.groupBy({
      by: ["vehicleId"],
      where: { vehicleId: { in: vehicleIds } },
      _count: { _all: true },
    });
    const map = new Map<number, number>();
    for (const entry of grouped) {
      map.set(entry.vehicleId, entry._count._all);
    }
    return map;
  }

  async function previewUpload(
    file: MultipartFile,
    userId: number,
  ): Promise<ArchiveImportPreviewDto> {
    if (!isXlsxUpload(file)) {
      throw invalidArchiveImportFileError("Only .xlsx Diamond Archive workbooks are supported");
    }

    const filename = file.filename ?? "import.xlsx";
    const buffer = await readUploadBuffer(file);
    if (buffer.length === 0) {
      throw invalidArchiveImportWorkbookError("Workbook is empty");
    }

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(
        buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
      );
    } catch {
      throw invalidArchiveImportWorkbookError("Invalid XLSX file");
    }

    const metaByVehicleRow = parseArchiveExcelMetaSheet(workbook);
    const worksheets = workbook.worksheets.filter(
      (ws) => ws.rowCount > 0 && ws.name !== ARCHIVE_EXCEL_META_SHEET_NAME,
    );
    if (worksheets.length === 0) {
      throw invalidArchiveImportWorkbookError("Workbook has no worksheets");
    }

    const fleet = await loadFleetForImport();
    const errors: ArchiveImportCellError[] = [];
    const unmatchedSheets: ArchiveImportUnmatchedSheet[] = [];
    const prepared: ArchiveImportPreparedVehicle[] = [];
    const matchedVehicleIds = new Set<number>();
    const matchedPreviews: ArchiveImportPreviewDto["matchedVehicles"] = [];

    for (const ws of worksheets) {
      const sheetName = ws.name;
      try {
        assertSheetLayout(ws);
      } catch (error) {
        unmatchedSheets.push({
          sheetName,
          headerText: parseVehicleHeaderCell(ws.getCell("A1").value)?.displayName ?? null,
          reason:
            error instanceof Error ? error.message : "Sheet layout is not a Diamond Archive export",
        });
        continue;
      }

      const headerCell = ws.getCell("A1").value;
      const parsedHeader = parseVehicleHeaderCell(headerCell);
      if (!parsedHeader) {
        unmatchedSheets.push({
          sheetName,
          headerText: null,
          reason: "Missing vehicle header in row 1",
        });
        continue;
      }

      const match = matchVehicleByHeader(parsedHeader, fleet);
      if (match.kind === "ambiguous") {
        unmatchedSheets.push({
          sheetName,
          headerText: parsedHeader.plateNumber ?? parsedHeader.displayName,
          reason: ArchiveImportErrorReason.AMBIGUOUS_VEHICLE,
        });
        continue;
      }
      if (match.kind === "unmatched") {
        unmatchedSheets.push({
          sheetName,
          headerText: parsedHeader.plateNumber ?? parsedHeader.displayName,
          reason: "No matching active fleet vehicle for plate",
        });
        continue;
      }

      const vehicle = match.vehicle;
      if (matchedVehicleIds.has(vehicle.id)) {
        errors.push({
          sheetName,
          vehiclePlate: vehicle.plateNumber,
          row: 1,
          column: "vehicle",
          value: vehicle.plateNumber ?? vehicle.displayName,
          reason: ArchiveImportErrorReason.DUPLICATE_VEHICLE_SHEET,
        });
        continue;
      }

      const { rows, errors: rowErrors } = parseArchiveImportSheetRows(
        ws,
        sheetName,
        vehicle.plateNumber,
      );
      errors.push(...rowErrors);
      matchedVehicleIds.add(vehicle.id);
      const contractIds = rows.map((_, index) => {
        const key = archiveExcelMetaKey(vehicle.id, index + 1);
        return metaByVehicleRow.get(key)?.contractId ?? null;
      });
      const manualOverridesByRow = rows.map((_, index) => {
        const key = archiveExcelMetaKey(vehicle.id, index + 1);
        const entry = metaByVehicleRow.get(key);
        return entry ? entry.manualOverrides : undefined;
      });
      const manualCellValuesByRow = rows.map((_, index) => {
        const key = archiveExcelMetaKey(vehicle.id, index + 1);
        const entry = metaByVehicleRow.get(key);
        return entry?.manualCellValues;
      });
      prepared.push({
        vehicleId: vehicle.id,
        sheetName,
        rows,
        contractIds,
        manualOverridesByRow,
        manualCellValuesByRow,
      });
      matchedPreviews.push({
        vehicleId: vehicle.id,
        displayName: vehicle.displayName,
        plateNumber: vehicle.plateNumber,
        sheetName,
        existingRowCount: 0,
        importRowCount: rows.length,
      });
    }

    const existingCounts = await countExistingRows(prepared.map((p) => p.vehicleId));
    for (const preview of matchedPreviews) {
      preview.existingRowCount = existingCounts.get(preview.vehicleId) ?? 0;
    }

    const totalValidRows = prepared.reduce((sum, entry) => sum + entry.rows.length, 0);
    const canConfirm = errors.length === 0 && prepared.length > 0;
    let importToken: string | null = null;
    if (canConfirm) {
      importToken = createArchiveImportSession(userId, filename, prepared);
    }

    return {
      filename,
      canConfirm,
      importToken,
      summary: {
        totalSheets: worksheets.length,
        matchedVehicleCount: prepared.length,
        unmatchedSheetCount: unmatchedSheets.length,
        totalValidRows,
        totalErrorCount: errors.length,
      },
      matchedVehicles: matchedPreviews,
      unmatchedSheets,
      errors,
    };
  }

  async function confirmImport(
    importToken: string,
    userId: number,
  ): Promise<{ filename: string; matchedVehicleCount: number; importedRowCount: number }> {
    const session = consumeArchiveImportSession(importToken, userId);
    if (!session) {
      throw archiveImportTokenError(ArchiveImportErrorReason.IMPORT_TOKEN_INVALID);
    }

    const fleetIds = new Set((await loadFleetForImport()).map((v) => v.id));
    for (const vehicle of session.vehicles) {
      if (!fleetIds.has(vehicle.vehicleId)) {
        throw archiveImportTokenError(ArchiveImportErrorReason.IMPORT_TOKEN_INVALID);
      }
    }

    let importedRowCount = 0;

    for (const vehicle of session.vehicles) {
      const linked = await prisma.archiveRow.findMany({
        where: { vehicleId: vehicle.vehicleId, contractId: { not: null } },
        select: { rowOrder: true, contractId: true },
      });
      if (linked.length > 0) {
        const hasMeta = vehicle.contractIds.some((id) => id != null);
        if (!hasMeta) {
          throw archiveImportContractLinkError(
            ArchiveImportErrorReason.CONTRACT_LINK_METADATA_REQUIRED,
            "Re-export the archive from Diamond before importing so contract links are preserved",
          );
        }
        for (const existing of linked) {
          const importedContractId = vehicle.contractIds[existing.rowOrder - 1] ?? null;
          if (importedContractId !== existing.contractId) {
            throw archiveImportContractLinkError(
              ArchiveImportErrorReason.CONTRACT_LINK_MISMATCH,
              "Import would break contract-linked archive rows. Use a fresh export from Diamond",
            );
          }
        }
      }
    }

    const contractIds = [
      ...new Set(
        session.vehicles.flatMap((v) =>
          v.contractIds.filter((id): id is string => id != null),
        ),
      ),
    ];
    const paymentsByContract = new Map<string, Awaited<ReturnType<typeof prisma.contractPayment.findMany>>>();
    if (contractIds.length > 0) {
      const allPayments = await prisma.contractPayment.findMany({
        where: { contractId: { in: contractIds } },
      });
      for (const p of allPayments) {
        const list = paymentsByContract.get(p.contractId) ?? [];
        list.push(p);
        paymentsByContract.set(p.contractId, list);
      }
    }

    await withTransaction(prisma, async (tx) => {
      for (const vehicle of session.vehicles) {
        await acquireAdvisoryLock(tx, ARCHIVE_VEHICLE_LOCK_NS, vehicle.vehicleId);
        const existingRows = await tx.archiveRow.findMany({
          where: { vehicleId: vehicle.vehicleId },
        });
        const existingByOrder = new Map(existingRows.map((r) => [r.rowOrder, r]));

        await tx.archiveRow.deleteMany({ where: { vehicleId: vehicle.vehicleId } });
        let rowOrder = 1;
        for (const row of vehicle.rows) {
          const contractId = vehicle.contractIds[rowOrder - 1] ?? null;
          const prev = existingByOrder.get(rowOrder) ?? null;
          const metaOverrides = vehicle.manualOverridesByRow[rowOrder - 1];
          const metaManualValues = vehicle.manualCellValuesByRow[rowOrder - 1];
          const importedSync = {} as Record<
            (typeof ARCHIVE_SYNC_AUTO_FIELDS)[number],
            unknown
          >;
          for (const field of ARCHIVE_SYNC_AUTO_FIELDS) {
            importedSync[field] = row[field] ?? null;
          }
          const manualOverrides = mergeImportManualOverrides(
            contractId,
            prev,
            importedSync as Parameters<typeof mergeImportManualOverrides>[2],
            metaOverrides,
          );
          const mergedManualCellValues = {
            ...parseManualCellValues(metaManualValues),
            ...parseManualCellValues(row.manualCellValues),
          };
          const chargeRow = {
            ...(prev ?? {}),
            ...row,
            manualCellValues: serializeManualCellValues(mergedManualCellValues),
          } as Parameters<typeof effectiveChargeSnapshot>[0] & {
            rentalTotal: number | null;
            manualCellValues: unknown;
          };
          const total = isManualOverride(manualOverrides, "total")
            ? (row.total ?? null)
            : archiveTotalFromCharges(effectiveChargeSnapshot(chargeRow));
          let cash = row.cash ?? null;
          let visa = row.visa ?? null;
          if (contractId) {
            const payments = paymentsByContract.get(contractId) ?? [];
            const ledger = computeArchiveCashVisa(payments, {
              effectiveRentalTotal: effectiveNumericField(chargeRow, "rentalTotal"),
              extrasTotal: total,
            });
            if (!isManualOverride(manualOverrides, "cash")) cash = ledger.cash;
            if (!isManualOverride(manualOverrides, "visa")) visa = ledger.visa;
          }
          await tx.archiveRow.create({
            data: {
              vehicleId: vehicle.vehicleId,
              rowOrder,
              contractId,
              ...row,
              total,
              cash,
              visa,
              manualOverrides: serializeManualOverrides(manualOverrides),
              manualCellValues: serializeManualCellValues(mergedManualCellValues),
            } as Prisma.ArchiveRowUncheckedCreateInput,
          });
          rowOrder += 1;
          importedRowCount += 1;
        }
      }
    });

    return {
      filename: session.filename,
      matchedVehicleCount: session.vehicles.length,
      importedRowCount,
    };
  }

  return { previewUpload, confirmImport };
}
