export interface ArchiveImportCellError {
  sheetName: string;
  vehiclePlate: string | null;
  row: number;
  column: string;
  value: string;
  reason: string;
}

export interface ArchiveImportUnmatchedSheet {
  sheetName: string;
  headerText: string | null;
  reason: string;
}

export interface ArchiveImportMatchedVehiclePreview {
  vehicleId: number;
  displayName: string;
  plateNumber: string | null;
  sheetName: string;
  existingRowCount: number;
  importRowCount: number;
}

export interface ArchiveImportPreview {
  filename: string;
  canConfirm: boolean;
  importToken: string | null;
  summary: {
    totalSheets: number;
    matchedVehicleCount: number;
    unmatchedSheetCount: number;
    totalValidRows: number;
    totalErrorCount: number;
  };
  matchedVehicles: ArchiveImportMatchedVehiclePreview[];
  unmatchedSheets: ArchiveImportUnmatchedSheet[];
  errors: ArchiveImportCellError[];
}

export interface ArchiveImportConfirmResult {
  filename: string;
  matchedVehicleCount: number;
  importedRowCount: number;
}
