import { z } from "zod";
import { ARCHIVE_EDITABLE_FIELDS } from "src/modules/archive/archive-manual-cell-values.fields";
import { ARCHIVE_SYNC_AUTO_FIELDS } from "src/modules/archive/archive-manual-overrides";

/** Local wall-clock time label (HH:mm). */
const ArchiveTime = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm");

const Mileage = z.number().int().nonnegative().max(9_999_999);
const Days = z.number().int().nonnegative().max(9_999);
const Money = z.number().int().nonnegative().max(999_999_999);
/** Damage amount (stored in `blackPoints` column). Same whole-AED bounds as other money fields. */
const BlackPoints = Money;
const CustomerName = z.string().trim().min(1).max(200);
const CustomerPhone = z.string().trim().min(1).max(40);
const Description = z.string().trim().min(1).max(4000);

const archiveFieldShape = {
  kmIn: Mileage.nullable().optional(),
  km: Mileage.nullable().optional(),
  kmOut: Mileage.nullable().optional(),
  deliveryDate: z.coerce.date().nullable().optional(),
  deliveryTime: ArchiveTime.nullable().optional(),
  returnDate: z.coerce.date().nullable().optional(),
  returnTime: ArchiveTime.nullable().optional(),
  customerName: CustomerName.nullable().optional(),
  customerPhone: CustomerPhone.nullable().optional(),
  description: Description.nullable().optional(),
  days: Days.nullable().optional(),
  dailyRate: Money.nullable().optional(),
  rentalTotal: Money.nullable().optional(),
  salik: Money.nullable().optional(),
  parking: Money.nullable().optional(),
  fuel: Money.nullable().optional(),
  blackPoints: BlackPoints.nullable().optional(),
  fines: Money.nullable().optional(),
  total: Money.nullable().optional(),
  dollar: Money.nullable().optional(),
  cash: Money.nullable().optional(),
  visa: Money.nullable().optional(),
  transfer: Money.nullable().optional(),
  remaining: Money.nullable().optional(),
};

const manualOverrideFieldShape = Object.fromEntries(
  ARCHIVE_SYNC_AUTO_FIELDS.map((field) => [field, z.boolean().optional()]),
) as { [K in (typeof ARCHIVE_SYNC_AUTO_FIELDS)[number]]: z.ZodOptional<z.ZodBoolean> };

export const ArchiveManualOverridesSchema = z.object(manualOverrideFieldShape).partial();
export type ArchiveManualOverridesDto = z.infer<typeof ArchiveManualOverridesSchema>;

const manualCellValueFieldShape = Object.fromEntries(
  ARCHIVE_EDITABLE_FIELDS.map((field) => [field, z.string().optional()]),
) as { [K in (typeof ARCHIVE_EDITABLE_FIELDS)[number]]: z.ZodOptional<z.ZodString> };

export const ArchiveManualCellValuesSchema = z.object(manualCellValueFieldShape).partial();
export type ArchiveManualCellValuesDto = z.infer<typeof ArchiveManualCellValuesSchema>;

const FlexibleArchiveCellValue = z.union([z.string(), z.number(), z.null()]);
const flexibleArchiveUpdateShape = Object.fromEntries(
  ARCHIVE_EDITABLE_FIELDS.map((field) => [field, FlexibleArchiveCellValue.optional()]),
) as {
  [K in (typeof ARCHIVE_EDITABLE_FIELDS)[number]]: z.ZodOptional<
    z.ZodUnion<[z.ZodString, z.ZodNumber, z.ZodNull]>
  >;
};

export const ArchiveVehicleSchema = z.object({
  id: z.number().int(),
  displayName: z.string(),
  plateNumber: z.string().nullable(),
});
export type ArchiveVehicleDto = z.infer<typeof ArchiveVehicleSchema>;

export const ArchiveRowSchema = z.object({
  id: z.number().int(),
  vehicleId: z.number().int(),
  rowOrder: z.number().int(),
  kmIn: z.number().int().nullable(),
  km: z.number().int().nullable(),
  kmOut: z.number().int().nullable(),
  deliveryDate: z.date().nullable(),
  deliveryTime: z.string().nullable(),
  returnDate: z.date().nullable(),
  returnTime: z.string().nullable(),
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
  description: z.string().nullable(),
  days: z.number().int().nullable(),
  dailyRate: z.number().int().nullable(),
  rentalTotal: z.number().int().nullable(),
  salik: z.number().int().nullable(),
  parking: z.number().int().nullable(),
  fuel: z.number().int().nullable(),
  blackPoints: z.number().int().nullable(),
  fines: z.number().int().nullable(),
  total: z.number().int().nullable(),
  dollar: z.number().int().nullable(),
  cash: z.number().int().nullable(),
  visa: z.number().int().nullable(),
  transfer: z.number().int().nullable(),
  remaining: z.number().int().nullable(),
  manualOverrides: ArchiveManualOverridesSchema,
  manualCellValues: ArchiveManualCellValuesSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ArchiveRowDto = z.infer<typeof ArchiveRowSchema>;

export const ArchiveVehicleIdParam = z.object({
  vehicleId: z.coerce.number().int().positive(),
});

export const ArchiveRowIdParam = z.object({
  rowId: z.coerce.number().int().positive(),
});

export const CreateArchiveRowSchema = z
  .object(archiveFieldShape)
  .strict()
  .optional()
  .default({});

export const UpdateArchiveRowSchema = z
  .object(flexibleArchiveUpdateShape)
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field is required",
  });

export const RestoreArchiveChargeFieldSchema = z.object({
  field: z.enum(ARCHIVE_SYNC_AUTO_FIELDS),
});
