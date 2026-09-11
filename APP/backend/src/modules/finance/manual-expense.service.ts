import type { FastifyInstance } from "fastify";
import type { ManualExpenseCategory, Prisma } from "@prisma/client";
import { withTransaction } from "src/lib/db/transaction";
import type { AuthUser } from "src/lib/context/auth-context";
import {
  financeAttachmentNotFoundError,
  financeVehicleNotFoundError,
  manualExpenseNoChangesError,
  manualExpenseNotActiveError,
  manualExpenseNotFoundError,
} from "src/modules/finance/finance.errors";
import {
  recordManualExpenseLedger,
  recordManualExpenseReversalLedger,
  reprojectManualExpenseLedger,
} from "src/modules/finance/finance-ledger.service";
import { toManualExpenseDetail } from "src/modules/finance/finance.mapper";

const STAFF_SELECT = { id: true, name: true, email: true } as const;
const VEHICLE_SELECT = { id: true, vehicleName: true, plateNumber: true } as const;

const EXPENSE_INCLUDE = {
  createdBy: { select: STAFF_SELECT },
  voidedBy: { select: STAFF_SELECT },
  vehicle: { select: VEHICLE_SELECT },
  attachment: {
    select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true },
  },
  correctionOfExpense: { select: { id: true } },
  revisions: {
    orderBy: { changedAt: "desc" as const },
    include: { changedBy: { select: STAFF_SELECT } },
  },
} as const;

type VehicleSnap = { id: number; vehicleName: string | null; plateNumber: string | null } | null;

export interface CreateManualExpenseInput {
  amount: number;
  category: ManualExpenseCategory;
  recognizedAt: Date;
  description: string;
  vehicleId?: number;
  vendorName?: string;
  receiptNumber?: string;
  attachmentId?: string;
  note?: string;
}

export interface CorrectManualExpenseInput {
  amount: number;
  category: ManualExpenseCategory;
  recognizedAt: Date;
  description: string;
  vehicleId?: number | null;
  vendorName?: string | null;
  receiptNumber?: string | null;
  note?: string | null;
}

function sameRecognizedAt(left: Date, right: Date): boolean {
  return Math.floor(left.getTime() / 60_000) === Math.floor(right.getTime() / 60_000);
}

function nextOptional<T>(incoming: T | undefined, current: T): T {
  return incoming === undefined ? current : incoming;
}

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function createManualExpenseService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function validateVehicle(vehicleId?: number | null) {
    if (vehicleId == null) return;
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw financeVehicleNotFoundError();
  }

  async function validateAttachment(attachmentId?: string) {
    if (!attachmentId) return;
    const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) throw financeAttachmentNotFoundError();
  }

  async function getExpenseOrThrow(id: string) {
    const expense = await prisma.manualExpense.findUnique({
      where: { id },
      include: EXPENSE_INCLUDE,
    });
    if (!expense) throw manualExpenseNotFoundError();
    return expense;
  }

  return {
    async create(input: CreateManualExpenseInput, actor: AuthUser) {
      await validateVehicle(input.vehicleId);
      await validateAttachment(input.attachmentId);

      const expense = await withTransaction(prisma, async (tx) => {
        const created = await tx.manualExpense.create({
          data: {
            amount: input.amount,
            category: input.category,
            recognizedAt: input.recognizedAt,
            description: input.description,
            vehicleId: input.vehicleId ?? null,
            vendorName: input.vendorName ?? null,
            receiptNumber: input.receiptNumber ?? null,
            attachmentId: input.attachmentId ?? null,
            note: input.note ?? null,
            createdByUserId: actor.id,
          },
          include: EXPENSE_INCLUDE,
        });
        await recordManualExpenseLedger(tx, created);
        return created;
      });

      return toManualExpenseDetail(expense);
    },

    async get(id: string) {
      const expense = await getExpenseOrThrow(id);
      return toManualExpenseDetail(expense);
    },

    async void(id: string, voidReason: string, actor: AuthUser) {
      const expense = await withTransaction(prisma, async (tx) => {
        const existing = await tx.manualExpense.findUnique({ where: { id }, include: EXPENSE_INCLUDE });
        if (!existing) throw manualExpenseNotFoundError();
        if (existing.status === "VOID") return existing;

        const now = new Date();
        const updated = await tx.manualExpense.update({
          where: { id },
          data: {
            status: "VOID",
            voidedAt: now,
            voidedByUserId: actor.id,
            voidReason,
          },
          include: EXPENSE_INCLUDE,
        });
        await recordManualExpenseReversalLedger(tx, {
          id: updated.id,
          amount: updated.amount,
          voidedAt: now,
          vehicleId: updated.vehicleId,
        });
        return updated;
      });

      return toManualExpenseDetail(expense);
    },

    async correct(id: string, input: CorrectManualExpenseInput, actor: AuthUser) {
      await validateVehicle(input.vehicleId);

      const result = await withTransaction(prisma, async (tx) => {
        const existing = await tx.manualExpense.findUnique({
          where: { id },
          include: EXPENSE_INCLUDE,
        });
        if (!existing) throw manualExpenseNotFoundError();
        if (existing.status !== "ACTIVE") throw manualExpenseNotActiveError();

        const nextAmount = input.amount;
        const nextCategory = input.category;
        const nextRecognizedAt = sameRecognizedAt(input.recognizedAt, existing.recognizedAt)
          ? existing.recognizedAt
          : input.recognizedAt;
        const nextDescription = input.description;
        const nextVehicleId = nextOptional(input.vehicleId, existing.vehicleId);
        const nextVendorName = nextOptional(textOrNull(input.vendorName), existing.vendorName);
        const nextReceiptNumber = nextOptional(textOrNull(input.receiptNumber), existing.receiptNumber);
        const nextNote = nextOptional(textOrNull(input.note), existing.note);

        let nextVehicle: VehicleSnap = existing.vehicle;
        if (nextVehicleId !== existing.vehicleId) {
          nextVehicle =
            nextVehicleId == null
              ? null
              : await tx.vehicle.findUnique({
                  where: { id: nextVehicleId },
                  select: VEHICLE_SELECT,
                });
          if (nextVehicleId != null && !nextVehicle) throw financeVehicleNotFoundError();
        }

        const changes: Record<string, { before: unknown; after: unknown }> = {};
        if (nextAmount !== existing.amount) {
          changes.amount = { before: existing.amount, after: nextAmount };
        }
        if (nextCategory !== existing.category) {
          changes.category = { before: existing.category, after: nextCategory };
        }
        if (nextRecognizedAt.getTime() !== existing.recognizedAt.getTime()) {
          changes.recognizedAt = {
            before: existing.recognizedAt.toISOString(),
            after: nextRecognizedAt.toISOString(),
          };
        }
        if (nextDescription !== existing.description) {
          changes.description = { before: existing.description, after: nextDescription };
        }
        if (nextVehicleId !== existing.vehicleId) {
          changes.vehicle = { before: existing.vehicle, after: nextVehicle };
        }
        if (nextVendorName !== existing.vendorName) {
          changes.vendorName = { before: existing.vendorName, after: nextVendorName };
        }
        if (nextReceiptNumber !== existing.receiptNumber) {
          changes.receiptNumber = { before: existing.receiptNumber, after: nextReceiptNumber };
        }
        if (nextNote !== existing.note) {
          changes.note = { before: existing.note, after: nextNote };
        }

        if (Object.keys(changes).length === 0) {
          throw manualExpenseNoChangesError();
        }

        const data: Prisma.ManualExpenseUpdateInput = {};
        if (changes.amount) data.amount = nextAmount;
        if (changes.category) data.category = nextCategory;
        if (changes.recognizedAt) data.recognizedAt = nextRecognizedAt;
        if (changes.description) data.description = nextDescription;
        if (changes.vehicle) {
          data.vehicle = nextVehicleId == null ? { disconnect: true } : { connect: { id: nextVehicleId } };
        }
        if (changes.vendorName) data.vendorName = nextVendorName;
        if (changes.receiptNumber) data.receiptNumber = nextReceiptNumber;
        if (changes.note) data.note = nextNote;

        const updated = await tx.manualExpense.update({
          where: { id },
          data,
          include: EXPENSE_INCLUDE,
        });

        if (changes.amount || changes.recognizedAt || changes.vehicle) {
          await reprojectManualExpenseLedger(tx, {
            id: updated.id,
            amount: updated.amount,
            recognizedAt: updated.recognizedAt,
            vehicleId: updated.vehicleId,
          });
        }

        await tx.manualExpenseRevision.create({
          data: {
            manualExpenseId: updated.id,
            changedByUserId: actor.id,
            changes: changes as Prisma.InputJsonValue,
          },
        });

        const withHistory = await tx.manualExpense.findUniqueOrThrow({
          where: { id: updated.id },
          include: EXPENSE_INCLUDE,
        });
        return withHistory;
      });

      return toManualExpenseDetail(result);
    },
  };
}
