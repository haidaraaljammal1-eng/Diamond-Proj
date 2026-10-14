import { z } from "zod";

export const ArchiveImportCellErrorSchema = z.object({
  sheetName: z.string(),
  vehiclePlate: z.string().nullable(),
  row: z.number().int(),
  column: z.string(),
  value: z.string(),
  reason: z.string(),
});

export const ArchiveImportUnmatchedSheetSchema = z.object({
  sheetName: z.string(),
  headerText: z.string().nullable(),
  reason: z.string(),
});

export const ArchiveImportMatchedVehiclePreviewSchema = z.object({
  vehicleId: z.number().int(),
  displayName: z.string(),
  plateNumber: z.string().nullable(),
  sheetName: z.string(),
  existingRowCount: z.number().int(),
  importRowCount: z.number().int(),
});

export const ArchiveImportPreviewSchema = z.object({
  filename: z.string(),
  canConfirm: z.boolean(),
  importToken: z.string().uuid().nullable(),
  summary: z.object({
    totalSheets: z.number().int(),
    matchedVehicleCount: z.number().int(),
    unmatchedSheetCount: z.number().int(),
    totalValidRows: z.number().int(),
    totalErrorCount: z.number().int(),
  }),
  matchedVehicles: ArchiveImportMatchedVehiclePreviewSchema.array(),
  unmatchedSheets: ArchiveImportUnmatchedSheetSchema.array(),
  errors: ArchiveImportCellErrorSchema.array(),
});

export type ArchiveImportPreviewDto = z.infer<typeof ArchiveImportPreviewSchema>;

export const ArchiveImportConfirmBodySchema = z.object({
  importToken: z.string().uuid(),
});

export const ArchiveImportConfirmResultSchema = z.object({
  filename: z.string(),
  matchedVehicleCount: z.number().int(),
  importedRowCount: z.number().int(),
});
