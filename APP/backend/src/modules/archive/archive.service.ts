import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { withTransaction } from "src/lib/db/transaction";
import { ARCHIVE_VEHICLE_LOCK_NS } from "src/modules/archive/archive.constants";
import {
  archiveRowNotFoundError,
  vehicleNotFoundError,
} from "src/modules/archive/archive.errors";
import { buildFlexibleArchivePatch } from "src/modules/archive/archive-manual-cell-values";
import {
  ARCHIVE_SYNC_AUTO_FIELDS,
  type ArchiveSyncAutoField,
  parseManualOverrides,
  serializeManualOverrides,
  isManualOverride,
  paymentLedgerAfterPatch,
  setManualOverride,
  shouldRecalculatePaymentLedgerAfterPatch,
  shouldRecalculateTotalAfterPatch,
  totalAfterPatch,
} from "src/modules/archive/archive-manual-overrides";
import { toArchiveRow, toArchiveVehicle } from "src/modules/archive/archive.mapper";
import type {
  ArchiveRowDto,
  ArchiveVehicleDto,
  CreateArchiveRowSchema,
  UpdateArchiveRowSchema,
} from "src/modules/archive/archive.schema";

type CreateBody = z.infer<typeof CreateArchiveRowSchema>;
type UpdateBody = z.infer<typeof UpdateArchiveRowSchema>;

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
] as const satisfies ReadonlyArray<keyof UpdateBody>;

const ARCHIVE_VEHICLE_SELECT = {
  id: true,
  vehicleName: true,
  plateNumber: true,
  modelYear: true,
  model: { select: { name: true } },
} satisfies Prisma.VehicleSelect;

function pickArchiveManualFields(
  body: Partial<CreateBody | UpdateBody>,
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

export function createArchiveService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function assertVehicleExists(vehicleId: number): Promise<void> {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true },
    });
    if (!vehicle) throw vehicleNotFoundError();
  }

  async function listFleetVehicles(): Promise<ArchiveVehicleDto[]> {
    const rows = await prisma.vehicle.findMany({
      where: { isActive: true },
      select: ARCHIVE_VEHICLE_SELECT,
      orderBy: [{ vehicleName: "asc" }, { id: "asc" }],
    });
    return rows.map(toArchiveVehicle);
  }

  async function listRows(vehicleId: number): Promise<ArchiveRowDto[]> {
    await assertVehicleExists(vehicleId);
    const rows = await prisma.archiveRow.findMany({
      where: { vehicleId },
      orderBy: { rowOrder: "asc" },
    });
    return rows.map(toArchiveRow);
  }

  async function createRow(vehicleId: number, body: CreateBody = {}): Promise<ArchiveRowDto> {
    const row = await withTransaction(prisma, async (tx) => {
      const vehicle = await tx.vehicle.findUnique({
        where: { id: vehicleId },
        select: { id: true },
      });
      if (!vehicle) throw vehicleNotFoundError();

      await acquireAdvisoryLock(tx, ARCHIVE_VEHICLE_LOCK_NS, vehicleId);
      const max = await tx.archiveRow.aggregate({
        where: { vehicleId },
        _max: { rowOrder: true },
      });
      const rowOrder = (max._max.rowOrder ?? 0) + 1;

      return tx.archiveRow.create({
        data: {
          vehicleId,
          rowOrder,
          ...(pickArchiveManualFields(body) as Omit<
            Prisma.ArchiveRowUncheckedCreateInput,
            "vehicleId" | "rowOrder"
          >),
        },
      });
    });
    return toArchiveRow(row);
  }

  async function updateRow(rowId: number, body: UpdateBody): Promise<ArchiveRowDto> {
    const existing = await prisma.archiveRow.findUnique({ where: { id: rowId } });
    if (!existing) throw archiveRowNotFoundError();

    const flexible = buildFlexibleArchivePatch(existing, body);
    const data = flexible.data;
    let overrides = parseManualOverrides(existing.manualOverrides);
    const syncAutoTouched = flexible.patchedFields.some((field) =>
      (ARCHIVE_SYNC_AUTO_FIELDS as readonly string[]).includes(field),
    );
    if (syncAutoTouched) {
      for (const field of flexible.patchedFields) {
        if ((ARCHIVE_SYNC_AUTO_FIELDS as readonly string[]).includes(field)) {
          overrides = setManualOverride(overrides, field as ArchiveSyncAutoField, true);
        }
      }
      data.manualOverrides = serializeManualOverrides(overrides);
    }
    if (shouldRecalculateTotalAfterPatch(overrides, body, flexible.chargeComponentTouched)) {
      data.total = totalAfterPatch(existing, data);
    }
    if (
      existing.contractId &&
      shouldRecalculatePaymentLedgerAfterPatch(overrides, body, {
        chargeComponentTouched: flexible.chargeComponentTouched,
        rentalOrTotalTouched: flexible.rentalOrTotalTouched,
      })
    ) {
      const payments = await prisma.contractPayment.findMany({
        where: { contractId: existing.contractId },
      });
      const ledger = paymentLedgerAfterPatch(existing, data, payments);
      if (!isManualOverride(overrides, "cash")) data.cash = ledger.cash;
      if (!isManualOverride(overrides, "visa")) data.visa = ledger.visa;
    }

    const row = await prisma.archiveRow.update({
      where: { id: rowId },
      data,
    });
    return toArchiveRow(row);
  }

  async function deleteRow(rowId: number): Promise<void> {
    const existing = await prisma.archiveRow.findUnique({ where: { id: rowId } });
    if (!existing) throw archiveRowNotFoundError();
    await prisma.archiveRow.delete({ where: { id: rowId } });
  }

  return {
    listFleetVehicles,
    listRows,
    createRow,
    updateRow,
    deleteRow,
  };
}
