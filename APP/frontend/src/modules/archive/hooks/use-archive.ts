"use client";

import { useEffect, useMemo } from "react";
import { FN, useDiamondPageAccess, useLegacyOrFunctionalCapability } from "@/modules/functional-rbac";
import { ARCHIVE_MANAGE_PERMISSION } from "../archive.permissions";
import type { ArchiveImportPreview } from "../types/archive-import.types";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import { useArchiveStore } from "../stores/archive.store";
import type { ArchiveRow, ArchiveVehicle } from "../types/archive.types";
import { formatArchiveVehicleLabel } from "../utils/archive-cell-value";

export interface UseArchiveResult {
  vehicles: ArchiveVehicle[];
  vehicleOptions: Array<{ value: string; label: string }>;
  selectedVehicleId: number | null;
  selectedVehicle: ArchiveVehicle | null;
  selectedVehicleHeader: string | null;
  rows: ArchiveRow[];
  isAllowed: boolean;
  canManage: boolean;
  vehiclesLoading: boolean;
  vehiclesReady: boolean;
  vehiclesError: ApiRequestError | null;
  rowsLoading: boolean;
  rowsReady: boolean;
  rowsError: ApiRequestError | null;
  isCreatingRow: boolean;
  createError: ApiRequestError | null;
  deletingRowId: number | null;
  deleteError: ApiRequestError | null;
  savingCells: Record<string, boolean>;
  cellErrors: Record<string, ApiRequestError | null>;
  isExporting: boolean;
  exportError: ApiRequestError | null;
  hasFailedCellEdits: boolean;
  selectVehicle: (vehicleId: number | null) => Promise<void>;
  refreshRows: () => Promise<void>;
  createRow: () => Promise<ArchiveRow | null>;
  deleteRow: (rowId: number) => Promise<boolean>;
  patchCell: ReturnType<typeof useArchiveStore.getState>["patchCell"];
  restoreChargeField: ReturnType<typeof useArchiveStore.getState>["restoreChargeField"];
  clearCellError: ReturnType<typeof useArchiveStore.getState>["clearCellError"];
  exportExcel: ReturnType<typeof useArchiveStore.getState>["exportExcel"];
  clearExportError: ReturnType<typeof useArchiveStore.getState>["clearExportError"];
  canImport: boolean;
  importPreview: ArchiveImportPreview | null;
  importPreviewOpen: boolean;
  isImportPreviewLoading: boolean;
  importPreviewError: ApiRequestError | null;
  isImportConfirming: boolean;
  importConfirmError: ApiRequestError | null;
  importSuccess: boolean;
  previewImportFile: ReturnType<typeof useArchiveStore.getState>["previewImportFile"];
  confirmImport: ReturnType<typeof useArchiveStore.getState>["confirmImport"];
  closeImportPreview: ReturnType<typeof useArchiveStore.getState>["closeImportPreview"];
  syncStatus: ReturnType<typeof useArchiveStore.getState>["syncStatus"];
  isSyncing: boolean;
  syncError: ApiRequestError | null;
  syncResult: ReturnType<typeof useArchiveStore.getState>["syncResult"];
  runArchiveSync: ReturnType<typeof useArchiveStore.getState>["runArchiveSync"];
  dismissSyncResult: ReturnType<typeof useArchiveStore.getState>["dismissSyncResult"];
}

export function useArchive(): UseArchiveResult {
  const vehicles = useArchiveStore((state) => state.vehicles);
  const vehiclesStatus = useArchiveStore((state) => state.vehiclesStatus);
  const vehiclesError = useArchiveStore((state) => state.vehiclesError);
  const selectedVehicleId = useArchiveStore((state) => state.selectedVehicleId);
  const rows = useArchiveStore((state) => state.rows);
  const rowsStatus = useArchiveStore((state) => state.rowsStatus);
  const rowsError = useArchiveStore((state) => state.rowsError);
  const isCreatingRow = useArchiveStore((state) => state.isCreatingRow);
  const createError = useArchiveStore((state) => state.createError);
  const deletingRowId = useArchiveStore((state) => state.deletingRowId);
  const deleteError = useArchiveStore((state) => state.deleteError);
  const savingCells = useArchiveStore((state) => state.savingCells);
  const cellErrors = useArchiveStore((state) => state.cellErrors);
  const loadVehicles = useArchiveStore((state) => state.loadVehicles);
  const selectVehicle = useArchiveStore((state) => state.selectVehicle);
  const refreshRows = useArchiveStore((state) => state.refreshRows);
  const createRow = useArchiveStore((state) => state.createRow);
  const deleteRow = useArchiveStore((state) => state.deleteRow);
  const patchCell = useArchiveStore((state) => state.patchCell);
  const restoreChargeField = useArchiveStore((state) => state.restoreChargeField);
  const clearCellError = useArchiveStore((state) => state.clearCellError);
  const isExporting = useArchiveStore((state) => state.isExporting);
  const exportError = useArchiveStore((state) => state.exportError);
  const exportExcel = useArchiveStore((state) => state.exportExcel);
  const clearExportError = useArchiveStore((state) => state.clearExportError);
  const importPreview = useArchiveStore((state) => state.importPreview);
  const importPreviewOpen = useArchiveStore((state) => state.importPreviewOpen);
  const isImportPreviewLoading = useArchiveStore((state) => state.isImportPreviewLoading);
  const importPreviewError = useArchiveStore((state) => state.importPreviewError);
  const isImportConfirming = useArchiveStore((state) => state.isImportConfirming);
  const importConfirmError = useArchiveStore((state) => state.importConfirmError);
  const importSuccess = useArchiveStore((state) => state.importSuccess);
  const previewImportFile = useArchiveStore((state) => state.previewImportFile);
  const confirmImport = useArchiveStore((state) => state.confirmImport);
  const closeImportPreview = useArchiveStore((state) => state.closeImportPreview);
  const syncStatus = useArchiveStore((state) => state.syncStatus);
  const isSyncing = useArchiveStore((state) => state.isSyncing);
  const syncError = useArchiveStore((state) => state.syncError);
  const syncResult = useArchiveStore((state) => state.syncResult);
  const loadSyncStatus = useArchiveStore((state) => state.loadSyncStatus);
  const runArchiveSync = useArchiveStore((state) => state.runArchiveSync);
  const dismissSyncResult = useArchiveStore((state) => state.dismissSyncResult);

  const isAllowed = useDiamondPageAccess("archive");
  const canManage = useLegacyOrFunctionalCapability(
    ARCHIVE_MANAGE_PERMISSION,
    FN.archive.full,
  );
  const canImport = canManage;

  useEffect(() => {
    if (!isAllowed) return;
    void loadVehicles();
    if (canManage) void loadSyncStatus();
  }, [isAllowed, loadVehicles, canManage, loadSyncStatus]);

  const vehicleOptions = useMemo(
    () =>
      vehicles.map((vehicle) => ({
        value: String(vehicle.id),
        label: formatArchiveVehicleLabel(vehicle.displayName, vehicle.plateNumber),
      })),
    [vehicles],
  );

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null,
    [vehicles, selectedVehicleId],
  );

  const selectedVehicleHeader = selectedVehicle
    ? formatArchiveVehicleLabel(selectedVehicle.displayName, selectedVehicle.plateNumber)
    : null;

  const hasFailedCellEdits = useMemo(
    () => Object.values(cellErrors).some((error) => error !== null),
    [cellErrors],
  );

  return {
    vehicles,
    vehicleOptions,
    selectedVehicleId,
    selectedVehicle,
    selectedVehicleHeader,
    rows,
    isAllowed,
    canManage,
    vehiclesLoading: vehiclesStatus === "loading",
    vehiclesReady: vehiclesStatus === "ready",
    vehiclesError,
    rowsLoading: rowsStatus === "loading",
    rowsReady: rowsStatus === "ready",
    rowsError,
    isCreatingRow,
    createError,
    deletingRowId,
    deleteError,
    savingCells,
    cellErrors,
    selectVehicle,
    refreshRows,
    createRow,
    deleteRow,
    patchCell,
    restoreChargeField,
    clearCellError,
    isExporting,
    exportError,
    hasFailedCellEdits,
    exportExcel,
    clearExportError,
    canImport,
    importPreview,
    importPreviewOpen,
    isImportPreviewLoading,
    importPreviewError,
    isImportConfirming,
    importConfirmError,
    importSuccess,
    previewImportFile,
    confirmImport,
    closeImportPreview,
    syncStatus,
    isSyncing,
    syncError,
    syncResult,
    runArchiveSync,
    dismissSyncResult,
  };
}
