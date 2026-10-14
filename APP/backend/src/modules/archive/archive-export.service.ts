import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import { addArchiveVehicleWorksheet } from "src/modules/archive/archive-excel";
import {
  appendArchiveExcelMetaSheet,
  type ArchiveExcelMetaRow,
} from "src/modules/archive/archive-excel-meta";
import { parseManualCellValues } from "src/modules/archive/archive-manual-cell-values";
import { parseManualOverrides } from "src/modules/archive/archive-manual-overrides";
import { buildArchiveSheetNames } from "src/modules/archive/archive-sheet-names";

const ARCHIVE_VEHICLE_SELECT = {
  id: true,
  vehicleName: true,
  plateNumber: true,
  modelYear: true,
  model: { select: { name: true } },
} satisfies Prisma.VehicleSelect;

export function createArchiveExportService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function exportWorkbook(): Promise<Buffer> {
    const vehicles = await prisma.vehicle.findMany({
      where: { isActive: true },
      select: ARCHIVE_VEHICLE_SELECT,
      orderBy: [{ vehicleName: "asc" }, { id: "asc" }],
    });

    const vehicleIds = vehicles.map((vehicle) => vehicle.id);
    const archiveRows = vehicleIds.length
      ? await prisma.archiveRow.findMany({
          where: { vehicleId: { in: vehicleIds } },
          orderBy: [{ vehicleId: "asc" }, { rowOrder: "asc" }],
        })
      : [];

    const rowsByVehicle = new Map<number, typeof archiveRows>();
    for (const row of archiveRows) {
      const bucket = rowsByVehicle.get(row.vehicleId);
      if (bucket) bucket.push(row);
      else rowsByVehicle.set(row.vehicleId, [row]);
    }

    const sheetVehicles = vehicles.map((vehicle) => ({
      id: vehicle.id,
      displayName: vehicleDisplayName({
        vehicleName: vehicle.vehicleName,
        modelName: vehicle.model?.name ?? null,
        modelYear: vehicle.modelYear,
        plateNumber: vehicle.plateNumber,
      }),
      plateNumber: vehicle.plateNumber,
    }));

    const sheetNames = buildArchiveSheetNames(sheetVehicles);
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();

    const metaRows: ArchiveExcelMetaRow[] = [];

    for (const vehicle of sheetVehicles) {
      const vehicleRows = rowsByVehicle.get(vehicle.id) ?? [];
      addArchiveVehicleWorksheet(
        workbook,
        sheetNames.get(vehicle.id) ?? `Vehicle ${vehicle.id}`,
        vehicle,
        vehicleRows,
      );
      for (const row of vehicleRows) {
        if (row.contractId) {
          metaRows.push({
            vehicleId: row.vehicleId,
            rowOrder: row.rowOrder,
            contractId: row.contractId,
            manualOverrides: parseManualOverrides(row.manualOverrides),
            manualCellValues: parseManualCellValues(row.manualCellValues),
          });
        }
      }
    }

    if (metaRows.length > 0) {
      appendArchiveExcelMetaSheet(workbook, metaRows);
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  return { exportWorkbook };
}
