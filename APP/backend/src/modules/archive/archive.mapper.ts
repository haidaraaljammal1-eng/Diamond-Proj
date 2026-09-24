import type { ArchiveRow } from "@prisma/client";
import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import type { ArchiveRowDto, ArchiveVehicleDto } from "src/modules/archive/archive.schema";

type ArchiveVehicleRow = {
  id: number;
  vehicleName: string | null;
  plateNumber: string | null;
  modelYear: number | null;
  model: { name: string } | null;
};

export function toArchiveVehicle(row: ArchiveVehicleRow): ArchiveVehicleDto {
  return {
    id: row.id,
    displayName: vehicleDisplayName({
      vehicleName: row.vehicleName,
      modelName: row.model?.name ?? null,
      modelYear: row.modelYear,
      plateNumber: row.plateNumber,
    }),
    plateNumber: row.plateNumber,
  };
}

export function toArchiveRow(row: ArchiveRow): ArchiveRowDto {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    rowOrder: row.rowOrder,
    kmIn: row.kmIn,
    km: row.km,
    kmOut: row.kmOut,
    deliveryDate: row.deliveryDate,
    deliveryTime: row.deliveryTime,
    returnDate: row.returnDate,
    returnTime: row.returnTime,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    description: row.description,
    days: row.days,
    dailyRate: row.dailyRate,
    rentalTotal: row.rentalTotal,
    salik: row.salik,
    parking: row.parking,
    fuel: row.fuel,
    blackPoints: row.blackPoints,
    fines: row.fines,
    total: row.total,
    dollar: row.dollar,
    cash: row.cash,
    visa: row.visa,
    transfer: row.transfer,
    remaining: row.remaining,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
