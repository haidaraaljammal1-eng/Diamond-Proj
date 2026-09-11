import type { FastifyInstance } from "fastify";
import type { ManualExpenseCategory } from "@prisma/client";
import { withTransaction } from "src/lib/db/transaction";
import type { AuthUser } from "src/lib/context/auth-context";
import {
  financeAttachmentNotFoundError,
  financeVehicleNotFoundError,
  manualExpenseNotActiveError,
  manualExpenseNotFoundError,
} from "src/modules/finance/finance.errors";
import {
  recordManualExpenseLedger,
  recordManualExpenseReversalLedger,
} from "src/modules/finance/finance-ledger.service";
import { toManualExpenseDetail } from "src/modules/finance/finance.mapper";

const EXPENSE_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true } },
  voidedBy: { select: { id: true, name: true, email: true } },
  vehicle: { select: { id: true, vehicleName: true, plateNumber: true } },
  attachment: {
    select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true },
  },
  correctionOfExpense: { select: { id: true } },
} as const;

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

export interface CorrectManualExpenseInput extends CreateManualExpenseInput {
  voidReason: string;
}

export function createManualExpenseService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function validateVehicle(vehicleId?: number) {
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
      await validateAttachment(input.attachmentId);

      const result = await withTransaction(prisma, async (tx) => {
        const existing = await tx.manualExpense.findUnique({ where: { id }, include: EXPENSE_INCLUDE });
        if (!existing) throw manualExpenseNotFoundError();
        if (existing.status !== "ACTIVE") throw manualExpenseNotActiveError();

        const now = new Date();
        const voided = await tx.manualExpense.update({
          where: { id },
          data: {
            status: "VOID",
            voidedAt: now,
            voidedByUserId: actor.id,
            voidReason: input.voidReason,
          },
        });
        await recordManualExpenseReversalLedger(tx, {
          id: voided.id,
          amount: voided.amount,
          voidedAt: now,
          vehicleId: voided.vehicleId,
        });

        const replacement = await tx.manualExpense.create({
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
            correctionOfExpenseId: existing.id,
            createdByUserId: actor.id,
          },
          include: EXPENSE_INCLUDE,
        });
        await recordManualExpenseLedger(tx, replacement);
        return replacement;
      });

      return toManualExpenseDetail(result);
    },
  };
}
