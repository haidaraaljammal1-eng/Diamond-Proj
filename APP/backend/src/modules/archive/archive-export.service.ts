import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import { addArchiveVehicleWorksheet } from "src/modules/archive/archive-excel";
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

    for (const vehicle of sheetVehicles) {
      addArchiveVehicleWorksheet(
        workbook,
        sheetNames.get(vehicle.id) ?? `Vehicle ${vehicle.id}`,
        vehicle,
        rowsByVehicle.get(vehicle.id) ?? [],
      );
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  return { exportWorkbook };
}
