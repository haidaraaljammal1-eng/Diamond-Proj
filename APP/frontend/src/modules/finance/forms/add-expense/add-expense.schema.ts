import { z } from "zod";
import type {
  CorrectManualExpensePayload,
  CreateManualExpensePayload,
  ManualExpenseCategory,
} from "../../types/finance.types";

/** Relative FormError keys — never `validation.*` prefixes. */
const required = { message: "required" as const };
const tooLong = { message: "tooLong" as const };
const wholeAed = { message: "wholeAed" as const };
const positiveAmount = { message: "positiveAmount" as const };

const wholeAedAmount = z
  .string()
  .trim()
  .min(1, required)
  .refine((value) => /^\d+$/.test(value), wholeAed)
  .refine((value) => Number(value) > 0, positiveAmount);

export const addExpenseFormSchema = z.object({
  amount: wholeAedAmount,
  category: z.string().min(1, required),
  recognizedAt: z.string().min(1, required),
  description: z.string().trim().min(1, required).max(500, tooLong),
  vehicleId: z.string().optional(),
  vendorName: z.string().trim().max(200, tooLong).optional(),
  receiptNumber: z.string().trim().max(100, tooLong).optional(),
  attachmentId: z.string().optional(),
  note: z.string().trim().max(1000, tooLong).optional(),
});

export const voidExpenseFormSchema = z.object({
  voidReason: z.string().trim().min(1, required).max(500, tooLong),
});

/** Correct Expense validates editable fields only — no void-reason field. */
export const correctExpenseFormSchema = addExpenseFormSchema;

export type AddExpenseFormValues = z.infer<typeof addExpenseFormSchema>;
export type VoidExpenseFormValues = z.infer<typeof voidExpenseFormSchema>;
export type CorrectExpenseFormValues = z.infer<typeof correctExpenseFormSchema>;

export function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const EMPTY_ADD_EXPENSE_VALUES: AddExpenseFormValues = {
  amount: "",
  category: "VEHICLE_CLEANING",
  recognizedAt: toDatetimeLocalValue(new Date().toISOString()),
  description: "",
  vehicleId: "",
  vendorName: "",
  receiptNumber: "",
  attachmentId: "",
  note: "",
};

export function toCreateManualExpensePayload(
  values: AddExpenseFormValues,
): CreateManualExpensePayload {
  const payload: CreateManualExpensePayload = {
    amount: Number(values.amount),
    category: values.category as ManualExpenseCategory,
    recognizedAt: new Date(values.recognizedAt).toISOString(),
    description: values.description.trim(),
  };
  if (values.vehicleId) payload.vehicleId = Number(values.vehicleId);
  if (values.vendorName?.trim()) payload.vendorName = values.vendorName.trim();
  if (values.receiptNumber?.trim()) payload.receiptNumber = values.receiptNumber.trim();
  if (values.attachmentId) payload.attachmentId = values.attachmentId;
  if (values.note?.trim()) payload.note = values.note.trim();
  return payload;
}

export function toCorrectManualExpensePayload(
  values: CorrectExpenseFormValues,
): CorrectManualExpensePayload {
  return {
    amount: Number(values.amount),
    category: values.category as ManualExpenseCategory,
    recognizedAt: new Date(values.recognizedAt).toISOString(),
    description: values.description.trim(),
    vehicleId: values.vehicleId ? Number(values.vehicleId) : null,
    vendorName: values.vendorName?.trim() ? values.vendorName.trim() : null,
    receiptNumber: values.receiptNumber?.trim() ? values.receiptNumber.trim() : null,
    note: values.note?.trim() ? values.note.trim() : null,
  };
}
